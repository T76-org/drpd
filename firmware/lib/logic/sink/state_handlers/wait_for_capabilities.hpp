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
         * @brief Construct a new Wait For Capabilities State Handler object
         * 
         * @param sink Reference to the Sink instance
         */
        WaitForCapabilitiesStateHandler() = default;

        /** 
         * @brief Destroy the Wait For Capabilities State Handler object
         */
        ~WaitForCapabilitiesStateHandler() override = default;

        // Base class overrides

        void handleMessage(SinkContext& context, const PHY::BMCDecodedMessage *message) override;
        void handleMessageSenderStateChange(SinkContext& context, SinkMessageSenderState state) override;
        void enter(SinkContext& context) override;
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
