/**
 * @file send_soft_reset.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * This header defines the Sink policy handler for sending an SOP Soft_Reset
 * after a protocol error and waiting for the Source Accept response.
 */

#pragma once

#include "../state_handler.hpp"


namespace T76::DRPD::Logic {

    /**
     * @brief State handler for PE_SNK_Send_Soft_Reset.
     */
    class SendSoftResetStateHandler : public SinkStateHandler {
    public:
        /**
         * @brief Construct a SendSoftReset state handler.
         */
        SendSoftResetStateHandler() = default;

        /**
         * @brief Destroy the SendSoftReset state handler.
         */
        ~SendSoftResetStateHandler() override = default;

        /**
         * @brief Handle incoming message while waiting for Soft_Reset response.
         * @param context Shared sink context.
         * @param message Decoded incoming message.
         */
        void handleMessage(SinkContext& context, const PHY::BMCDecodedMessage *message) override;

        /**
         * @brief Handle GoodCRC result for the transmitted Soft_Reset.
         * @param context Shared sink context.
         * @param state Sender state.
         */
        void handleMessageSenderStateChange(SinkContext& context, SinkMessageSenderState state) override;

        /**
         * @brief Handle Soft_Reset response timer expiry.
         * @param context Shared sink context.
         * @param eventType Timeout event type.
         */
        void handleTimeoutEvent(SinkContext& context, SinkTimeoutEventType eventType) override;

        /**
         * @brief Enter Send_Soft_Reset and transmit Soft_Reset.
         * @param context Shared sink context.
         */
        void enter(SinkContext& context) override;

        /**
         * @brief Reset state-local timer resources.
         * @param context Shared sink context.
         */
        void reset(SinkContext& context) override;

    protected:
        alarm_id_t _responseTimeoutAlarmId = -1;  ///< Alarm ID for Source Accept timeout.

        /**
         * @brief Start SenderResponse timer after Soft_Reset GoodCRC.
         * @param context Shared sink context.
         */
        void _startResponseTimer(SinkContext& context);

        /**
         * @brief Static callback for Source Accept timeout.
         * @param id Alarm ID.
         * @param user_data Pointer to SendSoftResetStateHandler instance.
         * @return Zero to prevent reschedule.
         */
        static int64_t _onResponseTimeoutCallback(alarm_id_t id, void *user_data);
    };

} // namespace T76::DRPD::Logic
