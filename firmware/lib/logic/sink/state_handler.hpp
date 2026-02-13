/**
 * @file state_handler.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 * 
 */

#pragma once

#include "message_sender.hpp"
#include "sink_context.hpp"

#include "../../phy/bmc_decoder.hpp"


namespace T76::DRPD::Logic {

    class SinkStateHandler {
    public:
        SinkStateHandler() = default;
        virtual ~SinkStateHandler() = default;

        virtual void handleMessage(
            SinkContext& context,
            const T76::DRPD::PHY::BMCDecodedMessage *message) = 0;
        virtual void handleMessageSenderStateChange(
            SinkContext& context,
            SinkMessageSenderState state) = 0;
        virtual void enter(SinkContext& context) = 0;
        virtual void reset(SinkContext& context) = 0;

    protected:
        SinkContext* _context = nullptr;

        void _bindContext(SinkContext& context) {
            _context = &context;
        }

        void _unbindContext() {
            _context = nullptr;
        }
    };
    
} // namespace T76::DRPD::Logic
