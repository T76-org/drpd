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
#include "lib/util/persistent_config.hpp"


namespace T76::DRPD {

    enum class CommandTransport : uint8_t {
        USBTMC,
        WinUSB,
    };

    enum class CommandOwner : uint8_t {
        None,
        USBTMC,
        WinUSB,
    };

    enum class WinUSBFrameType : uint8_t {
        CommandRequest = 0x01,
        SessionResetRequest = 0x02,
        QueryRequest = 0x03,
        CommandAck = 0x80,
        TextResponse = 0x81,
        BinaryResponse = 0x82,
        ErrorResponse = 0x83,
        SessionResetAck = 0x84,
        Notification = 0x90,
    };

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
        void _onWinUSBBulkDataReceived(const std::vector<uint8_t> &data) override;

        void _onUSBTMCAbortBulkIn() override;
        void _onUSBTMCAbortBulkOut() override;
        void _onUSBTMCClear() override;

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
        void _setVBusCalibrationPoint(const std::vector<T76::SCPI::ParameterValue> &);
        void _queryVBusCalibration(const std::vector<T76::SCPI::ParameterValue> &);
        void _resetVBusCalibration(const std::vector<T76::SCPI::ParameterValue> &);

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
        /**
         * @brief Format an analog floating-point value for SCPI responses.
         *
         * Values are truncated to two decimal places before formatting to keep
         * response output stable across analog-related SCPI commands.
         *
         * @param value Analog value to format.
         * @return std::string Two-decimal SCPI-ready string representation.
         */
        static std::string _formatAnalogValue(float value);

        /**
         * @brief Process raw SCPI input bytes from the active command transport.
         *
         * @param data Command payload bytes to feed into the interpreter.
         * @param transferComplete True when the current command is complete and
         * should be finalized with a newline.
         */
        void _processSCPIInput(const std::vector<uint8_t> &data, bool transferComplete);

        /**
         * @brief Queue a text response on the currently active command transport.
         *
         * @param data UTF-8 response fragment to append.
         * @param addNewline True to terminate and flush the response.
         */
        void _sendTransportTextResponse(const std::string &data, bool addNewline = true);

        /**
         * @brief Queue a binary response on the currently active command transport.
         *
         * @param data Raw binary response bytes, including any SCPI block framing.
         */
        void _sendTransportBinaryResponse(const std::vector<uint8_t> &data);

        /**
         * @brief Notify the host that asynchronous status is available.
         */
        bool _sendTransportNotification();

        /**
         * @brief Reset per-transport command parsing and response state.
         */
        void _resetCommandState();

        /**
         * @brief Reset WinUSB session state and acknowledge the reset request.
         *
         * @param tag Correlation tag supplied by the host.
         */
        void _resetWinUSBSession(uint8_t tag);

        /**
         * @brief Parse and dispatch any complete WinUSB frames in the RX buffer.
         */
        void _drainWinUSBRxBuffer();

        /**
         * @brief Process a complete WinUSB request payload using explicit host
         * request intent and emit the matching completion frame.
         *
         * @param payload Raw SCPI command payload bytes.
         * @param expectsQuery True when the host sent a query request frame.
         */
        void _processWinUSBRequest(const std::vector<uint8_t> &payload, bool expectsQuery);

        /**
         * @brief Try to claim exclusive ownership of the shared SCPI interpreter.
         *
         * @param owner Transport requesting ownership.
         * @return true if the owner now holds the interpreter, false otherwise.
         */
        bool _tryAcquireCommandOwner(CommandOwner owner);

        /**
         * @brief Release interpreter ownership when held by the given transport.
         *
         * @param owner Transport releasing ownership.
         */
        void _releaseCommandOwner(CommandOwner owner);

        /**
         * @brief Send a WinUSB bulk response frame.
         *
         * @param type Frame type to emit.
         * @param tag Correlation tag for the request.
         * @param payload Frame payload bytes.
         */
        void _sendWinUSBFrame(WinUSBFrameType type, uint8_t tag, const std::vector<uint8_t> &payload);

        /**
         * @brief Read a little-endian 32-bit integer from a byte buffer.
         *
         * @param data Backing byte buffer.
         * @param offset Offset of the first byte to read.
         * @return uint32_t Parsed 32-bit value.
         */
        static uint32_t _readLE32(const std::vector<uint8_t> &data, size_t offset);

        std::atomic<uint32_t> _deviceStatusRegister{0};
        std::atomic<bool> _interruptPending{false};
        std::atomic<bool> _captureEnabled{false};  ///< Host-visible message capture gate; does not control Sink policy decode.
        CommandOwner _commandOwner{CommandOwner::None}; ///< Current owner of the shared SCPI interpreter.
        CommandTransport _activeCommandTransport{CommandTransport::USBTMC}; ///< Transport used for the active request/response flow.
        uint8_t _activeWinUSBTag{0}; ///< Correlation tag for the active WinUSB request.
        bool _activeWinUSBQueryRequest{false}; ///< True when the active WinUSB request expects text/binary query data.
        std::string _pendingTextResponse; ///< Accumulates partial text responses until they are terminated.
        std::vector<uint8_t> _winusbRxBuffer; ///< Accumulates raw WinUSB bulk OUT bytes until complete frames are available.
        bool _winusbResponseSent{false}; ///< True when the current WinUSB request has emitted a response frame.
        bool _winusbDataResponseSent{false}; ///< True when the current WinUSB request emitted text or binary data.
        bool _winusbProtocolMismatch{false}; ///< True when request intent and response shape do not match.

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

        /**
         * @brief Export persisted slices from each owner and save them to flash.
         *
         * This is called after runtime configuration changes have been accepted
         * so the flash store tracks the latest owner-managed settings.
         */
        void _savePersistentConfig();

    }; // class App

}
