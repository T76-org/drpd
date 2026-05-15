/**
 * @file sink_context.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * This header defines `SinkContext`, the shared policy context consumed by all
 * Sink state handlers.
 *
 * `SinkContext` centralizes:
 * - policy transitions/reset logic,
 * - capability and negotiated-value cache updates,
 * - request/index mapping helpers for active capability view,
 * - protocol send helpers used across handlers.
 *
 * By putting this logic in one class, handlers avoid direct coupling to `Sink`
 * internals and can be reasoned about as pure policy modules operating on a
 * constrained API surface.
 */

#pragma once

#include <functional>
#include <optional>
#include <span>

#include <pico/time.h>

#include "sink_alarm_service.hpp"
#include "message_sender.hpp"
#include "sink_runtime_state.hpp"
#include "sink_types.hpp"

#include "../../phy/bmc_decoder.hpp"
#include "../../phy/bmc_encoder.hpp"
#include "../../proto/pd_message_types.hpp"
#include "../../proto/pd_messages/control.hpp"
#include "../../proto/pd_messages/epr_mode.hpp"
#include "../../proto/pd_messages/epr_source_capabilities.hpp"
#include "../../proto/pd_messages/manufacturer_info.hpp"
#include "../../proto/pd_messages/revision.hpp"
#include "../../proto/pd_messages/sink_capabilities.hpp"
#include "../../proto/pd_messages/sink_capabilities_extended.hpp"
#include "../../proto/pd_messages/source_capabilities.hpp"


namespace T76::DRPD::Logic {

    class CCBusController;
    enum class CCBusState : uint32_t;

    class DisconnectedStateHandler;
    class EPRKeepaliveStateHandler;
    class EPRModeExitStateHandler;
    class EPRModeEntryStateHandler;
    class GetPPSStatusStateHandler;
    class ReadySinkStateHandler;
    class SendSoftResetStateHandler;
    class SelectCapabilityStateHandler;
    class TransitionSinkStateHandler;
    class WaitForCapabilitiesStateHandler;

    /**
     * @brief Concrete context shared with Sink state handlers.
     *
     * This class owns policy-side operations and mutable runtime state access
     * needed by handlers, while keeping orchestration dependencies localized
     * to one object.
     *
     * Timer callbacks may run outside the Sink policy loop; handlers therefore use
     * `enqueueTimeoutEvent()` to hand work back to Sink via a callback instead
     * of taking a direct dependency on Sink internals or queue storage.
     */
    class SinkContext {
    public:
        /**
         * @brief Construct a SinkContext with runtime state, transport, and handlers.
         * @param runtimeState Shared sink runtime state storage.
         * @param messageSender PD message sender used for protocol responses/requests.
         * @param ccBusController CC bus controller used to query attach state on reset.
         * @param disconnectedStateHandler Handler instance for Disconnected state.
         * @param eprKeepaliveStateHandler Handler instance for EPR Keepalive state.
         * @param eprModeEntryStateHandler Handler instance for EPR Mode Entry state.
         * @param readySinkStateHandler Handler instance for Ready state.
         * @param sendSoftResetStateHandler Handler instance for Send Soft Reset state.
         * @param selectCapabilityStateHandler Handler instance for Select Capability state.
         * @param transitionSinkStateHandler Handler instance for Transition Sink state.
         * @param waitForCapabilitiesStateHandler Handler instance for Wait for Capabilities state.
         * @param sinkInfoChangedCallback Callback used to notify host-visible sink info changes.
         * @param enqueueTimeoutEventCallback Callback used to enqueue timeout
         *        events to the Sink policy loop context.
         */
        SinkContext(
            SinkRuntimeState& runtimeState,
            SinkAlarmService& alarmService,
            SinkMessageSender& messageSender,
            CCBusController& ccBusController,
            DisconnectedStateHandler& disconnectedStateHandler,
            EPRKeepaliveStateHandler& eprKeepaliveStateHandler,
            EPRModeExitStateHandler& eprModeExitStateHandler,
            EPRModeEntryStateHandler& eprModeEntryStateHandler,
            GetPPSStatusStateHandler& getPPSStatusStateHandler,
            ReadySinkStateHandler& readySinkStateHandler,
            SendSoftResetStateHandler& sendSoftResetStateHandler,
            SelectCapabilityStateHandler& selectCapabilityStateHandler,
            TransitionSinkStateHandler& transitionSinkStateHandler,
            WaitForCapabilitiesStateHandler& waitForCapabilitiesStateHandler,
            std::function<void(SinkInfoChange)>& sinkInfoChangedCallback,
            std::function<void(SinkTimeoutEvent)>& enqueueTimeoutEventCallback);

