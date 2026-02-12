/**
 * @file sink.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 */

#pragma once

#include <array>
#include <cstdint>
#include <functional>
#include <optional>
#include <span>
#include <vector>

#include <FreeRTOS.h>
#include <queue.h>
#include <task.h>

#include <pico/time.h>

#include "message_sender.hpp"
#include "state_handler.hpp"

#include "../../phy/bmc_decoder.hpp"
#include "../../phy/bmc_encoder.hpp"

#include "../../proto/pd_extended_header.hpp"
#include "../../proto/pd_messages/epr_mode.hpp"
#include "../../proto/pd_messages/epr_source_capabilities.hpp"
#include "../../proto/pd_messages/source_capabilities.hpp"

#include "state_handlers/disconnected.hpp"
#include "state_handlers/epr_keepalive.hpp"
#include "state_handlers/epr_mode_entry.hpp"
#include "state_handlers/ready.hpp"
#include "state_handlers/select_capability.hpp"
#include "state_handlers/transition_sink.hpp"
#include "state_handlers/wait_for_capabilities.hpp"


using namespace T76::DRPD;


namespace T76::DRPD::Logic {

    class CCBusController;
    enum class CCBusState : uint32_t;

    enum class SinkInfoChange : uint32_t {
        PDOListUpdated,
        OtherInfoChanged
    };

    enum class SinkState : uint32_t {
        Unknown = 0xffffffff,
        Disconnected = 0,

        PE_SNK_Startup,
        PE_SNK_Discovery,
        PE_SNK_Wait_for_Capabilities,
        PE_SNK_Evaluate_Capability,
        PE_SNK_Select_Capability,
        PE_SNK_Transition_Sink,
        PE_SNK_Ready,
        PE_SNK_EPR_Mode_Entry,
        PE_SNK_Give_Sink_Cap,
        PE_SNK_Get_Source_Cap,
        PE_SNK_EPR_Keepalive,
        PE_SNK_Hard_Reset,
        PE_SNK_Transition_to_default,

        Error,
    };

    enum class SinkResetType : uint32_t {
        Internal,
        HardReset,
        SoftReset
    };

    class Sink {

        friend class SinkStateHandler;
        friend class DisconnectedStateHandler;
        friend class EPRKeepaliveStateHandler;
        friend class EPRModeEntryStateHandler;
        friend class SelectCapabilityStateHandler;
        friend class ReadySinkStateHandler;
        friend class TransitionSinkStateHandler;
        friend class WaitForCapabilitiesStateHandler;

    public:
        enum class ExtendedControlType : uint8_t {
            EPR_Get_Source_Cap = 0x01,
            EPR_Get_Sink_Cap = 0x02,
            EPR_KeepAlive = 0x03,
            EPR_KeepAlive_Ack = 0x04
        };

        Sink(CCBusController& ccBusController, T76::DRPD::PHY::BMCDecoder& bmcDecoder,
             T76::DRPD::PHY::BMCEncoder& bmcEncoder);
        ~Sink();

        void reset(SinkResetType resetType = SinkResetType::Internal);

        size_t pdoCount() const;
        [[nodiscard]] std::optional<Proto::PDOVariant> pdo(size_t index) const;

        [[nodiscard]] std::optional<Proto::PDOVariant> negotiatedPDO() const;
        float negotiatedVoltage() const;
        float negotiatedCurrent() const;

        bool requestPDO(size_t pdoIndex, uint32_t voltageMV, uint32_t currentMA);
        [[nodiscard]] bool sourceEPRCapable() const;

        SinkState state() const;

        void sinkInfoChanged(std::function<void(SinkInfoChange)> callback);
        [[nodiscard]] std::function<void(SinkInfoChange)> sinkInfoChanged() const;

    protected:
        enum class ExtendedFragmentResult : uint8_t {
            InProgress,
            Complete,
            UnsupportedType,
            Malformed
        };

        struct ExtendedReassemblyState {
            bool active = false; ///< True while chunk reassembly is active
            uint16_t expectedPayloadBytes = 0;                  ///< Expected payload bytes.
            size_t contiguousPayloadBytes = 0;                  ///< Bytes assembled so far.
            uint8_t lastAcceptedChunkNumber = 0;                ///< Last accepted chunk number.
            absolute_time_t lastChunkTimestamp = {0};           ///< Last accepted chunk timestamp.
            std::vector<uint8_t> payload;                       ///< Reassembly payload bytes.
        };

