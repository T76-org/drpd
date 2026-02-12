/**
 * @file ready.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 * 
 * The ReadySinkStateHandler manages the behaviour of the Sink
 * in the PE_SNK_Ready state.
 * 
 * If the Sink enters this state with a pending contract request,
 * which can occur when the Source sends a Wait message in response
 * to a Request message, the Sink will periodically retry the
 * contract request until it either succeeds or a timeout occurs.
 * 
 * If the Sink enters this state with a PPS or AVS contract, it
 * will periodically refresh its request to maintain the contract.
 * 
 * If the state receives an unsolicited Source_Capabilities message,
 * it will transition to the Select_Capability state to renegotiate
 * power.
 * 
 */

#pragma once

#include "../state_handler.hpp"


namespace T76::DRPD::Logic {

    /**
     * @class ReadySinkStateHandler
     * @brief State handler for the PE_SNK_Ready state of the Sink
     * 
     * This state handler manages the behaviour of the Sink when
     * it is in the PE_SNK_Ready state.
     */
    class ReadySinkStateHandler : public SinkStateHandler {
    public:
        /** 
         * @brief Construct a new Ready Sink State Handler object
         * 
         * @param sink Reference to the Sink instance
         */
        ReadySinkStateHandler(Sink &sink) : SinkStateHandler(sink) {}

        /** 
         * @brief Destroy the Ready Sink State Handler object
         */
        ~ReadySinkStateHandler() override = default;

        // Base class overrides

        void handleMessage(const T76::DRPD::PHY::BMCDecodedMessage *message) override;
        void handleMessageSenderStateChange(SinkMessageSenderState state) override;
        void enter() override;
        void reset() override;

    protected:
        alarm_id_t _sinkRequestTimerAlarmId = -1;  ///< Alarm ID for SinkRequestTimer
        alarm_id_t _pdoRefreshTimerAlarmId = -1;  ///< Alarm ID for PDO refresh timer

        /**
         * @brief Called when the SinkRequestTimer expires
         */
        void _onSinkRequestTimeout();

        /**
         * @brief Called when the PDO refresh timer expires
         */
        void _onPDORefreshTimeout();

        /**
         * @brief Static callback for SinkRequestTimer expiration
         *
         * @param id The alarm ID
         * @param user_data Pointer to ReadySinkStateHandler instance
         * @return 0 for one-shot timer (no reschedule)
         */
        static int64_t _onSinkRequestTimeoutCallback(alarm_id_t id, void *user_data);

        /**
         * @brief Static callback for PDO refresh timer expiration
         *
         * @param id The alarm ID
         * @param user_data Pointer to ReadySinkStateHandler instance
         * @return 0 for one-shot timer (no reschedule)
         */
        static int64_t _onPDORefreshTimeoutCallback(alarm_id_t id, void *user_data);
    };
    
} // namespace T76::DRPD::Logic