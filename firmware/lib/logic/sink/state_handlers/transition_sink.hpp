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
         * @brief Construct a new Transition Sink State Handler object
         * 
         * @param sink Reference to the Sink instance
         */
        TransitionSinkStateHandler() = default;

        /** 
         * @brief Destroy the Transition Sink State Handler object
         */
        ~TransitionSinkStateHandler() override = default;

        // Base class overrides

        void handleMessage(SinkContext& context, const T76::DRPD::PHY::BMCDecodedMessage *message) override;
        void handleMessageSenderStateChange(SinkContext& context, SinkMessageSenderState state) override;
        void enter(SinkContext& context) override;
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
