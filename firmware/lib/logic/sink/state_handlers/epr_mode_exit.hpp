/**
 * @file epr_mode_exit.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * This handler implements Sink-initiated EPR mode exit.
 */

#pragma once

#include "../state_handler.hpp"


namespace T76::DRPD::Logic {

    /**
     * @brief State handler for Sink-initiated EPR mode exit.
     */
    class EPRModeExitStateHandler : public SinkStateHandler {
    public:
        /**
         * @brief Handle incoming messages while EPR exit is in flight.
         * @param context Shared sink context.
         * @param message Decoded incoming PD message.
         */
        void handleMessage(SinkContext& context, const T76::DRPD::PHY::BMCDecodedMessage *message) override;

        /**
         * @brief Handle GoodCRC sender state for the EPR_Mode Exit message.
         * @param context Shared sink context.
         * @param state Sender state.
         */
        void handleMessageSenderStateChange(SinkContext& context, SinkMessageSenderState state) override;

        /**
         * @brief Retry EPR exit once Source advertises SinkTxOK.
         * @param context Shared sink context.
         * @param eventType Timeout event type.
         */
        void handleTimeoutEvent(SinkContext& context, SinkTimeoutEventType eventType) override;

        /**
         * @brief Enter EPR exit state and send EPR_Mode Exit.
         * @param context Shared sink context.
         */
        void enter(SinkContext& context) override;

        /**
         * @brief Reset state-local resources.
         * @param context Shared sink context.
         */
        void reset(SinkContext& context) override;

    protected:
        /**
         * @brief Clear EPR runtime state and wait for SPR Source_Capabilities.
         * @param context Shared sink context.
         */
        void _completeExitToWaitForCapabilities(SinkContext& context);

        /**
         * @brief Clear EPR runtime state and immediately evaluate received SPR capabilities.
         * @param context Shared sink context.
         * @param message Source_Capabilities message received during EPR exit.
         */
        void _completeExitWithSourceCapabilities(
            SinkContext& context,
            const T76::DRPD::PHY::BMCDecodedMessage *message);
    };

} // namespace T76::DRPD::Logic
