/**
 * @file epr_mode_entry.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * This handler implements the EPR mode entry handshake sequence.
 *
 * It sends Enter, tracks the SenderResponse and SinkEPREnter timers, and
 * advances through the spec-defined send and wait-for-response phases.
 */

#pragma once

#include "../state_handler.hpp"


namespace T76::DRPD::Logic {

    /**
     * @brief State handler for EPR mode entry handshake.
     */
    class EPRModeEntryStateHandler : public SinkStateHandler {
    public:
        /**
         * @brief Construct an EPR mode entry state handler.
         */
        EPRModeEntryStateHandler() = default;

        /**
         * @brief Destroy the EPR mode entry state handler.
         */
        ~EPRModeEntryStateHandler() override = default;

        /**
         * @brief Handle incoming message in EPR mode entry state.
         * @param context Shared sink context.
         * @param message Decoded incoming message.
         */
        void handleMessage(SinkContext& context, const T76::DRPD::PHY::BMCDecodedMessage *message) override;

        /**
         * @brief Handle sender state changes in EPR mode entry state.
         * @param context Shared sink context.
         * @param state Sender state.
         */
        void handleMessageSenderStateChange(SinkContext& context, SinkMessageSenderState state) override;

        /**
         * @brief Handle timeout events in EPR mode entry state.
         * @param context Shared sink context.
         * @param eventType Timeout event type.
         */
        void handleTimeoutEvent(SinkContext& context, SinkTimeoutEventType eventType) override;

        /**
         * @brief Enter EPR mode entry state.
         * @param context Shared sink context.
         */
        void enter(SinkContext& context) override;

        /**
         * @brief Reset EPR mode entry state timers/flags.
         * @param context Shared sink context.
         */
        void reset(SinkContext& context) override;

    protected:
        alarm_id_t _senderResponseTimeoutAlarmId = -1; ///< Timeout waiting for Enter Acknowledge.
        alarm_id_t _entryTimeoutAlarmId = -1;          ///< Timeout for full EPR entry sequence.

        /**
         * @brief Start the full EPR entry timer if it is not already running.
         * @param context Shared sink context.
         */
        void _startEntryTimeout(SinkContext& context);

        /**
         * @brief Start the SenderResponse timer for Enter Acknowledge.
         * @param context Shared sink context.
         */
        void _startSenderResponseTimeout(SinkContext& context);

        /**
         * @brief Stop the SenderResponse timer if active.
         * @param context Shared sink context.
         */
        void _stopSenderResponseTimeout(SinkContext& context);

        /**
         * @brief Handle entry-timeout expiry.
         */
        void _onEntryTimeout();

        /**
         * @brief Handle SenderResponse timeout expiry.
         */
        void _onSenderResponseTimeout();

        /**
         * @brief Static timer callback for EPR entry timeout.
         * @param id Alarm id.
         * @param user_data Pointer to handler instance.
         * @return 0 to keep timer one-shot.
         */
        static int64_t _onEntryTimeoutCallback(alarm_id_t id, void *user_data);

        /**
         * @brief Static timer callback for EPR entry SenderResponse timeout.
         * @param id Alarm id.
         * @param user_data Pointer to handler instance.
         * @return 0 to keep timer one-shot.
         */
        static int64_t _onSenderResponseTimeoutCallback(alarm_id_t id, void *user_data);
    };

} // namespace T76::DRPD::Logic