        TaskHandle_t _messagingTaskHandle = nullptr;
        QueueHandle_t _messageQueue = nullptr;

        CCBusController& _ccBusController;
        T76::DRPD::PHY::BMCDecoder& _bmcDecoder;
        T76::DRPD::PHY::BMCEncoder& _bmcEncoder;

        uint32_t _stateChangedCallbackId = 0;

        DisconnectedStateHandler _disconnectedStateHandler;
        EPRKeepaliveStateHandler _eprKeepaliveStateHandler;
        EPRModeEntryStateHandler _eprModeEntryStateHandler;
        ReadySinkStateHandler _readySinkStateHandler;
        SelectCapabilityStateHandler _selectCapabilityStateHandler;
        TransitionSinkStateHandler _transitionSinkStateHandler;
        WaitForCapabilitiesStateHandler _waitForCapabilitiesStateHandler;

        SinkMessageSender _messageSender;

        SinkState _state = SinkState::Unknown;
        SinkStateHandler *_currentStateHandler = nullptr;

        std::function<void(SinkInfoChange)> _sinkInfoChangedCallback;

        std::optional<Proto::SourceCapabilities> _sourceCapabilities = std::nullopt;
        std::optional<Proto::EPRSourceCapabilities> _eprCapabilities = std::nullopt;

        std::optional<Proto::PDOVariant> _pendingRequestedPDO = std::nullopt;
        float _pendingVoltage = 0.0f;
        float _pendingCurrent = 0.0f;

        std::optional<Proto::PDOVariant> _negotiatedPDO = std::nullopt;
        float _negotiatedVoltage = 0.0f;
        float _negotiatedCurrent = 0.0f;

        bool _hasExplicitContract = false;
        bool _eprModeActive = false;
        bool _eprEntryAttempted = false;
        bool _sourceSupportsEpr = false;

        bool _hasLastReceivedMessageId = false;
        uint8_t _lastReceivedMessageId = 0;

        std::array<ExtendedReassemblyState, 32> _extendedReassemblyStates;
        std::array<std::optional<std::vector<uint8_t>>, 32> _completedExtendedPayloads;

        void _setState(SinkState newState);
        SinkState _getState() const;

        void _setSourceCapabilities(const Proto::SourceCapabilities& sourceCapabilities);
        Proto::SourceCapabilities _getSourceCapabilities() const;

        void _setEPRSourceCapabilities(const Proto::EPRSourceCapabilities& sourceCapabilities);
        void _clearEPRSourceCapabilities();

        void _setNegotiatedValues(const Proto::PDOVariant pdoVariant, float voltage, float current);

        void _setEPRModeActive(bool active);

        size_t _totalPDOCount() const;
        std::optional<Proto::PDOVariant> _pdoAtIndex(size_t index) const;
        std::optional<uint8_t> _requestObjectPositionAtIndex(size_t index) const;

        void _onCCBusStateChanged(CCBusState newState);
        void _onMessageReceived(const T76::DRPD::PHY::BMCDecodedMessage *message);

        ExtendedFragmentResult _handleExtendedMessageFragment(
            const T76::DRPD::PHY::BMCDecodedMessage *message,
            Proto::ExtendedMessageType &completedType);

        std::optional<std::vector<uint8_t>> _takeCompletedExtendedPayload(
            Proto::ExtendedMessageType type);

        void _sendNotSupportedMessage();
        void _sendEPRMode(Proto::EPRMode::Action action, uint8_t data = 0);
        void _sendExtendedControlMessage(
            ExtendedControlType controlType,
            bool awaitGoodCRC = true);
        void _sendExtendedChunkRequest(
            Proto::ExtendedMessageType type,
            uint16_t payloadSizeBytes,
            uint8_t chunkNumber);

        void _processTaskHandler();
        void _onMessageSenderStateChanged(SinkMessageSenderState state);
    };

} // namespace T76::DRPD::Logic
