/**
 * @file epr_mode_entry.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#pragma once

#include "../state_handler.hpp"


namespace T76::DRPD::Logic {

    class EPRModeEntryStateHandler : public SinkStateHandler {
    public:
        EPRModeEntryStateHandler() = default;
        ~EPRModeEntryStateHandler() override = default;

        void handleMessage(SinkContext& context, const T76::DRPD::PHY::BMCDecodedMessage *message) override;
        void handleMessageSenderStateChange(SinkContext& context, SinkMessageSenderState state) override;
        void enter(SinkContext& context) override;
        void reset(SinkContext& context) override;

    protected:
        alarm_id_t _entryTimeoutAlarmId = -1; ///< Response timeout while entering EPR mode
        bool _enterAcknowledged = false;      ///< Tracks EnterAcknowledged phase

        void _onEntryTimeout();
        static int64_t _onEntryTimeoutCallback(alarm_id_t id, void *user_data);
    };

} // namespace T76::DRPD::Logic
