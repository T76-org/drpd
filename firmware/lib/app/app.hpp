/**
 * @file main.cpp
 * @brief Main application entry point file
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#pragma once

#include <stdio.h>
#include <cstdlib>
#include <string>
#include <vector>
#include <array>
#include <atomic>

#include <t76/app.hpp>
#include <t76/scpi_interpreter.hpp>

#include "lib/phy/analog_monitor.hpp"
#include "lib/phy/bmc_decoder.hpp"
#include "lib/phy/bmc_encoder.hpp"
#include "lib/phy/cc_bus_manager.hpp"
#include "lib/phy/cc_role_manager.hpp"
#include "lib/phy/sync_manager.hpp"
#include "lib/phy/vbus_manager.hpp"

#include "lib/logic/cc_bus_controller.hpp"
#include "lib/logic/trigger_controller.hpp"

#include "lib/util/circular_array.hpp"


namespace T76::DRPD {

    /**
     * @brief Compact app-layer snapshot of a decoded CC message.
     *
     * We intentionally avoid storing PHY::BMCDecodedMessage by value in the app
     * queue because that type contains large fixed-size arrays sized for worst
     * case decoding. Keeping only the consumed fields here reduces copy size and
     * makes queue storage scale with actual message size.
     */
    struct CapturedMessage {
        uint64_t startTimestamp = 0;   ///< Message start timestamp in microseconds.
        uint64_t endTimestamp = 0;     ///< Message end timestamp in microseconds.
        PHY::BMCDecodedMessageResult decodingResult = PHY::BMCDecodedMessageResult::Incomplete; ///< Final decode result.
        std::array<uint8_t, 4> sop = {0, 0, 0, 0};   ///< Raw SOP K-codes.
        std::vector<uint16_t> pulseBuffer;   ///< Captured pulse widths (PIO cycles).
        std::vector<uint8_t> data;   ///< Decoded message payload bytes.
    };

    enum class DeviceStatusFlag : uint32_t {
        None                    = 0,        ///< No status bits set
        VBusStatusChanged       = 1 << 0,   ///< VBus Over-Voltage Protection Fault
        RoleChanged             = 1 << 1,   ///< Operation Mode Changed
        CaptureStatusChanged    = 1 << 2,   ///< Message Capture Status Changed
        CCBusStatusChanged      = 1 << 3,   ///< CCBus Controller Status Changed
        TriggerStatusChanged    = 1 << 4,   ///< Trigger Controller Status Changed
        SinkPDOListChanged      = 1 << 5,   ///< Sink PDO List Changed
        SinkStatusChanged       = 1 << 6,   ///< Sink Status Changed
        MessageReceived         = 1 << 7,  ///< New Message Received on CCBus
    };

    // App class implementation

    class App : public T76::Core::App {
    public:

        T76::SCPI::Interpreter<T76::DRPD::App> _interpreter;

        App();

        void _onUSBTMCDataReceived(const std::vector<uint8_t> &data, bool transfer_complete) override;

        void _queryIDN(const std::vector<T76::SCPI::ParameterValue> &params);
        void _resetInstrument(const std::vector<T76::SCPI::ParameterValue> &params);
        void _querySystemError(const std::vector<T76::SCPI::ParameterValue> &params);
        void _querySystemMemory(const std::vector<T76::SCPI::ParameterValue> &params);
        void _querySystemSpeed(const std::vector<T76::SCPI::ParameterValue> &params);
        void _querySystemUptime(const std::vector<T76::SCPI::ParameterValue> &params);
        void _querySystemTimestamp(const std::vector<T76::SCPI::ParameterValue> &params);

        void _measureAllAnalogValues(const std::vector<T76::SCPI::ParameterValue> &);
        void _measureVBusVoltage(const std::vector<T76::SCPI::ParameterValue> &);
        void _measureVBusCurrent(const std::vector<T76::SCPI::ParameterValue> &);
        void _measureDUTCC1Voltage(const std::vector<T76::SCPI::ParameterValue> &);
        void _measureDUTCC2Voltage(const std::vector<T76::SCPI::ParameterValue> &);
        void _measureUSDSCC1Voltage(const std::vector<T76::SCPI::ParameterValue> &);
        void _measureUSDSCC2Voltage(const std::vector<T76::SCPI::ParameterValue> &);
        void _measureADCRefVoltage(const std::vector<T76::SCPI::ParameterValue> &);
        void _measureCurrentRefVoltage(const std::vector<T76::SCPI::ParameterValue> &);
        void _measureGroundRefVoltage(const std::vector<T76::SCPI::ParameterValue> &);
        void _measureAccumulatedValues(const std::vector<T76::SCPI::ParameterValue> &);
        void _resetAccumulatedValues(const std::vector<T76::SCPI::ParameterValue> &);

        void _queryCCBusControllerRole(const std::vector<T76::SCPI::ParameterValue> &);
        void _setCCBusControllerRole(const std::vector<T76::SCPI::ParameterValue> &);
        void _queryCCBusControllerRoleStatus(const std::vector<T76::SCPI::ParameterValue> &);
        void _queryCCBusCaptureCycleTime(const std::vector<T76::SCPI::ParameterValue> &);
        void _queryCCBusCapturedMessageCount(const std::vector<T76::SCPI::ParameterValue> &);
        void _queryCCBusNextCapturedMessage(const std::vector<T76::SCPI::ParameterValue> &);
        void _setCCBusMessageCaptureState(const std::vector<T76::SCPI::ParameterValue> &);
        void _queryCCBusMessageCaptureState(const std::vector<T76::SCPI::ParameterValue> &);
        void _clearCCBusCapturedMessages(const std::vector<T76::SCPI::ParameterValue> &);

        void _queryVBusStatus(const std::vector<T76::SCPI::ParameterValue> &);
        void _resetVBus(const std::vector<T76::SCPI::ParameterValue> &);
        void _setVBusOVPThreshold(const std::vector<T76::SCPI::ParameterValue> &);
        void _queryVBusOVPThreshold(const std::vector<T76::SCPI::ParameterValue> &);
        void _setVBusOCPThreshold(const std::vector<T76::SCPI::ParameterValue> &);
        void _queryVBusOCPThreshold(const std::vector<T76::SCPI::ParameterValue> &);

        void _setVBusManagerState(const std::vector<T76::SCPI::ParameterValue> &params);
        void _queryVBusManagerState(const std::vector<T76::SCPI::ParameterValue> &params);

        void _setCC1Role(const std::vector<T76::SCPI::ParameterValue> &);
        void _queryCC1Role(const std::vector<T76::SCPI::ParameterValue> &);
        void _setCC2Role(const std::vector<T76::SCPI::ParameterValue> &);
        void _queryCC2Role(const std::vector<T76::SCPI::ParameterValue> &);

        void _setDUTChannel(const std::vector<T76::SCPI::ParameterValue> &);
        void _queryDUTChannel(const std::vector<T76::SCPI::ParameterValue> &);
        void _setUSDSChannel(const std::vector<T76::SCPI::ParameterValue> &);
        void _queryUSDSChannel(const std::vector<T76::SCPI::ParameterValue> &);
        void _setCCMuxState(const std::vector<T76::SCPI::ParameterValue> &);
        void _queryCCMuxState(const std::vector<T76::SCPI::ParameterValue> &);

        void _queryDeviceStatus(const std::vector<T76::SCPI::ParameterValue> &);

        void _querySinkAvailablePDOCount(const std::vector<T76::SCPI::ParameterValue> &);
        void _querySinkRequestedPDOAtIndex(const std::vector<T76::SCPI::ParameterValue> &);
        void _setSinkPDO(const std::vector<T76::SCPI::ParameterValue> &);
        void _querySinkStatus(const std::vector<T76::SCPI::ParameterValue> &);
        void _querySinkNegotiatedPDO(const std::vector<T76::SCPI::ParameterValue> &);
        void _querySinkNegotiatedVoltage(const std::vector<T76::SCPI::ParameterValue> &);
        void _querySinkNegotiatedCurrent(const std::vector<T76::SCPI::ParameterValue> &);
        void _querySinkErrorStatus(const std::vector<T76::SCPI::ParameterValue> &);
        
        void _resetTriggerController(const std::vector<T76::SCPI::ParameterValue> &);
        void _queryTriggerControllerStatus(const std::vector<T76::SCPI::ParameterValue> &);
        void _setTriggerEventType(const std::vector<T76::SCPI::ParameterValue> &);
        void _queryTriggerEventType(const std::vector<T76::SCPI::ParameterValue> &);
        void _setTriggerEventThreshold(const std::vector<T76::SCPI::ParameterValue> &);
        void _queryTriggerEventThreshold(const std::vector<T76::SCPI::ParameterValue> &);
        void _setTriggerEventSenderFilter(const std::vector<T76::SCPI::ParameterValue> &);
        void _queryTriggerEventSenderFilter(const std::vector<T76::SCPI::ParameterValue> &);
        void _setTriggerAutoRepeatState(const std::vector<T76::SCPI::ParameterValue> &);
        void _queryTriggerAutoRepeatState(const std::vector<T76::SCPI::ParameterValue> &);
        void _queryTriggerEventCount(const std::vector<T76::SCPI::ParameterValue> &);
        void _setTriggerEventMessageTypeFilter(const std::vector<T76::SCPI::ParameterValue> &);
        void _queryTriggerEventMessageTypeFilter(const std::vector<T76::SCPI::ParameterValue> &);
        void _clearTriggerEventMessageTypeFilter(const std::vector<T76::SCPI::ParameterValue> &);
        void _setSyncOutputMode(const std::vector<T76::SCPI::ParameterValue> &);
        void _querySyncOutputMode(const std::vector<T76::SCPI::ParameterValue> &);
        void _setSyncPulseWidth(const std::vector<T76::SCPI::ParameterValue> &);
        void _querySyncPulseWidth(const std::vector<T76::SCPI::ParameterValue> &);

        uint32_t deviceStatus() const;
        void deviceStatus(DeviceStatusFlag flag);
        void clearStatus();
        
        bool activate();
        void makeSafe();
        const char* getComponentName() const;

    protected:
        std::atomic<uint32_t> _deviceStatusRegister{0};
        std::atomic<bool> _interruptPending{false};
        std::atomic<bool> _captureEnabled{false};  ///< Host-visible message capture gate; does not control Sink policy decode.

        Util::CircularArray<CapturedMessage, APP_RECEIVED_MESSAGE_QUEUE_LENGTH> _receivedMessages; ///< Compact snapshots of received messages; avoids queuing large PHY objects by value.

        PHY::AnalogMonitor _analogMonitor;
        PHY::BMCDecoder _bmcDecoder;
        PHY::BMCEncoder _bmcEncoder;
        PHY::CCBusManager _ccBusManager;
        PHY::CCRoleManager _ccRoleManager;
        PHY::SyncManager _syncManager;
        PHY::VBusManager _vbusManager;
        
        Logic::CCBusController _ccBusController;
        Logic::TriggerController _triggerController;

        void _loop();
        
        void _init();
        void _initCore0();
        void _startCore1();

        void _messageReceivedCallback(const PHY::BMCDecodedMessage &message);
        void _triggerStatusChangedCallback(Logic::TriggerStatus status);
        void _ccBusStateChangedCallback(Logic::CCBusState state);
        void _ccBusRoleChangedCallback(Logic::CCBusRole role);
        void _vbusManagerChangedCallback();
        void _sinkInfoChangedCallback(Logic::SinkInfoChange change);

    }; // class App

}
