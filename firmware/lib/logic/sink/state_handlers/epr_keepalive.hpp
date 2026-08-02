/**
 * @file epr_keepalive.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * This handler maintains EPR-mode liveness after entry succeeds.
 *
 * Responsibilities include:
 * - periodic keepalive transmit,
 * - source keepalive watchdog supervision,
 * - EPR source capability retrieval and follow-up request flow,
 * - graceful/forced EPR exit when liveness or protocol checks fail.
 */

#pragma once

#include "../state_handler.hpp"


namespace T76::DRPD::Logic {

    /**
     * @brief State handler for EPR keepalive maintenance.
     */
    class EPRKeepaliveStateHandler : public SinkStateHandler {
    public:
        /**
         * @brief Construct an EPR keepalive state handler.
         */
        EPRKeepaliveStateHandler() = default;

        /**
         * @brief Destroy the EPR keepalive state handler.
         */
        ~EPRKeepaliveStateHandler() override = default;

        /**
         * @brief Handle incoming message in EPR keepalive state.
         * @param context Shared sink context.
         * @param message Decoded incoming message.
         */
        void handleMessage(SinkContext& context, const T76::DRPD::PHY::BMCDecodedMessage *message) override;

        /**
         * @brief Handle sender state changes in EPR keepalive state.
         * @param context Shared sink context.
         * @param state Sender state.
         */
        void handleMessageSenderStateChange(SinkContext& context, SinkMessageSenderState state) override;

        /**
         * @brief Handle timeout events in EPR keepalive state.
         * @param context Shared sink context.
         * @param eventType Timeout event type.
         */
        void handleTimeoutEvent(SinkContext& context, SinkTimeoutEventType eventType) override;

        /**
         * @brief Enter EPR keepalive state.
         * @param context Shared sink context.
         */
        void enter(SinkContext& context) override;

        /**
         * @brief Reset EPR keepalive state timers/flags.
         * @param context Shared sink context.
         */
        void reset(SinkContext& context) override;

        /**
         * @brief Return whether keepalive traffic is idle enough to run a host inquiry.
         * @return True when no EPR_KeepAlive_Ack response is outstanding.
         */
        [[nodiscard]] bool canSuspendForInquiry() const;

    protected:
        alarm_id_t _keepaliveIntervalAlarmId = -1; ///< Sink keepalive interval timer
        alarm_id_t _keepaliveResponseAlarmId = -1; ///< SenderResponse timer for EPR_KeepAlive_Ack.
        alarm_id_t _sourceWatchdogAlarmId = -1;    ///< Source keepalive watchdog timer
        bool _waitingForKeepaliveAck = false;      ///< True after sending EPR_KeepAlive until Ack/timeout.

        /**
         * @brief Handle periodic keepalive interval timer expiry.
         */
        void _onKeepaliveIntervalTimeout();

        /**
         * @brief Handle EPR keepalive SenderResponse timeout expiry.
         */
        void _onKeepaliveResponseTimeout();

        /**
         * @brief Handle source keepalive watchdog expiry.
         */
        void _onSourceWatchdogTimeout();

        /**
         * @brief Start the periodic SinkEPRKeepAliveTimer.
         * @param context Shared sink context.
         */
        void _startKeepaliveIntervalTimer(SinkContext& context);

        /**
         * @brief Restart SinkEPRKeepAliveTimer after non-keepalive Sink traffic.
         * @param context Shared sink context.
         */
        void _restartKeepaliveIntervalAfterSinkTraffic(SinkContext& context);

        /**
         * @brief Stop the EPR_KeepAlive_Ack response timer.
         * @param context Shared sink context.
         */
        void _stopKeepaliveResponseTimer(SinkContext& context);

        /**
         * @brief Return true when a keepalive timer event still applies to the active state.
         * @return True when the bound context is still in an EPR keepalive state.
         */
        [[nodiscard]] bool _keepaliveTimersActive() const;

        /**
         * @brief Static callback for keepalive interval timer.
         * @param id Alarm id.
         * @param user_data Pointer to handler instance.
         * @return 0 to keep timer one-shot.
         */
        static int64_t _onKeepaliveIntervalTimeoutCallback(alarm_id_t id, void *user_data);

        /**
         * @brief Static callback for EPR keepalive response timeout.
         * @param id Alarm id.
         * @param user_data Pointer to handler instance.
         * @return 0 to keep timer one-shot.
         */
        static int64_t _onKeepaliveResponseTimeoutCallback(alarm_id_t id, void *user_data);

        /**
         * @brief Static callback for source watchdog timer.
         * @param id Alarm id.
         * @param user_data Pointer to handler instance.
         * @return 0 to keep timer one-shot.
         */
        static int64_t _onSourceWatchdogTimeoutCallback(alarm_id_t id, void *user_data);
    };

} // namespace T76::DRPD::Logic
