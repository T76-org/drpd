/**
 * @file wait_for_capabilities.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 * 
 * The WaitForCapabilitiesStateHandler manages the behaviour of the Sink
 * in the PE_SNK_Wait_for_Capabilities state.
 * 
 * In this state, the Sink waits to receive a Source_Capabilities
 * message from the source after the CC bus is attached. Note that
 * this is not the only state in which the Sink can receive
 * Source_Capabilities messages; they may also be received in
 * other states as unsolicited messages.
 *
 * This handler owns the initial capability wait window after attach and starts
 * the first contract request flow once valid Source_Capabilities are received.
 * Unexpected messages are treated as protocol errors and routed through reset.
 * 
 */

#pragma once

#include "../state_handler.hpp"


namespace T76::DRPD::Logic {

    /**
     * @brief State handler for the PE_SNK_Wait_for_Capabilities state
     * 
     * In this state, the Sink waits to receive a Source_Capabilities
     * message from the source after the CC bus is attached.
     */
    class WaitForCapabilitiesStateHandler : public SinkStateHandler {
    public:
        /**
         * @brief Construct a Wait-for-Capabilities state handler.
         */
        WaitForCapabilitiesStateHandler() = default;

        /** 
         * @brief Destroy the Wait For Capabilities State Handler object
         */
        ~WaitForCapabilitiesStateHandler() override = default;

        /**
         * @brief Handle incoming message in Wait_for_Capabilities state.
         * @param context Shared sink context.
         * @param message Decoded incoming message.
         */
        void handleMessage(SinkContext& context, const PHY::BMCDecodedMessage *message) override;

        /**
         * @brief Handle sender state changes in Wait_for_Capabilities state.
         * @param context Shared sink context.
         * @param state Sender state.
         */
        void handleMessageSenderStateChange(SinkContext& context, SinkMessageSenderState state) override;

        /**
         * @brief Handle timeout events in Wait_for_Capabilities state.
         * @param context Shared sink context.
         * @param eventType Timeout event type.
         */
        void handleTimeoutEvent(SinkContext& context, SinkTimeoutEventType eventType) override;

        /**
         * @brief Enter Wait_for_Capabilities state.
         * @param context Shared sink context.
         */
        void enter(SinkContext& context) override;

        /**
         * @brief Reset Wait_for_Capabilities timers.
         * @param context Shared sink context.
         */
        void reset(SinkContext& context) override;

    protected:
        alarm_id_t _capabilitiesTimeoutAlarmId = -1;  ///< Alarm ID for capabilities timeout timer

        /** 
         * @brief Called when the capabilities timeout expires
         */ 
        void _onCapabilitiesTimeout();

        /** 
         * @brief Static callback for capabilities timeout
         * 
         * @param id The alarm ID
         * @param user_data Pointer to WaitForCapabilitiesStateHandler instance
         * @return 0 for one-shot timer (no reschedule)
         */
        static int64_t _onCapabilitiesTimeoutCallback(alarm_id_t id, void *user_data);
    };

} // namespace T76::DRPD::Logic
