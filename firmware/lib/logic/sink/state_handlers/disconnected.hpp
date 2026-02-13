/**
 * @file disconnected.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 * 
 * The Disconnected state handler manages the 
 * initial behaviour of the Sink when no cable is connected.
 * 
 * This is equivalent to the PE_SNK_Startup state in the 
 * USB PD specification.
 * 
 */

#pragma once


#include "../state_handler.hpp"


namespace T76::DRPD::Logic {

    /**
     * @class DisconnectedStateHandler
     * @brief State handler for the Disconnected state of the Sink
     * 
     * This state handler manages the behaviour of the Sink when
     * it is in the Disconnected state (PE_SNK_Startup).
     */
    class DisconnectedStateHandler : public SinkStateHandler {
    public:
        /** 
         * @brief Construct a new Disconnected State Handler object
         * 
         * @param sink Reference to the Sink instance
         */
        DisconnectedStateHandler() = default;

        /** 
         * @brief Destroy the Disconnected State Handler object
         */
        ~DisconnectedStateHandler() override = default;

        // Base class overrides

        void handleMessage(SinkContext& context, const T76::DRPD::PHY::BMCDecodedMessage *message) override;
        void handleMessageSenderStateChange(SinkContext& context, SinkMessageSenderState state) override;
        void enter(SinkContext& context) override;
        void reset(SinkContext& context) override;
    };

} // namespace T76::DRPD::Logic