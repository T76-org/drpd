/**
 * @file disconnected.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 * 
 */

#include "disconnected.hpp"
#include "../sink.hpp"


using namespace T76::DRPD::Logic;


void DisconnectedStateHandler::handleMessage(const T76::DRPD::PHY::BMCDecodedMessage *message) {
    // In the disconnected state, we do nothing.
}

void DisconnectedStateHandler::handleMessageSenderStateChange(SinkMessageSenderState state) {
    // No specific handling needed in Disconnected state
}

void DisconnectedStateHandler::enter() {
}

void DisconnectedStateHandler::reset() {
    // No specific reset actions needed for Disconnected state
}

