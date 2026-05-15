/**
 * @file send_response.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "send_response.hpp"

#include "../sink.hpp"

using namespace T76::DRPD::Logic;

void SendResponseStateHandler::prepareResponse(
    const PHY::BMCEncodedMessage& message,
    SinkState returnState) {
    _pendingResponse = message;
    _returnState = returnState;
}

void SendResponseStateHandler::handleMessage(
    SinkContext& context,
    const T76::DRPD::PHY::BMCDecodedMessage *message) {
    (void)message;
    context.performReset(SinkResetType::SoftReset);
}

void SendResponseStateHandler::handleMessageSenderStateChange(
    SinkContext& context,
    SinkMessageSenderState state) {
    if (state == SinkMessageSenderState::GoodCRCReceived) {
        context.transitionTo(_returnState);
        return;
    }

    if (state == SinkMessageSenderState::GoodCRCTimeout) {
        context.performReset(SinkResetType::SoftReset);
    }
}

void SendResponseStateHandler::enter(SinkContext& context) {
    _bindContext(context);

    if (!_pendingResponse.has_value()) {
        context.transitionTo(_returnState);
        return;
    }

    context.sendMessageAndAwaitGoodCRC(_pendingResponse.value());
}

void SendResponseStateHandler::reset(SinkContext& context) {
    (void)context;
    _pendingResponse.reset();
    _returnState = SinkState::PE_SNK_Ready;
    _unbindContext();
}
