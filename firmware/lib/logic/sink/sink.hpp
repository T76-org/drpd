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
#include "sink_context.hpp"
#include "sink_runtime_state.hpp"
#include "state_handler.hpp"
#include "sink_types.hpp"

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

    class Sink {

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
        SinkRuntimeState _runtimeState;
        std::function<void(SinkInfoChange)> _sinkInfoChangedCallback;
        SinkContext _context;

        void _onCCBusStateChanged(CCBusState newState);
        void _onMessageReceived(const T76::DRPD::PHY::BMCDecodedMessage *message);

        ExtendedFragmentResult _handleExtendedMessageFragment(
            const T76::DRPD::PHY::BMCDecodedMessage *message,
            Proto::ExtendedMessageType &completedType);
        void _sendExtendedChunkRequest(
            Proto::ExtendedMessageType type,
            uint16_t payloadSizeBytes,
            uint8_t chunkNumber);

        void _processTaskHandler();
        void _onMessageSenderStateChanged(SinkMessageSenderState state);
    };

} // namespace T76::DRPD::Logic
