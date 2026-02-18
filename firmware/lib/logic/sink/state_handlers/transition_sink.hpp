/**
 * @file transition_sink.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 * 
 * The TransitionSinkStateHandler manages the behaviour of the Sink
 * in the PE_SNK_Transition_Sink state.
 * 
 * When entering this state, the Sink starts a transition timer.
 * If the timer expires before the Source sends a PS_RDY message,
 * the Sink performs a hard reset to recover.
 *
 * This handler also contains the handoff logic from first successful explicit
 * SPR contract into EPR mode entry when the source advertises EPR capability.
 */

#pragma once

#include "../state_handler.hpp"


namespace T76::DRPD::Logic {

    /**
     * @class TransitionSinkStateHandler
     * @brief State handler for the PE_SNK_Transition_Sink state of the Sink
     * 
     * This state handler manages the behaviour of the Sink when
     * it is in the PE_SNK_Transition_Sink state.
     */
    class TransitionSinkStateHandler : public SinkStateHandler {
    public:
        /**
         * @brief Construct a Transition Sink state handler.
         */
        TransitionSinkStateHandler() = default;

        /** 
         * @brief Destroy the Transition Sink State Handler object
         */
        ~TransitionSinkStateHandler() override = default;

        /**
         * @brief Handle incoming message in Transition_Sink state.
         * @param context Shared sink context.
         * @param message Decoded incoming message.
         */
        void handleMessage(SinkContext& context, const T76::DRPD::PHY::BMCDecodedMessage *message) override;

        /**
         * @brief Handle sender state changes in Transition_Sink state.
         * @param context Shared sink context.
         * @param state Sender state.
         */
        void handleMessageSenderStateChange(SinkContext& context, SinkMessageSenderState state) override;

        /**
         * @brief Handle timeout events in Transition_Sink state.
         * @param context Shared sink context.
         * @param eventType Timeout event type.
         */
        void handleTimeoutEvent(SinkContext& context, SinkTimeoutEventType eventType) override;

        /**
         * @brief Enter Transition_Sink state.
         * @param context Shared sink context.
         */
        void enter(SinkContext& context) override;

        /**
         * @brief Reset Transition_Sink timers.
         * @param context Shared sink context.
         */
        void reset(SinkContext& context) override;

    protected:
        alarm_id_t _transitionTimeoutAlarmId = -1;  ///< Alarm ID for transition timeout timer

        /**
         * @brief Called when the transition timeout expires
         */ 
        void _onTransitionTimeout();

        /**
         * @brief Static callback for transition timeout
         *
         * @param id The alarm ID
         * @param user_data Pointer to TransitionSinkStateHandler instance
         * @return 0 for one-shot timer (no reschedule)
         */
        static int64_t _onTransitionTimeoutCallback(alarm_id_t id, void *user_data);
    };
    
} // namespace T76::DRPD::Logic
