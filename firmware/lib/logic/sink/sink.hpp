/**
 * @file sink.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 *
 * This header defines the top-level Sink policy engine orchestrator.
 *
 * Sink owns the protocol-facing runtime resources (decoder/encoder hooks,
 * FreeRTOS queue/task, sender state machine) and composes a set of per-state
 * handler classes implementing USB-PD Sink policy behavior.
 *
 * Core design points:
 * - `SinkRuntimeState` stores mutable protocol/session state.
 * - `SinkContext` exposes the controlled API handlers use to read/mutate that
 *   state and perform protocol actions.
 * - State handlers implement focused policy logic for one PD policy state each.
 *
 * Public API in this class is intentionally host-facing and read-mostly
 * (`pdoCount`, `pdo`, negotiated values, request entrypoint). Internal policy
 * transitions and message dispatch remain encapsulated behind protected methods.
 */

#pragma once

#include <atomic>
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

    /**
     * @brief Top-level Sink policy engine orchestration class.
     */
    class Sink {

    public:
        /**
         * @brief Extended control message subtypes used by sink-side helpers.
         */
        enum class ExtendedControlType : uint8_t {
            EPR_Get_Source_Cap = 0x01,    ///< Request EPR source capabilities.
            EPR_Get_Sink_Cap = 0x02,      ///< Request EPR sink capabilities.
            EPR_KeepAlive = 0x03,         ///< Send/receive keepalive.
            EPR_KeepAlive_Ack = 0x04      ///< Acknowledge keepalive.
        };

        /**
         * @brief Construct a Sink policy engine.
         * @param ccBusController CC bus controller dependency.
         * @param bmcDecoder BMC decoder used for incoming messages.
         * @param bmcEncoder BMC encoder used for GoodCRC and outgoing messages.
         */
        Sink(CCBusController& ccBusController, T76::DRPD::PHY::BMCDecoder& bmcDecoder,
             T76::DRPD::PHY::BMCEncoder& bmcEncoder);

        /**
         * @brief Destroy Sink and release runtime resources/tasks.
         */
        ~Sink();

        /**
         * @brief Reset policy engine and protocol state.
         * @param resetType Reset behavior to perform.
         */
        void reset(SinkResetType resetType = SinkResetType::Internal);

        /**
         * @brief Enable Sink processing and subscribe runtime callbacks.
         */
        void enable();

        /**
         * @brief Disable Sink processing and unsubscribe runtime callbacks.
         */
        void disable();

        /**
         * @brief Get whether Sink processing is enabled.
         * @return True when enabled; otherwise false.
         */
        [[nodiscard]] bool enabled() const;

        /**
         * @brief Get count of active PDO view entries.
         * @return Number of visible PDO entries.
         */
        size_t pdoCount() const;

        /**
         * @brief Get PDO at active-view index.
         * @param index Zero-based index in active view.
         * @return PDO variant if valid; otherwise std::nullopt.
         */
        [[nodiscard]] std::optional<Proto::PDOVariant> pdo(size_t index) const;

        /**
         * @brief Get negotiated PDO.
         * @return Negotiated PDO if contract exists; otherwise std::nullopt.
         */
        [[nodiscard]] std::optional<Proto::PDOVariant> negotiatedPDO() const;

        /**
         * @brief Get negotiated voltage.
         * @return Negotiated voltage value.
         */
        float negotiatedVoltage() const;

        /**
         * @brief Get negotiated current.
         * @return Negotiated current value.
         */
        float negotiatedCurrent() const;

        /**
         * @brief Request a new PDO contract.
         * @param pdoIndex Zero-based PDO index in active view.
         * @param voltageMV Requested voltage in millivolts.
         * @param currentMA Requested current in milliamps.
         * @return True if request was accepted for dispatch; otherwise false.
         */
        bool requestPDO(size_t pdoIndex, uint32_t voltageMV, uint32_t currentMA);

        /**
         * @brief Check if source advertises EPR capability.
         * @return True if EPR capable source is currently cached.
         */
        [[nodiscard]] bool sourceEPRCapable() const;

        /**
         * @brief Get current Sink policy state.
         * @return Current SinkState enum.
         */
        SinkState state() const;

        /**
         * @brief Register sink info changed callback.
         * @param callback Callback invoked for sink info changes.
         */
        void sinkInfoChanged(std::function<void(SinkInfoChange)> callback);

        /**
         * @brief Get current sink info changed callback.
         * @return Registered callback (may be empty).
         */
        [[nodiscard]] std::function<void(SinkInfoChange)> sinkInfoChanged() const;

    protected:
        /**
         * @brief Results of processing an extended-message fragment.
         */
        enum class ExtendedFragmentResult : uint8_t {
            InProgress,         ///< More chunks required.
            Complete,           ///< Full payload reassembled.
            UnsupportedType,    ///< Message type not supported.
            Malformed           ///< Fragment/header invalid.
        };

        TaskHandle_t _messagingTaskHandle = nullptr;             ///< FreeRTOS sink message processing task.
        QueueHandle_t _messageQueue = nullptr;                   ///< Queue of decoded message pointers.

        CCBusController& _ccBusController;                       ///< CC bus controller dependency.
        T76::DRPD::PHY::BMCDecoder& _bmcDecoder;                ///< Decoder for incoming PD messages.
        T76::DRPD::PHY::BMCEncoder& _bmcEncoder;                ///< Encoder for GoodCRC responses.

        uint32_t _stateChangedCallbackId = 0;                   ///< Registered CC-bus callback id.

        DisconnectedStateHandler _disconnectedStateHandler;      ///< Disconnected state handler.
        EPRKeepaliveStateHandler _eprKeepaliveStateHandler;      ///< EPR keepalive state handler.
        EPRModeEntryStateHandler _eprModeEntryStateHandler;      ///< EPR mode entry state handler.
        ReadySinkStateHandler _readySinkStateHandler;            ///< Ready state handler.
        SelectCapabilityStateHandler _selectCapabilityStateHandler; ///< Select capability handler.
        TransitionSinkStateHandler _transitionSinkStateHandler;  ///< Transition sink handler.
        WaitForCapabilitiesStateHandler _waitForCapabilitiesStateHandler; ///< Wait-for-capabilities handler.

        SinkMessageSender _messageSender;                        ///< Outbound message sender with GoodCRC tracking.
        SinkRuntimeState _runtimeState;                          ///< Mutable sink runtime state.
        std::function<void(SinkInfoChange)> _sinkInfoChangedCallback; ///< Sink info change callback.
        SinkContext _context;                                    ///< Handler-facing context facade.
        std::atomic<bool> _enabled = false;                      ///< True when callbacks are subscribed.

        /**
         * @brief Handle CC bus state changes.
         * @param newState New CC bus state.
         */
        void _onCCBusStateChanged(CCBusState newState);

        /**
         * @brief Handle decoded incoming PD message and enqueue for processing.
         * @param message Decoded incoming message pointer.
         */
        void _onMessageReceived(const T76::DRPD::PHY::BMCDecodedMessage *message);

        /**
         * @brief Handle/reassemble one extended message fragment.
         * @param message Incoming decoded message fragment.
         * @param completedType Output extended type when payload completes.
         * @return Fragment handling result.
         */
        ExtendedFragmentResult _handleExtendedMessageFragment(
            const T76::DRPD::PHY::BMCDecodedMessage *message,
            Proto::ExtendedMessageType &completedType);

        /**
         * @brief Send extended chunk request for next fragment.
         * @param type Extended message type being requested.
         * @param payloadSizeBytes Total expected payload size in bytes.
         * @param chunkNumber Next chunk number to request.
         */
        void _sendExtendedChunkRequest(
            Proto::ExtendedMessageType type,
            uint16_t payloadSizeBytes,
            uint8_t chunkNumber);

        /**
         * @brief FreeRTOS task loop that dispatches queued messages to active handler.
         */
        void _processTaskHandler();

        /**
         * @brief Handle message sender state transitions.
         * @param state New sender state.
         */
        void _onMessageSenderStateChanged(SinkMessageSenderState state);
    };

} // namespace T76::DRPD::Logic
