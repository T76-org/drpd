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
#include <string_view>
#include <vector>
#include <array>
#include <atomic>
#include <optional>

#include <t76/app.hpp>
#include <t76/scpi_interpreter.hpp>
#include <pico/util/queue.h>

#include "lib/phy/analog_monitor.hpp"
#include "lib/phy/bmc_decoder.hpp"
#include "lib/phy/bmc_encoder.hpp"
#include "lib/phy/cc_bus_manager.hpp"
#include "lib/phy/cc_role_manager.hpp"
#include "lib/phy/sync_manager.hpp"
#include "lib/phy/vbus_manager.hpp"

#include "lib/logic/cc_bus_controller.hpp"
#include "lib/logic/hardware_revision.hpp"
#include "lib/logic/trigger_controller.hpp"

#include "lib/app/status_led.hpp"
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

    struct CapturedEvent {
        uint64_t timestamp = 0;       ///< Event timestamp in microseconds.
        uint32_t eventType = 0;       ///< Firmware-defined event type identifier.
        std::vector<uint8_t> text;    ///< UTF-8 event text bytes.
    };

    enum class CaptureRecordKind : uint8_t {
        Message,    ///< Captured USB-PD message record.
        Event,      ///< Firmware-originated event record.
    };

    struct CaptureRecord {
        CaptureRecordKind kind = CaptureRecordKind::Message;   ///< Record payload discriminator.
        CapturedMessage message;   ///< Message payload when kind is Message.
        CapturedEvent event;       ///< Event payload when kind is Event.
    };

    struct PendingSinkErrorEvent {
        const char *reason = nullptr;       ///< Static Sink error reason.
        Logic::SinkState state = Logic::SinkState::Unknown; ///< Sink state when reported.
        bool hasResetType = false;          ///< True when resetType is meaningful.
        Logic::SinkResetType resetType = Logic::SinkResetType::Internal; ///< Associated reset type.
        Logic::SinkDiagnosticSeverity severity = Logic::SinkDiagnosticSeverity::Error; ///< Diagnostic severity.
    };

    struct PendingSyncTriggerEvent {
        uint64_t timestampUs = 0;       ///< Timestamp captured when the sync trigger fired.
        Logic::TriggerControllerMode triggerMode = Logic::TriggerControllerMode::Off; ///< Trigger mode that fired.
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

        /**
         * @brief Query the cached board hardware revision for SCPI.
         *
         * @param params SCPI parameters supplied by the interpreter, unused.
         */
        void _querySystemHardwareRevision(const std::vector<T76::SCPI::ParameterValue> &params);
        void _enterFirmwareUpdater(const std::vector<T76::SCPI::ParameterValue> &params);

        void _measureAllAnalogValues(const std::vector<T76::SCPI::ParameterValue> &);
        void _measureVBusVoltage(const std::vector<T76::SCPI::ParameterValue> &);
        void _measureVBusCurrent(const std::vector<T76::SCPI::ParameterValue> &);
        void _measureRawVBusCurrent(const std::vector<T76::SCPI::ParameterValue> &);
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
        void _setVBusCalibrationTablePoint(const std::vector<T76::SCPI::ParameterValue> &);
        void _resetVBusCalibration(const std::vector<T76::SCPI::ParameterValue> &);
        void _setVBusCurrentCalibrationPoint(const std::vector<T76::SCPI::ParameterValue> &);
        void _queryVBusCurrentCalibration(const std::vector<T76::SCPI::ParameterValue> &);
        void _setVBusCurrentCalibrationTablePoint(const std::vector<T76::SCPI::ParameterValue> &);
        void _resetVBusCurrentCalibration(const std::vector<T76::SCPI::ParameterValue> &);

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
        void _querySinkCapabilityCount(const std::vector<T76::SCPI::ParameterValue> &);
        void _querySinkCapabilityPDO(const std::vector<T76::SCPI::ParameterValue> &);
        void _setSinkCapabilityPDO(const std::vector<T76::SCPI::ParameterValue> &);
        void _querySinkEPRCapabilityCount(const std::vector<T76::SCPI::ParameterValue> &);
        void _querySinkEPRCapabilityPDO(const std::vector<T76::SCPI::ParameterValue> &);
        void _setSinkEPRCapabilityPDO(const std::vector<T76::SCPI::ParameterValue> &);
        void _querySinkRequestStatus(const std::vector<T76::SCPI::ParameterValue> &);
        void _setSinkEPREntryState(const std::vector<T76::SCPI::ParameterValue> &);
        void _querySinkEPREntryState(const std::vector<T76::SCPI::ParameterValue> &);
        void _setSinkPPSStatusQueryState(const std::vector<T76::SCPI::ParameterValue> &);
        void _querySinkPPSStatusQueryState(const std::vector<T76::SCPI::ParameterValue> &);
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
        static constexpr size_t _winUSBFrameHeaderSize = 12; ///< Encoded WinUSB frame header length in bytes.
        static constexpr uint8_t _winUSBFrameMagic0 = 'W'; ///< First WinUSB frame sync byte.
        static constexpr uint8_t _winUSBFrameMagic1 = 'U'; ///< Second WinUSB frame sync byte.
        static constexpr uint8_t _winUSBFrameVersion = 1; ///< Supported WinUSB frame protocol version.
        static constexpr uint8_t _winUSBStatusFlagSRQPending = 0x01; ///< WinUSB frame status bit for pending SRQ.
        static constexpr int _scpiErrorCommandProtected = -203; ///< Command recognized but disabled by current firmware configuration.
        static constexpr int _scpiErrorExecutionError = -200; ///< Generic SCPI execution error.
        static constexpr int _scpiErrorSettingsConflict = -221; ///< Legal command cannot execute in current state.
        static constexpr int _scpiErrorDataOutOfRange = -222; ///< Numeric data outside supported range.
        static constexpr int _scpiErrorIllegalParameterValue = -224; ///< Parameter value not in legal value set.
        static constexpr int _triggerSCPIErrorInvalidParameter = _scpiErrorIllegalParameterValue; ///< SCPI error code used for invalid trigger parameters.

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
         * @brief Return the WinUSB busy-response payload.
         *
         * @return const std::vector<uint8_t> & Static payload bytes for a busy response.
         */
        static const std::vector<uint8_t> &_winUSBBusyResponse();

        /**
         * @brief Parse one trigger message-type filter token.
         *
         * @param token Raw token string in `CONTROL:<n>` or `DATA:<n>` format.
         * @param filter Output filter populated on success.
         * @return true if parsing succeeded, false otherwise.
         */
        static bool _parseMessageTypeFilterToken(
            const std::string &token,
            Logic::TriggerController::MessageTypeFilter &filter);

        /**
         * @brief Format one trigger message-type filter token.
         *
         * @param filter Filter value to serialize.
         * @return std::string SCPI token representing the filter.
         */
        static std::string _formatMessageTypeFilterToken(
            const Logic::TriggerController::MessageTypeFilter &filter);

        /**
         * @brief Parse one trigger sender-filter token.
         *
         * @param token Raw token string from the host.
         * @return std::optional<Logic::TriggerController::SenderFilter> Parsed sender filter on success.
         */
        static std::optional<Logic::TriggerController::SenderFilter> _parseSenderFilterToken(
            const std::string &token);

        /**
         * @brief Format one trigger sender-filter token.
         *
         * @param filter Sender filter to serialize.
         * @return std::string SCPI token representing the sender filter.
         */
        static std::string _formatSenderFilterToken(
            Logic::TriggerController::SenderFilter filter);

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
         * @brief Reset shared command state for a USBTMC-owned request and release ownership.
         */
        void _resetUSBTMCRequestStateIfOwned();

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
         * @brief Prepare common WinUSB request state before processing one frame.
         *
         * @param tag Correlation tag from the host.
         * @param expectsQuery True when the request expects data rather than an ACK.
         */
        void _prepareWinUSBRequest(uint8_t tag, bool expectsQuery);

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

        /**
         * @brief Static adapter used by StatusLed's FreeRTOS task.
         *
         * @param context App instance pointer.
         * @return StatusLedMode Current app-selected LED mode.
         */
        static StatusLedMode _statusLedModeProvider(void *context);

        /**
         * @brief Select the current status LED mode from app/device state.
         *
         * Priority: OVP/OCP fault, firmware updater pending, no USB host,
         * disabled mode, observer state, then sink state.
         */
        StatusLedMode _statusLedMode();

        /**
         * @brief Return whether the board revision has the GPIO29 status LED.
         *
         * The HardwareRevision enum is ordered by board generation, so this
         * gates the feature to R2605-A and later revisions.
         */
        static bool _supportsStatusLed(Logic::HardwareRevision revision);

        static constexpr uint32_t _captureEventVBusOvp = 1; ///< Firmware event ID for VBUS OVP faults.
        static constexpr uint32_t _captureEventVBusOcp = 2; ///< Firmware event ID for VBUS OCP faults.
        static constexpr uint32_t _captureEventCCBusUnattached = 3; ///< Firmware event ID for CC bus unattached state.
        static constexpr uint32_t _captureEventCCBusSourceFound = 4; ///< Firmware event ID for CC bus source-found state.
        static constexpr uint32_t _captureEventCCBusAttached = 5; ///< Firmware event ID for CC bus attached state.
        static constexpr uint32_t _captureEventCCBusRoleDisabled = 6; ///< Firmware event ID for CC bus disabled role.
        static constexpr uint32_t _captureEventCCBusRoleObserver = 7; ///< Firmware event ID for CC bus observer role.
        static constexpr uint32_t _captureEventCCBusRoleSink = 8; ///< Firmware event ID for CC bus sink role.
        static constexpr uint32_t _captureEventSinkError = 9; ///< Firmware event ID for Sink errors.
        static constexpr uint32_t _captureEventSyncTrigger = 10; ///< Firmware event ID for sync trigger events.
        static constexpr uint32_t _captureEventSinkWarning = 11; ///< Firmware event ID for recoverable Sink warnings.

        std::atomic<uint32_t> _deviceStatusRegister{0};
        std::atomic<bool> _interruptPending{false};
        std::atomic<bool> _captureEnabled{false};  ///< Host-visible message capture gate; does not control Sink policy decode.
        CommandOwner _commandOwner{CommandOwner::None}; ///< Current owner of the shared SCPI interpreter.
        CommandTransport _activeCommandTransport{CommandTransport::USBTMC}; ///< Transport used for the active request/response flow.
        uint8_t _activeWinUSBTag{0}; ///< Correlation tag for the active WinUSB request.
        bool _activeWinUSBQueryRequest{false}; ///< True when the active WinUSB request expects text/binary query data.
        std::atomic<bool> _firmwareUpdaterRebootRequested{false}; ///< True when a WinUSB command ACK should be followed by updater reboot.
        std::string _pendingTextResponse; ///< Accumulates partial text responses until they are terminated.
        std::vector<uint8_t> _winusbRxBuffer; ///< Accumulates raw WinUSB bulk OUT bytes until complete frames are available.
        bool _winusbResponseSent{false}; ///< True when the current WinUSB request has emitted a response frame.
        bool _winusbDataResponseSent{false}; ///< True when the current WinUSB request emitted text or binary data.
        bool _winusbProtocolMismatch{false}; ///< True when request intent and response shape do not match.

        Util::CircularArray<CaptureRecord, APP_RECEIVED_MESSAGE_QUEUE_LENGTH> _captureRecords; ///< Captured messages and firmware-originated events.
        queue_t _sinkErrorEventQueue; ///< Core-1 to core-0 queue for Sink error events.
        queue_t _syncTriggerEventQueue; ///< Core-1 to core-0 queue for sync trigger events.
        std::optional<PendingSyncTriggerEvent> _deferredSyncTriggerEvent; ///< Lookahead event for ordered capture merge.
        uint64_t _lastPublishedOvpEventTimestampUs{0}; ///< Last OVP latch timestamp published as a capture event.
        uint64_t _lastPublishedOcpEventTimestampUs{0}; ///< Last OCP latch timestamp published as a capture event.

        StatusLed _statusLed;
        bool _statusLedSupported{false}; ///< True on R2605-A and later boards with GPIO29 LED hardware.

        PHY::AnalogMonitor _analogMonitor;
        PHY::BMCDecoder _bmcDecoder;
        PHY::BMCEncoder _bmcEncoder;
        PHY::CCBusManager _ccBusManager;
        PHY::CCRoleManager _ccRoleManager;
        PHY::SyncManager _syncManager;
        PHY::VBusManager _vbusManager;
        
        Logic::CCBusController _ccBusController;
        Logic::HardwareRevisionConfig _hardwareRevisionConfig; ///< Cached hardware revision detection.
        Logic::TriggerController _triggerController;

        void _loop();
        
        void _init();
        void _initCore0();
        void _startCore1();

        void _messageReceivedCallback(const PHY::BMCDecodedMessage &message);
        void _publishCaptureEvent(uint32_t eventType, std::string_view text, std::optional<uint64_t> timestamp = std::nullopt);
        uint32_t _ccBusStateCaptureEventType(Logic::CCBusState state) const;
        std::string_view _ccBusStateCaptureEventText(Logic::CCBusState state) const;
        uint32_t _ccBusRoleCaptureEventType(Logic::CCBusRole role) const;
        std::string_view _ccBusRoleCaptureEventText(Logic::CCBusRole role) const;
        void _processSinkErrorEvents();
        void _clearPendingSyncTriggerEvents();
        /**
         * @brief Publish pending sync trigger events that should precede a decoded message.
         *
         * Events whose timestamp falls inside the decoded message interval are
         * deferred until after that message row so the capture stream remains
         * consistent with message-row timestamp ordering.
         *
         * @param messageStartTimestamp Decoded message start timestamp in microseconds.
         * @param messageEndTimestamp Decoded message end timestamp in microseconds.
         */
        void _publishDueSyncTriggerEventsBeforeMessage(
            uint64_t messageStartTimestamp,
            uint64_t messageEndTimestamp);

        /**
         * @brief Publish pending sync trigger events that should follow a decoded message.
         *
         * @param messageEndTimestamp Decoded message end timestamp in microseconds.
         */
        void _publishDueSyncTriggerEventsAfterMessage(uint64_t messageEndTimestamp);

        /**
         * @brief Return the next queued sync trigger event, including deferred lookahead.
         *
         * @return std::optional<PendingSyncTriggerEvent> Pending event when available.
         */
        std::optional<PendingSyncTriggerEvent> _nextSyncTriggerEvent();

        /**
         * @brief Defer a sync trigger event that belongs later in the capture stream.
         *
         * @param event Event to retain as one-item lookahead.
         */
        void _deferSyncTriggerEvent(PendingSyncTriggerEvent event);

        void _triggerStatusChangedCallback(Logic::TriggerStatus status);
        void _triggerFiredCallback(Logic::TriggerControllerMode mode);
        void _ccBusStateChangedCallback(Logic::CCBusState state);
        void _ccBusRoleChangedCallback(Logic::CCBusRole role);
        void _vbusManagerChangedCallback();
        void _sinkInfoChangedCallback(Logic::SinkInfoChange change);
        void _sinkErrorCallback(const Logic::SinkErrorEvent& event);

        /**
         * @brief Export persisted slices from each owner and save them to flash.
         *
         * This is called after runtime configuration changes have been accepted
         * so the flash store tracks the latest owner-managed settings.
         */
        void _savePersistentConfig();

    }; // class App

}
