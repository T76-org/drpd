/**
 * @file sink.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 *
 * This header defines the top-level Sink policy engine orchestrator.
 *
 * Sink owns the protocol-facing runtime resources (decoder/encoder hooks,
 * core-1 queues/pump loop, sender state machine) and composes a set of
 * per-state handler classes implementing USB-PD Sink policy behavior.
 *
 * Core design points:
 * - `SinkRuntimeState` stores mutable protocol/session state.
 * - `SinkContext` exposes the controlled API handlers use to read/mutate that
 *   state and perform protocol actions.
 * - State handlers implement focused policy logic for one PD policy state each.
 * - Sink timers are created through `SinkAlarmService`, which owns a dedicated
 *   alarm pool initialized from Core 1.
 * - Timer callbacks do not directly execute policy transitions; they enqueue
 *   `SinkTimeoutEvent` items that are consumed during the core-1 pump.
 * - GoodCRC transmit when receiving a Source message is intentionally immediate
 *   in the Core-1 receive path to satisfy protocol timing constraints.
 *
 * Core split in this module:
 * - Core 1 (bare-metal path): receives decoded PD messages via
 *   `Sink::_onMessageReceived(...)`, sends immediate GoodCRC acknowledgements,
 *   and hosts the Sink-owned alarm pool used for timeout scheduling.
 * - Core 1 (policy path): runs `Sink::loopCore1()`, executes state handler
 *   policy transitions, and consumes queued timeout events.
 * - Boundary rule: Core-1-facing callbacks should do minimal, timing-critical
 *   work only; policy mutations and reset/transition decisions are handled
 *   from the core-1 pump.
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

#include <pico/time.h>
#include <pico/util/queue.h>

#include "message_sender.hpp"
#include "sink_alarm_service.hpp"
#include "inquiry_reassembly.hpp"
#include "sink_context.hpp"
#include "sink_runtime_state.hpp"
#include "state_handler.hpp"
#include "sink_types.hpp"

#include "../../util/persistent_config.hpp"

#include "../../phy/bmc_decoder.hpp"
#include "../../phy/bmc_encoder.hpp"

#include "../../proto/pd_extended_header.hpp"
#include "../../proto/pd_messages/epr_mode.hpp"
#include "../../proto/pd_messages/epr_source_capabilities.hpp"
#include "../../proto/pd_messages/source_capabilities.hpp"

#include "state_handlers/disconnected.hpp"
#include "state_handlers/discovery.hpp"
#include "state_handlers/epr_keepalive.hpp"
#include "state_handlers/epr_mode_exit.hpp"
#include "state_handlers/epr_mode_entry.hpp"
#include "state_handlers/get_pps_status.hpp"
#include "state_handlers/inquiry.hpp"
#include "state_handlers/ready.hpp"
#include "state_handlers/send_response.hpp"
#include "state_handlers/send_soft_reset.hpp"
#include "state_handlers/select_capability.hpp"
#include "state_handlers/startup.hpp"
#include "state_handlers/transition_sink.hpp"
#include "state_handlers/transition_to_default.hpp"
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
         * @brief Destroy Sink and release runtime resources.
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
         * @brief Initialize Sink Core-1 owned resources.
         */
        void initCore1();

        /**
         * @brief Run one Sink policy iteration from the Core-1 loop.
         */
        void loopCore1();

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
         * @brief Get count of configured local SPR Sink capability PDOs.
         */
        [[nodiscard]] size_t localSinkCapabilityCount() const;

        /**
         * @brief Get configured local SPR Sink capability PDO.
         */
        [[nodiscard]] std::optional<uint32_t> localSinkCapabilityPDO(size_t index) const;

        /**
         * @brief Set or clear a configured local SPR Sink capability PDO.
         */
        bool setLocalSinkCapabilityPDO(size_t index, uint32_t rawPDO);

        /**
         * @brief Get count of configured local EPR-only Sink capability PDOs.
         */
        [[nodiscard]] size_t localEPRSinkCapabilityCount() const;

        /**
         * @brief Get configured local EPR-only Sink capability PDO.
         */
        [[nodiscard]] std::optional<uint32_t> localEPRSinkCapabilityPDO(size_t index) const;

        /**
         * @brief Set or clear a configured local EPR-only Sink capability PDO.
         */
        bool setLocalEPRSinkCapabilityPDO(size_t index, uint32_t rawPDO);

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
         * @return Request result describing acceptance or immediate rejection.
         */
        SinkRequestResult requestPDO(size_t pdoIndex, uint32_t voltageMV, uint32_t currentMA);

        /**
         * @brief Get status for the most recent Sink PDO request.
         * @return Last request status snapshot.
         */
        [[nodiscard]] SinkRequestStatus lastRequestStatus() const;
        SinkRequestResult requestInquiry(
            SinkInquiryType type,
            SinkInquiryParameters parameters = {});
        [[nodiscard]] SinkInquiryResult lastInquiryResult() const;

        /**
         * @brief Set whether local policy allows automatic EPR entry.
         * @param enabled True to allow EPR entry after an eligible SPR contract.
         */
        void eprEntryEnabled(bool enabled);

        /**
         * @brief Get whether local policy allows automatic EPR entry.
         * @return True when EPR entry is enabled.
         */
        [[nodiscard]] bool eprEntryEnabled() const;

        /**
         * @brief Set whether local policy sends Get_PPS_Status after SPR PPS transitions.
         * @param enabled True to query Source PPS status after SPR PPS PS_RDY.
         */
        void ppsStatusQueryEnabled(bool enabled);

        /**
         * @brief Get whether local policy sends Get_PPS_Status after SPR PPS transitions.
         * @return True when PPS status queries are enabled.
         */
        [[nodiscard]] bool ppsStatusQueryEnabled() const;

        /**
         * @brief Apply persisted Sink policy settings.
         * @param config Persisted Sink settings.
         */
        void applyPersistentConfig(const T76::DRPD::SinkPersistentConfig& config);

        /**
         * @brief Export current Sink policy settings for persistence.
         * @return Current Sink persistent settings.
         */
        [[nodiscard]] T76::DRPD::SinkPersistentConfig exportPersistentConfig() const;

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

        /**
         * @brief Register sink error callback.
         * @param callback Callback invoked for Sink-originated errors.
         */
        void sinkErrorOccurred(SinkErrorCallback callback);

        /**
         * @brief Get current sink error callback.
         * @return Registered callback (may be empty).
         */
        [[nodiscard]] SinkErrorCallback sinkErrorOccurred() const;

    protected:
        /**
         * @brief Results of processing an extended-message fragment.
         */
        enum class ExtendedFragmentResult : uint8_t {
            InProgress,         ///< More chunks required.
            Complete,           ///< Full payload reassembled.
            UnsupportedType,    ///< Message type not supported.
            UnsupportedChunk,   ///< Unsupported message chunk needs delayed Not_Supported.
            RecoveredMalformed, ///< Known malformed encoding was safely recovered.
            TooLarge,           ///< Declared inquiry response exceeds bounded storage.
            Malformed           ///< Fragment/header invalid.
        };

        /**
         * @brief Core-1-dispatched host PDO request envelope.
         */
        struct PendingPDORequest {
            size_t pdoIndex = 0;
            uint32_t voltageMV = 0;
            uint32_t currentMA = 0;
        };

        queue_t _messageQueue;                                   ///< Queue of decoded message pointers.
        queue_t _timeoutEventQueue;                              ///< Queue of timer timeout events.
        queue_t _pendingRequestQueue;                            ///< Queue of host PDO requests for core-1 dispatch.
        queue_t _pendingInquiryQueue;                            ///< Queue of host inquiry requests for core-1 dispatch.

        CCBusController& _ccBusController;                       ///< CC bus controller dependency.
        T76::DRPD::PHY::BMCDecoder& _bmcDecoder;                ///< Decoder for incoming PD messages.
        T76::DRPD::PHY::BMCEncoder& _bmcEncoder;                ///< Encoder for GoodCRC responses.

        uint32_t _stateChangedCallbackId = 0;                   ///< Registered CC-bus callback id.

        DisconnectedStateHandler _disconnectedStateHandler;      ///< Disconnected state handler.
        DiscoveryStateHandler _discoveryStateHandler;            ///< Discovery state handler.
        EPRKeepaliveStateHandler _eprKeepaliveStateHandler;      ///< EPR keepalive state handler.
        EPRModeExitStateHandler _eprModeExitStateHandler;        ///< EPR mode exit state handler.
        EPRModeEntryStateHandler _eprModeEntryStateHandler;      ///< EPR mode entry state handler.
        GetPPSStatusStateHandler _getPPSStatusStateHandler;      ///< PPS status query state handler.
        InquiryStateHandler _inquiryStateHandler;                ///< Host inquiry state handler.
        ReadySinkStateHandler _readySinkStateHandler;            ///< Ready state handler.
        SendResponseStateHandler _sendResponseStateHandler;      ///< Ready response state handler.
        SendSoftResetStateHandler _sendSoftResetStateHandler;    ///< Send Soft Reset state handler.
        SelectCapabilityStateHandler _selectCapabilityStateHandler; ///< Select capability handler.
        StartupStateHandler _startupStateHandler;                ///< Startup state handler.
        TransitionSinkStateHandler _transitionSinkStateHandler;  ///< Transition sink handler.
        TransitionToDefaultStateHandler _transitionToDefaultStateHandler; ///< Transition-to-default handler.
        WaitForCapabilitiesStateHandler _waitForCapabilitiesStateHandler; ///< Wait-for-capabilities handler.

        SinkAlarmService _alarmService;                        ///< Core-1 owned Sink alarm pool wrapper.
        SinkMessageSender _messageSender;                        ///< Outbound message sender with GoodCRC tracking.
        SinkRuntimeState _runtimeState;                          ///< Mutable sink runtime state.
        std::function<void(SinkInfoChange)> _sinkInfoChangedCallback; ///< Sink info change callback.
        SinkErrorCallback _sinkErrorCallback;                    ///< Sink error event callback.
        std::function<void(SinkTimeoutEvent)> _timeoutEventCallback; ///< Timeout event callback.
        SinkContext _context;                                    ///< Handler-facing context facade.
        std::atomic<bool> _enabled = false;                      ///< True when callbacks are subscribed.
        std::atomic<bool> _ccBusResetPending = false;            ///< Core-0 state-change reset request latched for core 1.
        std::atomic<bool> _ccBusDetachObserved = false;          ///< Detach edge preserved if state callbacks coalesce.
        std::atomic<bool> _eprExitPending = false;               ///< Core-0 request asking Core 1 to exit active EPR mode.
        std::atomic<uint32_t> _nextInquiryId = 1;                ///< Monotonic host inquiry identifier.
        std::atomic<bool> _inquiryQueued = false;                ///< Host inquiry awaits policy dispatch.
        alarm_id_t _chunkingNotSupportedAlarmId = -1;            ///< Delay before Not_Supported for unsupported chunks.
        bool _chunkingNotSupportedPending = false;               ///< True while delayed Not_Supported is still applicable.
        InquiryExtendedReassembly<LOGIC_SINK_MAX_EXTENDED_PAYLOAD_BYTES> _inquiryReassembly;

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
        ExtendedFragmentResult _handleInquiryExtendedFragment(
            const T76::DRPD::PHY::BMCDecodedMessage *message);

        /**
         * @brief Apply protocol message-discarding rules before handling a received SOP.
         */
        void _discardPendingOutgoingForReceivedSOP();

        /**
         * @brief Send extended chunk request for next fragment.
         * @param type Extended message type being requested.
         * @param payloadSizeBytes Total expected payload size in bytes.
         * @param chunkNumber Next chunk number to request.
         */
        void _sendExtendedChunkRequest(
            Proto::ExtendedMessageType type,
            uint16_t payloadSizeBytes,
            uint8_t chunkNumber,
            Proto::SOP::SOPType sopTarget);

        /**
         * @brief Start ChunkingNotSupportedTimer before responding Not_Supported.
         */
        void _startChunkingNotSupportedTimer();

        /**
         * @brief Static callback for ChunkingNotSupportedTimer expiry.
         * @param id Alarm id.
         * @param userData Pointer to Sink instance.
         * @return 0 to keep timer one-shot.
         */
        static int64_t _onChunkingNotSupportedTimeout(alarm_id_t id, void *userData);

        /**
         * @brief Drain pending timeout events and dispatch in core-1 policy context.
         */
        void _processTimeoutEvents();

        /**
         * @brief Drain host PDO requests and dispatch in core-1 policy context.
         */
        void _processPendingRequests();

        /**
         * @brief Drain host policy requests and dispatch in core-1 policy context.
         */
        void _processPendingPolicyRequests();
        void _processPendingInquiries();

        /**
         * @brief Handle message sender state transitions.
         * @param state New sender state.
         */
        void _onMessageSenderStateChanged(
            SinkMessageSenderState state, Proto::SOP::SOPType sopTarget);

        /**
         * @brief Handle sender state transitions in Sink policy context.
         * @param state New sender state.
         *
         * This remains separate from `_onMessageSenderStateChanged()` because
         * timeout states are first queued, then replayed from policy context.
         * Calling `_onMessageSenderStateChanged()` directly from timeout-event
         * dequeue would re-enqueue the same timeout and create a loop.
         */
        void _handleMessageSenderStateChangedPolicyContext(SinkMessageSenderState state);

        /**
         * @brief Enqueue timeout event from asynchronous callback context.
         * @param event Timeout event to enqueue.
         */
        void _enqueueTimeoutEvent(SinkTimeoutEvent event);
    };

} // namespace T76::DRPD::Logic
