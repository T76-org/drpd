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
 * In this repository, the disconnected handler is intentionally minimal:
 * it binds/unbinds context and ignores incoming traffic until attach/reset
 * transitions policy into an active negotiation state.
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
         * @brief Construct a Disconnected state handler.
         */
        DisconnectedStateHandler() = default;

        /** 
         * @brief Destroy the Disconnected State Handler object
         */
        ~DisconnectedStateHandler() override = default;

        /**
         * @brief Handle incoming message in Disconnected state.
         * @param context Shared sink context.
         * @param message Decoded incoming message.
         */
        void handleMessage(SinkContext& context, const T76::DRPD::PHY::BMCDecodedMessage *message) override;

        /**
         * @brief Handle sender state change while disconnected.
         * @param context Shared sink context.
         * @param state Sender state.
         */
        void handleMessageSenderStateChange(SinkContext& context, SinkMessageSenderState state) override;

        /**
         * @brief Enter Disconnected state.
         * @param context Shared sink context.
         */
        void enter(SinkContext& context) override;

        /**
         * @brief Reset Disconnected state internals.
         * @param context Shared sink context.
         */
        void reset(SinkContext& context) override;
    };

} // namespace T76::DRPD::Logic
