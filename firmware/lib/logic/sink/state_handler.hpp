/**
 * @file state_handler.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * This header defines the abstract base contract for Sink policy state
 * handlers.
 *
 * Every concrete handler maps to one USB-PD Sink policy state and receives a
 * `SinkContext` object for all state mutation and protocol actions. This keeps
 * the handler API uniform and allows timer callbacks to reuse a bound context
 * pointer without depending on `Sink` internals.
 */

#pragma once

#include "message_sender.hpp"
#include "sink_context.hpp"

#include "../../phy/bmc_decoder.hpp"


namespace T76::DRPD::Logic {

    /**
     * @brief Base interface for all Sink policy state handlers.
     */
    class SinkStateHandler {
    public:
        /**
         * @brief Construct a state handler base.
         */
        SinkStateHandler() = default;

        /**
         * @brief Destroy the state handler base.
         */
        virtual ~SinkStateHandler() = default;

        /**
         * @brief Handle a received PD message in the current policy state.
         * @param context Shared sink context.
         * @param message Decoded incoming PD message.
         */
        virtual void handleMessage(
            SinkContext& context,
            const T76::DRPD::PHY::BMCDecodedMessage *message) = 0;

        /**
         * @brief Handle message sender state transitions (GoodCRC events/timeouts).
         * @param context Shared sink context.
         * @param state New message sender state.
         */
        virtual void handleMessageSenderStateChange(
            SinkContext& context,
            SinkMessageSenderState state) = 0;

        /**
         * @brief Enter this policy state.
         * @param context Shared sink context.
         */
        virtual void enter(SinkContext& context) = 0;

        /**
         * @brief Reset state-local resources and timers.
         * @param context Shared sink context.
         */
        virtual void reset(SinkContext& context) = 0;

    protected:
        SinkContext* _context = nullptr; ///< Bound context for timer callbacks.

        /**
         * @brief Bind context pointer for asynchronous callbacks.
         * @param context Shared sink context.
         */
        void _bindContext(SinkContext& context) {
            _context = &context;
        }

        /**
         * @brief Clear bound context pointer.
         */
        void _unbindContext() {
            _context = nullptr;
        }
    };
    
} // namespace T76::DRPD::Logic
