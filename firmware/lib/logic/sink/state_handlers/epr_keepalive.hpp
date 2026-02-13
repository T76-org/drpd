/**
 * @file epr_keepalive.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#pragma once

#include "../state_handler.hpp"


namespace T76::DRPD::Logic {

    class EPRKeepaliveStateHandler : public SinkStateHandler {
    public:
        EPRKeepaliveStateHandler() = default;
        ~EPRKeepaliveStateHandler() override = default;

        void handleMessage(SinkContext& context, const T76::DRPD::PHY::BMCDecodedMessage *message) override;
        void handleMessageSenderStateChange(SinkContext& context, SinkMessageSenderState state) override;
        void enter(SinkContext& context) override;
        void reset(SinkContext& context) override;

    protected:
        alarm_id_t _keepaliveIntervalAlarmId = -1; ///< Sink keepalive interval timer
        alarm_id_t _sourceWatchdogAlarmId = -1;    ///< Source keepalive watchdog timer
        bool _awaitingKeepaliveAck = false;        ///< True when a keepalive ack is pending
        uint8_t _keepaliveFailureCount = 0;        ///< Consecutive keepalive failures

        void _onKeepaliveIntervalTimeout();
        void _onSourceWatchdogTimeout();
        void _exitEPRMode();

        static int64_t _onKeepaliveIntervalTimeoutCallback(alarm_id_t id, void *user_data);
        static int64_t _onSourceWatchdogTimeoutCallback(alarm_id_t id, void *user_data);
    };

} // namespace T76::DRPD::Logic
