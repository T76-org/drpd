/**
 * @file epr_mode_entry.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#pragma once

#include "../state_handler.hpp"


namespace T76::DRPD::Logic {

    class EPRModeEntryStateHandler : public SinkStateHandler {
    public:
        explicit EPRModeEntryStateHandler(Sink &sink) : SinkStateHandler(sink) {}
        ~EPRModeEntryStateHandler() override = default;

        void handleMessage(const T76::DRPD::PHY::BMCDecodedMessage *message) override;
        void handleMessageSenderStateChange(SinkMessageSenderState state) override;
        void enter() override;
        void reset() override;

    protected:
        alarm_id_t _entryTimeoutAlarmId = -1; ///< Response timeout while entering EPR mode
        bool _enterAcknowledged = false;      ///< Tracks EnterAcknowledged phase

        void _onEntryTimeout();
        static int64_t _onEntryTimeoutCallback(alarm_id_t id, void *user_data);
    };

} // namespace T76::DRPD::Logic
