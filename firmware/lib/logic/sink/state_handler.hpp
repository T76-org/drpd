/**
 * @file state_handler.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 * 
 */

#pragma once

#include "message_sender.hpp"

#include "../../phy/bmc_decoder.hpp"


namespace T76::DRPD::Logic {

    class Sink; ///< Forward declaration

    class SinkStateHandler {
    public:
        SinkStateHandler(Sink &sink) : _sink(sink) {}
        virtual ~SinkStateHandler() = default;

        virtual void handleMessage(const T76::DRPD::PHY::BMCDecodedMessage *message) = 0;
        virtual void handleMessageSenderStateChange(SinkMessageSenderState state) = 0;
        virtual void enter() = 0;
        virtual void reset() = 0;

    protected:
        Sink &_sink;
    };
    
} // namespace T76::DRPD::Logic