        /**
         * @brief Access mutable runtime state.
         * @return Mutable reference to shared Sink runtime state.
         */
        SinkRuntimeState& runtimeState();

        /**
         * @brief Access immutable runtime state.
         * @return Const reference to shared Sink runtime state.
         */
        const SinkRuntimeState& runtimeState() const;

        /**
         * @brief Transition to a new Sink policy state and enter its handler.
         * @param state Target policy state to enter.
         */
        void transitionTo(SinkState state);

        /**
         * @brief Perform the requested reset action and re-enter attach-dependent state.
         * @param resetType Reset action to execute.
         */
        void performReset(SinkResetType resetType);

        /**
         * @brief Complete receiver-side Soft_Reset handling after the PHY GoodCRC.
         */
        void handleReceivedSoftReset();

        /**
         * @brief Cache latest SPR Source_Capabilities and notify listeners.
         * @param sourceCapabilities Decoded SPR source capabilities to cache.
         */
        void setSourceCapabilities(const Proto::SourceCapabilities& sourceCapabilities);

        /**
         * @brief Cache latest EPR Source Capabilities and notify listeners.
         * @param sourceCapabilities Decoded EPR source capabilities to cache.
         */
        void setEPRSourceCapabilities(const Proto::EPRSourceCapabilities& sourceCapabilities);

        /**
         * @brief Clear cached EPR capabilities and notify listeners if changed.
         */
        void clearEPRSourceCapabilities();

        /**
         * @brief Store negotiated PDO and electrical values and notify listeners.
         * @param pdoVariant Negotiated PDO variant.
         * @param voltage Negotiated voltage in volts.
         * @param current Negotiated current in amps.
         */
        void setNegotiatedValues(const Proto::PDOVariant pdoVariant, float voltage, float current);

        /**
         * @brief Mark EPR mode activity flag and notify listeners.
         * @param active True if EPR mode is active; false otherwise.
         */
        void setEPRModeActive(bool active);

        /**
         * @brief Set whether local policy allows EPR entry.
         * @param enabled True to allow EPR entry on the next eligible SPR contract.
         */
        void setEPREntryEnabled(bool enabled);

        /**
         * @brief Get whether local policy allows EPR entry.
         * @return True when EPR entry is enabled.
         */
        [[nodiscard]] bool eprEntryEnabled() const;

        /**
         * @brief Return count of currently active PDO view (EPR if present, else SPR).
         * @return Number of PDO entries exposed by active capabilities view.
         */
        size_t totalPDOCount() const;

        /**
         * @brief Return PDO at active-view index.
         * @param index Zero-based index in active capabilities view.
         * @return PDO variant if index is valid; otherwise std::nullopt.
         */
        std::optional<Proto::PDOVariant> pdoAtIndex(size_t index) const;

        /**
         * @brief Return Request object position for active-view index.
         * @param index Zero-based index in active capabilities view.
         * @return 1-based object position for PD Request, or std::nullopt if invalid.
         */
        std::optional<uint8_t> requestObjectPositionAtIndex(size_t index) const;

        /**
         * @brief Take and clear completed extended payload for the given message type.
         * @param type Extended message type to fetch.
         * @return Completed payload bytes if available; otherwise std::nullopt.
         */
        std::optional<SinkRuntimeState::ExtendedPayloadBuffer> takeCompletedExtendedPayload(
            Proto::ExtendedMessageType type);

        /**
         * @brief Send a Not_Supported control response.
         */
        void sendNotSupportedMessage();

        /**
         * @brief Send minimal SPR Sink_Capabilities for Get_Sink_Cap.
         */
        void sendSinkCapabilities();

        /**
         * @brief Send minimal Sink_Capabilities_Extended for Get_Sink_Cap_Extended.
         */
        void sendSinkCapabilitiesExtended();

        /**
         * @brief Send local PD Revision information for Get_Revision.
         */
        void sendRevision();

        /**
         * @brief Send Get_PPS_Status for the current PPS contract.
         */
        void sendGetPPSStatus();

        /**
         * @brief Send local Manufacturer_Info for a Get_Manufacturer_Info request payload.
         * @param requestPayload GMIDB payload from the received request.
         */
        void sendManufacturerInfo(std::span<const uint8_t> requestPayload);

        /**
         * @brief Send EPR_Mode data message.
         * @param action EPR mode action to encode.
         * @param data Optional action-specific payload byte.
         */
        void sendEPRMode(Proto::EPRMode::Action action, uint8_t data = 0);

        /**
         * @brief Send Extended_Control message with optional GoodCRC wait.
         * @param controlType Extended control type byte.
         * @param awaitGoodCRC True to wait for GoodCRC; false for fire-and-forget.
         */
        void sendExtendedControlMessage(uint8_t controlType, bool awaitGoodCRC = true);

