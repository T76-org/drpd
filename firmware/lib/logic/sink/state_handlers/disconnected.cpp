/**
 * @file disconnected.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 * 
 */

#include "disconnected.hpp"
#include "../sink.hpp"


using namespace T76::DRPD::Logic;


void DisconnectedStateHandler::handleMessage(
    SinkContext& context,
    const T76::DRPD::PHY::BMCDecodedMessage *message) {
    (void)context;
    (void)message;
    // In the disconnected state, we do nothing.
}

void DisconnectedStateHandler::handleMessageSenderStateChange(
    SinkContext& context,
    SinkMessageSenderState state) {
    (void)context;
    (void)state;
    // No specific handling needed in Disconnected state
}

void DisconnectedStateHandler::enter(SinkContext& context) {
    _bindContext(context);
}

void DisconnectedStateHandler::reset(SinkContext& context) {
    (void)context;
    _unbindContext();
    // No specific reset actions needed for Disconnected state
}
