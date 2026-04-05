/**
 * @file main.cpp
 * @brief Main application entry point file
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "app.hpp"

#include <algorithm>

#include <FreeRTOS.h>
#include <pico/flash.h>
#include <pico/stdlib.h>
#include <task.h>
#include <tusb.h>

#include "lib/proto/pd_messages/source_capabilities.hpp"

namespace T76::DRPD {

const std::vector<uint8_t> &App::_winUSBBusyResponse() {
    static const std::vector<uint8_t> response = {
        'D', 'e', 'v', 'i', 'c', 'e', ' ', 'b', 'u', 's', 'y'
    };
    return response;
}

App::App() : 
    _interpreter(*this),
    _vbusManager(_analogMonitor),
    _ccBusController(_analogMonitor, _ccBusManager, _ccRoleManager, _bmcDecoder, _bmcEncoder, _vbusManager),
    _triggerController(_bmcDecoder, _syncManager) {
}

void App::_onUSBTMCDataReceived(const std::vector<uint8_t> &data, bool transfer_complete) {
    if (!_tryAcquireCommandOwner(CommandOwner::USBTMC)) {
        return;
    }

    _activeCommandTransport = CommandTransport::USBTMC;
    _activeWinUSBTag = 0;
    _activeWinUSBQueryRequest = false;
    _pendingTextResponse.clear();
    _winusbResponseSent = false;
    _winusbDataResponseSent = false;
    _winusbProtocolMismatch = false;
    _processSCPIInput(data, transfer_complete);

    if (transfer_complete) {
        _releaseCommandOwner(CommandOwner::USBTMC);
    }
}

void App::_onWinUSBBulkDataReceived(const std::vector<uint8_t> &data) {
    _winusbRxBuffer.insert(_winusbRxBuffer.end(), data.begin(), data.end());
    _drainWinUSBRxBuffer();
}

void App::_processSCPIInput(const std::vector<uint8_t> &data, bool transfer_complete) {
    for (const auto &byte : data) {
        _interpreter.processInputCharacter(byte);
    }

    if (transfer_complete) {
        _interpreter.processInputCharacter('\n'); // Finalize the command if transfer is complete
    }
}

void App::_onUSBTMCAbortBulkIn() {
    _resetUSBTMCRequestStateIfOwned();
}

void App::_onUSBTMCAbortBulkOut() {
    _resetUSBTMCRequestStateIfOwned();
}

void App::_onUSBTMCClear() {
    _resetUSBTMCRequestStateIfOwned();
}

void App::_sendTransportTextResponse(const std::string &data, bool addNewline) {
    if (_activeCommandTransport == CommandTransport::USBTMC) {
        _usbInterface.sendUSBTMCBulkData(data, addNewline);
        return;
    }

    if (!_activeWinUSBQueryRequest) {
        _winusbProtocolMismatch = true;
        return;
    }

    _pendingTextResponse += data;
    if (!addNewline) {
        return;
    }

    _pendingTextResponse.push_back('\n');
    std::vector<uint8_t> payload(_pendingTextResponse.begin(), _pendingTextResponse.end());
    _sendWinUSBFrame(WinUSBFrameType::TextResponse, _activeWinUSBTag, payload);
    _pendingTextResponse.clear();
    _winusbResponseSent = true;
    _winusbDataResponseSent = true;
}

void App::_sendTransportBinaryResponse(const std::vector<uint8_t> &data) {
    if (_activeCommandTransport == CommandTransport::USBTMC) {
        _usbInterface.sendUSBTMCBulkData(data);
        return;
    }

    if (!_activeWinUSBQueryRequest) {
        _winusbProtocolMismatch = true;
        return;
    }

    _sendWinUSBFrame(WinUSBFrameType::BinaryResponse, _activeWinUSBTag, data);
    _winusbResponseSent = true;
    _winusbDataResponseSent = true;
}

bool App::_sendTransportNotification() {
    return _usbInterface.sendUSBTMCSRQInterrupt(0x40); // Set RQS/MSS bit in status byte
}

void App::_resetUSBTMCRequestStateIfOwned() {
    if (_commandOwner == CommandOwner::WinUSB) {
        return;
    }

    _resetCommandState();
    _releaseCommandOwner(CommandOwner::USBTMC);
}

void App::_resetCommandState() {
    _interpreter.reset();
    _pendingTextResponse.clear();
    _winusbRxBuffer.clear();
    _winusbResponseSent = false;
    _winusbDataResponseSent = false;
    _winusbProtocolMismatch = false;
}

void App::_resetWinUSBSession(uint8_t tag) {
    if (!_tryAcquireCommandOwner(CommandOwner::WinUSB)) {
        _sendWinUSBFrame(WinUSBFrameType::ErrorResponse, tag, _winUSBBusyResponse());
        return;
    }

    _activeCommandTransport = CommandTransport::WinUSB;
    _activeWinUSBTag = tag;
    _activeWinUSBQueryRequest = false;
    _resetCommandState();
    _sendWinUSBFrame(WinUSBFrameType::SessionResetAck, tag, {});
    _releaseCommandOwner(CommandOwner::WinUSB);
}

void App::_prepareWinUSBRequest(uint8_t tag, bool expectsQuery) {
    _activeCommandTransport = CommandTransport::WinUSB;
    _activeWinUSBTag = tag;
    _activeWinUSBQueryRequest = expectsQuery;
    _pendingTextResponse.clear();
}

uint32_t App::_readLE32(const std::vector<uint8_t> &data, size_t offset) {
    return static_cast<uint32_t>(data[offset]) |
           (static_cast<uint32_t>(data[offset + 1]) << 8) |
           (static_cast<uint32_t>(data[offset + 2]) << 16) |
           (static_cast<uint32_t>(data[offset + 3]) << 24);
}

void App::_sendWinUSBFrame(WinUSBFrameType type, uint8_t tag, const std::vector<uint8_t> &payload) {
    std::vector<uint8_t> frame(_winUSBFrameHeaderSize + payload.size(), 0);
    frame[0] = _winUSBFrameMagic0;
    frame[1] = _winUSBFrameMagic1;
    frame[2] = _winUSBFrameVersion;
    frame[3] = static_cast<uint8_t>(type);
    frame[4] = tag;
    frame[5] = deviceStatus() != 0u ? _winUSBStatusFlagSRQPending : 0u;
    const uint32_t payloadLength = static_cast<uint32_t>(payload.size());
    frame[8] = static_cast<uint8_t>(payloadLength & 0xff);
    frame[9] = static_cast<uint8_t>((payloadLength >> 8) & 0xff);
    frame[10] = static_cast<uint8_t>((payloadLength >> 16) & 0xff);
    frame[11] = static_cast<uint8_t>((payloadLength >> 24) & 0xff);
    std::copy(payload.begin(), payload.end(), frame.begin() + static_cast<std::ptrdiff_t>(_winUSBFrameHeaderSize));

    _usbInterface.sendWinUSBBulkData(frame);
}

void App::_drainWinUSBRxBuffer() {
    while (_winusbRxBuffer.size() >= _winUSBFrameHeaderSize) {
        if (_winusbRxBuffer[0] != _winUSBFrameMagic0 ||
            _winusbRxBuffer[1] != _winUSBFrameMagic1 ||
            _winusbRxBuffer[2] != _winUSBFrameVersion) {
            _resetCommandState();
            return;
        }

        const WinUSBFrameType type = static_cast<WinUSBFrameType>(_winusbRxBuffer[3]);
        const uint8_t tag = _winusbRxBuffer[4];
        const uint32_t payloadLength = _readLE32(_winusbRxBuffer, 8);
        const size_t frameLength = _winUSBFrameHeaderSize + payloadLength;

        if (_winusbRxBuffer.size() < frameLength) {
            return;
        }

        std::vector<uint8_t> payload(
            _winusbRxBuffer.begin() + static_cast<std::ptrdiff_t>(_winUSBFrameHeaderSize),
            _winusbRxBuffer.begin() + static_cast<std::ptrdiff_t>(frameLength)
        );
        _winusbRxBuffer.erase(
            _winusbRxBuffer.begin(),
            _winusbRxBuffer.begin() + static_cast<std::ptrdiff_t>(frameLength)
        );

        switch (type) {
            case WinUSBFrameType::CommandRequest:
                if (!_tryAcquireCommandOwner(CommandOwner::WinUSB)) {
                    _sendWinUSBFrame(WinUSBFrameType::ErrorResponse, tag, _winUSBBusyResponse());
                    break;
                }
                _prepareWinUSBRequest(tag, false);
                _processWinUSBRequest(payload, false);
                _releaseCommandOwner(CommandOwner::WinUSB);
                break;

            case WinUSBFrameType::QueryRequest:
                if (!_tryAcquireCommandOwner(CommandOwner::WinUSB)) {
                    _sendWinUSBFrame(WinUSBFrameType::ErrorResponse, tag, _winUSBBusyResponse());
                    break;
                }
                _prepareWinUSBRequest(tag, true);
                _processWinUSBRequest(payload, true);
                _releaseCommandOwner(CommandOwner::WinUSB);
                break;

            case WinUSBFrameType::SessionResetRequest:
                _resetWinUSBSession(tag);
                break;

            default:
                _activeCommandTransport = CommandTransport::WinUSB;
                _activeWinUSBTag = tag;
                _pendingTextResponse.clear();
                _sendWinUSBFrame(
                    WinUSBFrameType::ErrorResponse,
                    tag,
                    std::vector<uint8_t>{'U', 'n', 's', 'u', 'p', 'p', 'o', 'r', 't', 'e', 'd', ' ', 'f', 'r', 'a', 'm', 'e'}
                );
                break;
        }
    }
}

void App::_processWinUSBRequest(const std::vector<uint8_t> &payload, bool expectsQuery) {
    _winusbResponseSent = false;
    _winusbDataResponseSent = false;
    _winusbProtocolMismatch = false;

    _processSCPIInput(payload, true);

    if (!_interpreter.errorQueue.empty()) {
        const std::string error = _interpreter.errorQueue.front();
        _interpreter.errorQueue.pop();
        const std::vector<uint8_t> errorPayload(error.begin(), error.end());
        _sendWinUSBFrame(WinUSBFrameType::ErrorResponse, _activeWinUSBTag, errorPayload);
        _winusbResponseSent = true;
        return;
    }

    if (_winusbProtocolMismatch) {
        static const std::vector<uint8_t> commandProducedDataResponse = {
            'C', 'o', 'm', 'm', 'a', 'n', 'd', ' ', 'r', 'e', 'q', 'u', 'e', 's', 't', ' ',
            'p', 'r', 'o', 'd', 'u', 'c', 'e', 'd', ' ', 'd', 'a', 't', 'a', ' ', 'r', 'e',
            's', 'p', 'o', 'n', 's', 'e'
        };
        _sendWinUSBFrame(WinUSBFrameType::ErrorResponse, _activeWinUSBTag, commandProducedDataResponse);
        _winusbResponseSent = true;
        return;
    }

    if (_winusbResponseSent && expectsQuery && _winusbDataResponseSent) {
        return;
    }

    if (!expectsQuery) {
        _sendWinUSBFrame(WinUSBFrameType::CommandAck, _activeWinUSBTag, {});
        _winusbResponseSent = true;
        return;
    }

    static const std::vector<uint8_t> missingQueryResponse = {
        'M', 'i', 's', 's', 'i', 'n', 'g', ' ', 'q', 'u', 'e', 'r', 'y', ' ',
        'r', 'e', 's', 'p', 'o', 'n', 's', 'e'
    };
    _sendWinUSBFrame(WinUSBFrameType::ErrorResponse, _activeWinUSBTag, missingQueryResponse);
    _winusbResponseSent = true;
}

bool App::_tryAcquireCommandOwner(CommandOwner owner) {
    if (_commandOwner == CommandOwner::None || _commandOwner == owner) {
        _commandOwner = owner;
        return true;
    }

    return false;
}

void App::_releaseCommandOwner(CommandOwner owner) {
    if (_commandOwner == owner) {
        _commandOwner = CommandOwner::None;
    }
}

bool App::activate() {
    return true;
}

void App::makeSafe() {
    // Currently does nothing
}

const char* App::getComponentName() const {
    return "App";
}



void App::_init() {
    stdio_init_all();
    PersistentConfig::instance().init();
}

void App::_loop() {
    while (true) {
        _analogMonitor.readVBusValues();

        if (_interruptPending.exchange(false, std::memory_order_acq_rel)) {
            if (!_sendTransportNotification()) {
                _interruptPending.store(true, std::memory_order_release);
            }
        }
        
        vPortYield(); // Yield to other tasks, especially the USB task to ensure responsiveness
    }
}

void App::_initCore0() {
    _analogMonitor.init();
    _analogMonitor.applyPersistentConfig(PersistentConfig::instance().current().analogMonitor);
    _ccBusController.init();
    _bmcDecoder.initCore0();
    _vbusManager.applyPersistentConfig(PersistentConfig::instance().current().vbus);
    _syncManager.applyPersistentConfig(PersistentConfig::instance().current().sync);
    _triggerController.applyPersistentConfig(PersistentConfig::instance().current().trigger);
    _bmcDecoder.messageReceivedCallbackCore0(std::bind(&App::_messageReceivedCallback, this, std::placeholders::_1));
    _ccBusController.addStateChangedCallback(std::bind(&App::_ccBusStateChangedCallback, this, std::placeholders::_1));
    _ccBusController.addRoleChangedCallback(std::bind(&App::_ccBusRoleChangedCallback, this, std::placeholders::_1));
    _ccBusController.sinkInfoChanged(std::bind(&App::_sinkInfoChangedCallback, this, std::placeholders::_1));
    _vbusManager.managerChangedCallback(std::bind(&App::_vbusManagerChangedCallback, this));
    _triggerController.statusChangedCallback(std::bind(&App::_triggerStatusChangedCallback, this, std::placeholders::_1));

    xTaskCreate(
        [](void *param) {
            static_cast<App *>(param)->_loop();
        },
        "AppLoop",
        1024,
        this,
        tskIDLE_PRIORITY + 1,
        nullptr
    );
}

void App::_startCore1() {
    _ccBusController.initCore1();
    _bmcDecoder.initCore1();
    _bmcDecoder.enabled(true);
    _bmcEncoder.initCore1();
    _vbusManager.initCore1();

    for(;;) {
        // Give PersistentConfig a chance to park core 1 in RAM before any
        // flash erase/program operation so XIP is not used concurrently.
        PersistentConfig::instance().serviceCore1FlashWriteHandshake();
        T76::Core::Safety::feedWatchdogFromCore1();
        _bmcDecoder.loopCore1();
        _bmcEncoder.loopCore1();
        _ccBusController.loopCore1();
    }
}

void App::_messageReceivedCallback(const PHY::BMCDecodedMessage &message) {
    if (!_captureEnabled.load(std::memory_order_relaxed)) {
        return;
    }

    CapturedMessage captured;

    captured.startTimestamp = message.startTimestamp();
    captured.endTimestamp = message.endTimestamp();
    captured.decodingResult = message.decodingResult();

    const uint8_t* sop = message.sop();
    for (size_t i = 0; i < captured.sop.size(); ++i) {
        captured.sop[i] = sop[i];
    }

    std::span<const uint16_t> pulseBuffer = message.pulseBuffer();
    captured.pulseBuffer.assign(pulseBuffer.begin(), pulseBuffer.end());

    std::span<const uint8_t> data = message.data();
    captured.data.assign(data.begin(), data.end());

    // Store the captured message for later retrieval
    _receivedMessages.push(std::move(captured));
    deviceStatus(DeviceStatusFlag::MessageReceived);
}

void App::_triggerStatusChangedCallback(Logic::TriggerStatus status) {
    // Signal that the trigger controller status has changed
    deviceStatus(DeviceStatusFlag::TriggerStatusChanged);
}

void App::_ccBusStateChangedCallback(Logic::CCBusState state) {
    // Signal that the CC bus controller state has changed
    deviceStatus(DeviceStatusFlag::CCBusStatusChanged);
}

void App::_ccBusRoleChangedCallback(Logic::CCBusRole role) {
    // Signal that the CC bus controller role has changed
    deviceStatus(DeviceStatusFlag::RoleChanged);
}

void App::_vbusManagerChangedCallback() {
    // Signal that the VBUS manager state or settings have changed
    deviceStatus(DeviceStatusFlag::VBusStatusChanged);
}

void App::_sinkInfoChangedCallback(Logic::SinkInfoChange change) {
    // Signal that the Sink info has changed

    if (change == Logic::SinkInfoChange::PDOListUpdated) {
        deviceStatus(DeviceStatusFlag::SinkPDOListChanged);
        return;
    }

    deviceStatus(DeviceStatusFlag::SinkStatusChanged);
}

void App::_savePersistentConfig() {
    auto &config = PersistentConfig::instance();
    config.update([this](PersistentConfigDataCurrent &data) {
        data.vbus = _vbusManager.exportPersistentConfig();
        data.analogMonitor = _analogMonitor.exportPersistentConfig();
        data.trigger = _triggerController.exportPersistentConfig();
        data.sync = _syncManager.exportPersistentConfig();
    });
    (void)config.save();
}

} // namespace T76::DRPD