        /**
         * @brief Send an encoded message and await GoodCRC.
         * @param message Encoded PD message to send.
         */
        void sendMessageAndAwaitGoodCRC(const PHY::BMCEncodedMessage& message);

        /**
         * @brief Stop tracking the current outgoing message without resetting MessageIDCounter.
         */
        void abandonPendingMessage();

        /**
         * @brief Validate whether a PDO request can be attempted without mutating policy state.
         * @param pdoIndex Zero-based PDO index in active capabilities view.
         * @param voltageMV Requested voltage in millivolts.
         * @param currentMA Requested current in milliamps.
         * @return Request result describing validation success or rejection reason.
         */
        SinkRequestResult validatePDORequest(
            size_t pdoIndex,
            uint32_t voltageMV,
            uint32_t currentMA) const;

        /**
         * @brief Request a PDO through Select_Capability path when current state allows it.
         * @param pdoIndex Zero-based PDO index in active capabilities view.
         * @param voltageMV Requested voltage in millivolts.
         * @param currentMA Requested current in milliamps.
         * @return Request result describing dispatch or rejection reason.
         */
        SinkRequestResult requestPDO(size_t pdoIndex, uint32_t voltageMV, uint32_t currentMA);

        /**
         * @brief Add one-shot timer in the Sink-owned alarm pool.
         * @param delayUs Relative delay in microseconds.
         * @param callback Pico alarm callback.
         * @param userData Opaque callback user data.
         * @param fireIfPast Fire immediately if target time already passed.
         * @return Alarm ID on success, or -1 on failure.
         */
        alarm_id_t addAlarmInUs(
            int64_t delayUs,
            alarm_callback_t callback,
            void *userData,
            bool fireIfPast);

        /**
         * @brief Cancel timer from the Sink-owned alarm pool.
         * @param id Alarm ID to cancel.
         * @return True if canceled; false otherwise.
         */
        bool cancelAlarm(alarm_id_t id);

        /**
         * @brief Enqueue a timeout event for Sink task-context handling.
         * @param event Timeout event to enqueue.
         */
        void enqueueTimeoutEvent(SinkTimeoutEvent event);

    protected:
        SinkRuntimeState& _runtimeState;                                 ///< Shared runtime state storage.
        SinkAlarmService& _alarmService;                                 ///< Sink-owned timer service.
        SinkMessageSender& _messageSender;                               ///< PD message send transport helper.
        CCBusController& _ccBusController;                               ///< Bus attach/status source.

        DisconnectedStateHandler& _disconnectedStateHandler;             ///< Handler for Disconnected.
        EPRKeepaliveStateHandler& _eprKeepaliveStateHandler;             ///< Handler for EPR Keepalive.
        EPRModeExitStateHandler& _eprModeExitStateHandler;               ///< Handler for EPR Mode Exit.
        EPRModeEntryStateHandler& _eprModeEntryStateHandler;             ///< Handler for EPR Mode Entry.
        GetPPSStatusStateHandler& _getPPSStatusStateHandler;             ///< Handler for PPS status query.
        ReadySinkStateHandler& _readySinkStateHandler;                   ///< Handler for Ready.
        SendSoftResetStateHandler& _sendSoftResetStateHandler;           ///< Handler for Send Soft Reset.
        SelectCapabilityStateHandler& _selectCapabilityStateHandler;     ///< Handler for Select Capability.
        TransitionSinkStateHandler& _transitionSinkStateHandler;         ///< Handler for Transition Sink.
        WaitForCapabilitiesStateHandler& _waitForCapabilitiesStateHandler; ///< Handler for Wait for Capabilities.

        std::function<void(SinkInfoChange)>& _sinkInfoChangedCallback;   ///< Host callback repeater.
        std::function<void(SinkTimeoutEvent)>& _enqueueTimeoutEventCallback; ///< Timeout event callback.

        /**
         * @brief Determine if cached SPR source capabilities advertise EPR support.
         * @return True if source fixed PDO #1 advertises EPR capable.
         */
        bool _sourceEPRCapable() const;

        /**
         * @brief Validate augmented PDO request constraints without mutating state.
         * @param pdoVariant Augmented PDO variant being requested.
         * @param voltageMV Requested voltage in millivolts.
         * @return Request result describing validation success or rejection reason.
         */
        SinkRequestResult _validateAugmentedPDORequest(
            const Proto::PDOVariant& pdoVariant,
            uint32_t voltageMV) const;

        /**
         * @brief Emit sink info change callback if registered.
         * @param change Sink info change classification to notify.
         */
        void _notifySinkInfoChanged(SinkInfoChange change);
    };

} // namespace T76::DRPD::Logic
