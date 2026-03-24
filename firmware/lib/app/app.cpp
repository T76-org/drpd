/**
 * @file main.cpp
 * @brief Main application entry point file
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "app.hpp"

#include <FreeRTOS.h>
#include <pico/flash.h>
#include <pico/stdlib.h>
#include <task.h>
#include <tusb.h>

#include "lib/proto/pd_messages/source_capabilities.hpp"


using namespace T76::DRPD;

App::App() : 
    _interpreter(*this),
    _vbusManager(_analogMonitor),
    _ccBusController(_analogMonitor, _ccBusManager, _ccRoleManager, _bmcDecoder, _bmcEncoder, _vbusManager),
    _triggerController(_bmcDecoder, _syncManager) {
}

void App::_onUSBTMCDataReceived(const std::vector<uint8_t> &data, bool transfer_complete) {
    for (const auto &byte : data) {
        _interpreter.processInputCharacter(byte);
    }

    if (transfer_complete) {
        _interpreter.processInputCharacter('\n'); // Finalize the command if transfer is complete
    }
}

void App::_onUSBTMCAbortBulkIn() {
    _interpreter.reset(); // Reset the interpreter state on abort to ensure clean state for next command
}

void App::_onUSBTMCAbortBulkOut() {
    _interpreter.reset(); // Reset the interpreter state on abort to ensure clean state for next command
}

void App::_onUSBTMCClear() {
    _interpreter.reset(); // Reset the interpreter state on clear to ensure clean state for next command
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
            const bool sent = _usbInterface.sendUSBTMCSRQInterrupt(0x40); // Set RQS/MSS bit in status byte
            if (!sent) {
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
