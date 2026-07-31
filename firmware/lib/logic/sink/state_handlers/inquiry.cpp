#include "inquiry.hpp"

#include "../sink_context.hpp"
#include "../inquiry_matcher.hpp"
using namespace T76::DRPD::Logic;

int64_t InquiryStateHandler::_onResponseTimeout(alarm_id_t, void *userData) {
    auto *handler = static_cast<InquiryStateHandler *>(userData);
    handler->_responseTimeoutAlarmId = -1;
    if (handler->_context != nullptr) {
        handler->_context->enqueueTimeoutEvent(
            SinkTimeoutEvent{SinkTimeoutEventType::InquiryResponseTimeout, handler->_requestId});
    }
    return 0;
}

int64_t InquiryStateHandler::_onRetryTimeout(alarm_id_t, void *userData) {
    auto *handler = static_cast<InquiryStateHandler *>(userData);
    handler->_retryAlarmId = -1;
    if (handler->_context != nullptr) {
        handler->_context->enqueueTimeoutEvent(
            SinkTimeoutEvent{SinkTimeoutEventType::InquirySinkTxOKRetryTimeout, handler->_requestId});
    }
    return 0;
}

void InquiryStateHandler::enter(SinkContext& context) {
    _bindContext(context);
    _requestId = context.runtimeState().inquiryResult().status.id;
    _trySend(context);
}

void InquiryStateHandler::handleMessageSenderStateChange(
    SinkContext& context, SinkMessageSenderState state) {
    if (state == SinkMessageSenderState::GoodCRCTimeout) {
        _finish(context, SinkInquiryOutcome::GoodCRCTimeout);
        return;
    }
    if (state == SinkMessageSenderState::GoodCRCReceived && _sent) {
        _responseTimeoutAlarmId = context.addAlarmInUs(
            LOGIC_SINK_INQUIRY_RESPONSE_TIMEOUT_US, _onResponseTimeout, this, true);
    }
}

void InquiryStateHandler::handleTimeoutEvent(
    SinkContext& context, SinkTimeoutEventType eventType) {
    if (eventType == SinkTimeoutEventType::InquirySinkTxOKRetryTimeout && !_sent) {
        _trySend(context);
    } else if (eventType == SinkTimeoutEventType::InquiryResponseTimeout) {
        _finish(context, SinkInquiryOutcome::ResponseTimeout);
    }
}

void InquiryStateHandler::handleMessage(
    SinkContext& context, const PHY::BMCDecodedMessage *message) {
    const auto header = message->decodedHeader();
    uint32_t rawType = 0xffffffffu;
    if (header.messageClass() == Proto::PDHeader::MessageClass::Control &&
        header.controlMessageType().has_value()) {
        rawType = static_cast<uint32_t>(header.controlMessageType().value());
    } else if (header.messageClass() == Proto::PDHeader::MessageClass::Data &&
               header.dataMessageType().has_value()) {
        rawType = static_cast<uint32_t>(header.dataMessageType().value());
    }
    const InquiryMatch match = classifyGetRevisionResponse(
        static_cast<uint32_t>(header.messageClass()), rawType, header.numDataObjects());
    if (match == InquiryMatch::Response) {
        const auto body = message->rawBody();
        context.runtimeState().finishInquiry(
            SinkInquiryOutcome::Response,
            static_cast<uint32_t>(header.messageClass()),
            static_cast<uint32_t>(Proto::DataMessageType::Revision),
            body);
        context.transitionTo(SinkState::PE_SNK_Ready);
        return;
    }
    if (match == InquiryMatch::NotSupported) _finish(context, SinkInquiryOutcome::NotSupported);
    else if (match == InquiryMatch::Rejected) _finish(context, SinkInquiryOutcome::Rejected);
    else if (match == InquiryMatch::Wait) _finish(context, SinkInquiryOutcome::Wait);
    else _finish(context, SinkInquiryOutcome::ProtocolError);
}

void InquiryStateHandler::reset(SinkContext& context) {
    if (_responseTimeoutAlarmId != -1) {
        context.cancelAlarm(_responseTimeoutAlarmId);
        _responseTimeoutAlarmId = -1;
    }
    if (_retryAlarmId != -1) {
        context.cancelAlarm(_retryAlarmId);
        _retryAlarmId = -1;
    }
    _sent = false;
    _requestId = 0;
    _unbindContext();
}

void InquiryStateHandler::_trySend(SinkContext& context) {
    if (!context.sinkMayInitiateAMS()) {
        _retryAlarmId = context.addAlarmInUs(
            LOGIC_SINK_COLLISION_AVOIDANCE_RETRY_US, _onRetryTimeout, this, true);
        return;
    }
    _sent = context.sendInquiryRequest(context.runtimeState().inquiryResult().status.type);
}

void InquiryStateHandler::_finish(SinkContext& context, SinkInquiryOutcome outcome) {
    context.runtimeState().finishInquiry(outcome);
    context.transitionTo(SinkState::PE_SNK_Ready);
}
