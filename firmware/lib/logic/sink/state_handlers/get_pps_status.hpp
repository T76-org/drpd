/**
 * @file get_pps_status.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Sink PPS status query state.
 */

#pragma once

#include "../state_handler.hpp"

namespace T76::DRPD::Logic {

    /**
     * @brief Handles PE_SNK_Get_PPS_Status after a PPS explicit contract.
     */
    class GetPPSStatusStateHandler : public SinkStateHandler {
    public:
        /**
         * @brief Handle incoming PPS_Status response.
         */
        void handleMessage(
            SinkContext& context,
            const T76::DRPD::PHY::BMCDecodedMessage *message) override;

        /**
         * @brief Handle GoodCRC sender state for the Get_PPS_Status message.
         */
        void handleMessageSenderStateChange(
            SinkContext& context,
            SinkMessageSenderState state) override;

        /**
         * @brief Handle PPS status response timeout.
         */
        void handleTimeoutEvent(SinkContext& context, SinkTimeoutEventType eventType) override;

        /**
         * @brief Enter state and send Get_PPS_Status.
         */
        void enter(SinkContext& context) override;

        /**
         * @brief Cancel state-local timers.
         */
        void reset(SinkContext& context) override;

    protected:
        alarm_id_t _responseTimeoutAlarmId = -1; ///< Alarm ID for response timeout.

        /**
         * @brief Static callback for PPS status response timeout.
         */
        static int64_t _onResponseTimeoutCallback(alarm_id_t id, void *userData);

        /**
         * @brief Return to Ready after status success or timeout.
         */
        void _finish(SinkContext& context);
    };

} // namespace T76::DRPD::Logic
