/**
 * @file main.cpp
 * @brief Main application entry point file
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "app.hpp"

#include <algorithm>

#include <FreeRTOS.h>
#include <hardware/watchdog.h>
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
    queue_init(&_sinkErrorEventQueue, sizeof(PendingSinkErrorEvent), LOGIC_SINK_MESSAGE_QUEUE_LENGTH);
    queue_init(&_syncTriggerEventQueue, sizeof(PendingSyncTriggerEvent), LOGIC_SINK_MESSAGE_QUEUE_LENGTH);
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
        if (_firmwareUpdaterRebootRequested.load(std::memory_order_acquire)) {
            sleep_ms(150);
            watchdog_reboot(0, 0, 10);
        }
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
    if (_statusLedSupported) {
        _statusLed.makeSafe();
    }
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
        _processSinkErrorEvents();

        if (_interruptPending.exchange(false, std::memory_order_acq_rel)) {
            if (!_sendTransportNotification()) {
                _interruptPending.store(true, std::memory_order_release);
            }
        }
        
        vPortYield(); // Yield to other tasks, especially the USB task to ensure responsiveness
    }
}

void App::_initCore0() {
    _hardwareRevisionConfig.init();
    const Logic::HardwareRevision hardwareRevision = _hardwareRevisionConfig.revision();
    _statusLedSupported = _supportsStatusLed(hardwareRevision);
    if (_statusLedSupported) {
        _statusLed.init();
    }

    _bmcEncoder.outputMode(
        hardwareRevision == Logic::HardwareRevision::R2605A
            ? PHY::BMCEncoderOutputMode::SinglePinWithEnable
            : PHY::BMCEncoderOutputMode::DualPinLegacy
    );
    _analogMonitor.init();
    _analogMonitor.applyPersistentConfig(PersistentConfig::instance().current().analogMonitor);
    _ccBusController.init();
    _bmcDecoder.initCore0();
    _vbusManager.applyPersistentConfig(PersistentConfig::instance().current().vbus);
    _syncManager.applyPersistentConfig(PersistentConfig::instance().current().sync);
    _triggerController.applyPersistentConfig(PersistentConfig::instance().current().trigger);
    _ccBusController.applySinkPersistentConfig(PersistentConfig::instance().current().sink);
    _bmcDecoder.messageReceivedCallbackCore0(std::bind(&App::_messageReceivedCallback, this, std::placeholders::_1));
    _ccBusController.addStateChangedCallback(std::bind(&App::_ccBusStateChangedCallback, this, std::placeholders::_1));
    _ccBusController.addRoleChangedCallback(std::bind(&App::_ccBusRoleChangedCallback, this, std::placeholders::_1));
    _ccBusController.sinkInfoChanged(std::bind(&App::_sinkInfoChangedCallback, this, std::placeholders::_1));
    _ccBusController.sinkErrorOccurred(std::bind(&App::_sinkErrorCallback, this, std::placeholders::_1));
    _vbusManager.managerChangedCallback(std::bind(&App::_vbusManagerChangedCallback, this));
    _triggerController.statusChangedCallback(std::bind(&App::_triggerStatusChangedCallback, this, std::placeholders::_1));
    _triggerController.triggerFiredCallback(std::bind(&App::_triggerFiredCallback, this, std::placeholders::_1));
    if (_statusLedSupported) {
        _statusLed.start(&App::_statusLedModeProvider, this);
    }

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

StatusLedMode App::_statusLedModeProvider(void *context) {
    return static_cast<App *>(context)->_statusLedMode();
}

StatusLedMode App::_statusLedMode() {
    const PHY::VBusState vbusState = _vbusManager.state();
    if (vbusState == PHY::VBusState::OverVoltage || vbusState == PHY::VBusState::OverCurrent) {
        return StatusLedMode::Fault;
    }

    if (_firmwareUpdaterRebootRequested.load(std::memory_order_acquire)) {
        return StatusLedMode::FirmwareUpdaterPending;
    }

    if (!_usbInterface.mounted()) {
        return StatusLedMode::NoHost;
    }

    const Logic::CCBusRole role = _ccBusController.role();
    const Logic::CCBusState state = _ccBusController.state();

    switch (role) {
        case Logic::CCBusRole::Disabled:
            return StatusLedMode::Disabled;

        case Logic::CCBusRole::Observer:
            return state == Logic::CCBusState::Attached
                ? StatusLedMode::ObserverAttached
                : StatusLedMode::ObserverNotAttached;

        case Logic::CCBusRole::Sink: {
            Logic::Sink *sink = _ccBusController.sink();
            if (sink == nullptr) {
                return StatusLedMode::SinkNotConnected;
            }

            const Logic::SinkState sinkState = sink->state();
            if (sinkState == Logic::SinkState::Error) {
                return StatusLedMode::SinkError;
            }

            if (state != Logic::CCBusState::Attached || sinkState == Logic::SinkState::Disconnected) {
                return StatusLedMode::SinkNotConnected;
            }

            if (sinkState == Logic::SinkState::PE_SNK_Ready ||
                sinkState == Logic::SinkState::PE_SNK_EPR_Keepalive) {
                return StatusLedMode::SinkConnected;
            }

            return StatusLedMode::SinkNegotiating;
        }
    }

    return StatusLedMode::Disabled;
}

bool App::_supportsStatusLed(Logic::HardwareRevision revision) {
    return static_cast<uint32_t>(revision) >= static_cast<uint32_t>(Logic::HardwareRevision::R2605A);
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

    const uint64_t messageStartTimestamp = captured.startTimestamp;
    const uint64_t messageEndTimestamp = captured.endTimestamp;
    _publishDueSyncTriggerEventsBeforeMessage(messageStartTimestamp, messageEndTimestamp);

    // Store the captured message for later retrieval
    CaptureRecord record;
    record.kind = CaptureRecordKind::Message;
    record.message = std::move(captured);
    _captureRecords.push(std::move(record));
    deviceStatus(DeviceStatusFlag::MessageReceived);

    _publishDueSyncTriggerEventsAfterMessage(messageEndTimestamp);
}

void App::_publishCaptureEvent(uint32_t eventType, std::string_view text, std::optional<uint64_t> timestamp) {
    CaptureRecord record;
    record.kind = CaptureRecordKind::Event;
    record.event.timestamp = timestamp.value_or(time_us_64());
    record.event.eventType = eventType;
    record.event.text.assign(text.begin(), text.end());
    _captureRecords.push(std::move(record));
    deviceStatus(DeviceStatusFlag::MessageReceived);
}

uint32_t App::_ccBusStateCaptureEventType(Logic::CCBusState state) const {
    switch (state) {
        case Logic::CCBusState::Unattached:
            return _captureEventCCBusUnattached;
        case Logic::CCBusState::SourceFound:
            return _captureEventCCBusSourceFound;
        case Logic::CCBusState::Attached:
            return _captureEventCCBusAttached;
        default:
            return _captureEventCCBusUnattached;
    }
}

std::string_view App::_ccBusStateCaptureEventText(Logic::CCBusState state) const {
    switch (state) {
        case Logic::CCBusState::Unattached:
            return "Device status changed to UNATTACHED";
        case Logic::CCBusState::SourceFound:
            return "Device status changed to SOURCE_FOUND";
        case Logic::CCBusState::Attached:
            return "Device status changed to ATTACHED";
        default:
            return "Device status changed to UNKNOWN";
    }
}

uint32_t App::_ccBusRoleCaptureEventType(Logic::CCBusRole role) const {
    switch (role) {
        case Logic::CCBusRole::Disabled:
            return _captureEventCCBusRoleDisabled;
        case Logic::CCBusRole::Observer:
            return _captureEventCCBusRoleObserver;
        case Logic::CCBusRole::Sink:
            return _captureEventCCBusRoleSink;
        default:
            return _captureEventCCBusRoleDisabled;
    }
}

std::string_view App::_ccBusRoleCaptureEventText(Logic::CCBusRole role) const {
    switch (role) {
        case Logic::CCBusRole::Disabled:
            return "CC role changed to DISABLED";
        case Logic::CCBusRole::Observer:
            return "CC role changed to OBSERVER";
        case Logic::CCBusRole::Sink:
            return "CC role changed to SINK";
        default:
            return "CC role changed to UNKNOWN";
    }
}

void App::_processSinkErrorEvents() {
    PendingSinkErrorEvent event{};
    while (queue_try_remove(&_sinkErrorEventQueue, &event)) {
        std::string text = "Sink error: ";
        text += event.reason != nullptr ? event.reason : "Unknown error";
        _publishCaptureEvent(_captureEventSinkError, text);
        deviceStatus(DeviceStatusFlag::SinkStatusChanged);
    }
}

void App::_publishDueSyncTriggerEventsBeforeMessage(uint64_t messageStartTimestamp, uint64_t messageEndTimestamp) {
    while (true) {
        auto event = _nextSyncTriggerEvent();
        if (!event.has_value()) {
            return;
        }

        if (event->timestampUs >= messageStartTimestamp) {
            _deferSyncTriggerEvent(*event);
            return;
        }

        _publishCaptureEvent(_captureEventSyncTrigger, "Sync trigger", event->timestampUs);
    }
}

void App::_publishDueSyncTriggerEventsAfterMessage(uint64_t messageEndTimestamp) {
    while (true) {
        auto event = _nextSyncTriggerEvent();
        if (!event.has_value()) {
            return;
        }

        if (event->timestampUs > messageEndTimestamp) {
            _deferSyncTriggerEvent(*event);
            return;
        }

        _publishCaptureEvent(_captureEventSyncTrigger, "Sync trigger", event->timestampUs);
    }
}

std::optional<PendingSyncTriggerEvent> App::_nextSyncTriggerEvent() {
    if (_deferredSyncTriggerEvent.has_value()) {
        auto event = _deferredSyncTriggerEvent;
        _deferredSyncTriggerEvent.reset();
        return event;
    }

    PendingSyncTriggerEvent event{};
    if (!queue_try_remove(&_syncTriggerEventQueue, &event)) {
        return std::nullopt;
    }

    return event;
}

void App::_deferSyncTriggerEvent(PendingSyncTriggerEvent event) {
    _deferredSyncTriggerEvent = event;
}

void App::_triggerStatusChangedCallback(Logic::TriggerStatus status) {
    // Signal that the trigger controller status has changed
    deviceStatus(DeviceStatusFlag::TriggerStatusChanged);
}

void App::_triggerFiredCallback(Logic::TriggerControllerMode mode) {
    const PendingSyncTriggerEvent event{
        .timestampUs = time_us_64(),
        .triggerMode = mode,
    };
    (void)queue_try_add(&_syncTriggerEventQueue, &event);
}

void App::_ccBusStateChangedCallback(Logic::CCBusState state) {
    // Signal that the CC bus controller state has changed
    deviceStatus(DeviceStatusFlag::CCBusStatusChanged);
    _publishCaptureEvent(_ccBusStateCaptureEventType(state), _ccBusStateCaptureEventText(state));
}

void App::_ccBusRoleChangedCallback(Logic::CCBusRole role) {
    // Signal that the CC bus controller role has changed
    deviceStatus(DeviceStatusFlag::RoleChanged);
    _publishCaptureEvent(_ccBusRoleCaptureEventType(role), _ccBusRoleCaptureEventText(role));
}

void App::_vbusManagerChangedCallback() {
    // Signal that the VBUS manager state or settings have changed
    deviceStatus(DeviceStatusFlag::VBusStatusChanged);

    const PHY::VBusState state = _vbusManager.state();

    if (state == PHY::VBusState::OverVoltage) {
        const uint64_t timestampUs = _vbusManager.lastOvpEventTimestampUs();
        if (timestampUs != 0 && timestampUs != _lastPublishedOvpEventTimestampUs) {
            _lastPublishedOvpEventTimestampUs = timestampUs;
            _publishCaptureEvent(_captureEventVBusOvp, "VBUS OVP event", timestampUs);
        }
        return;
    }

    if (state == PHY::VBusState::OverCurrent) {
        const uint64_t timestampUs = _vbusManager.lastOcpEventTimestampUs();
        if (timestampUs != 0 && timestampUs != _lastPublishedOcpEventTimestampUs) {
            _lastPublishedOcpEventTimestampUs = timestampUs;
            _publishCaptureEvent(_captureEventVBusOcp, "VBUS OCP event", timestampUs);
        }
    }
}

void App::_sinkInfoChangedCallback(Logic::SinkInfoChange change) {
    // Signal that the Sink info has changed

    if (change == Logic::SinkInfoChange::PDOListUpdated) {
        deviceStatus(DeviceStatusFlag::SinkPDOListChanged);
        return;
    }

    deviceStatus(DeviceStatusFlag::SinkStatusChanged);
}

void App::_sinkErrorCallback(const Logic::SinkErrorEvent& event) {
    const PendingSinkErrorEvent pendingEvent{
        .reason = event.reason,
        .state = event.state,
        .hasResetType = event.resetType.has_value(),
        .resetType = event.resetType.value_or(Logic::SinkResetType::Internal),
    };
    (void)queue_try_add(&_sinkErrorEventQueue, &pendingEvent);
}

void App::_savePersistentConfig() {
    auto &config = PersistentConfig::instance();
    config.update([this](PersistentConfigDataCurrent &data) {
        data.vbus = _vbusManager.exportPersistentConfig();
        data.analogMonitor = _analogMonitor.exportPersistentConfig();
        data.trigger = _triggerController.exportPersistentConfig();
        data.sync = _syncManager.exportPersistentConfig();
        data.sink = _ccBusController.exportSinkPersistentConfig();
    });
    (void)config.save();
}

} // namespace T76::DRPD
