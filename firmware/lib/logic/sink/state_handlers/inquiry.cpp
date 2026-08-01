#include "inquiry.hpp"

#include "../sink_context.hpp"
#include "../inquiry_descriptor.hpp"
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
        const auto descriptor = sinkInquiryDescriptor(
            context.runtimeState().inquiryResult().status.type);
        if (!descriptor.has_value()) {
            _finish(context, SinkInquiryOutcome::ProtocolError);
            return;
        }
        _responseTimeoutAlarmId = context.addAlarmInUs(
            descriptor->responseTimeoutUs, _onResponseTimeout, this, true);
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
    } else if (header.messageClass() == Proto::PDHeader::MessageClass::Extended &&
               header.extendedMessageType().has_value()) {
        rawType = static_cast<uint32_t>(header.extendedMessageType().value());
    }
    const auto resultSnapshot = context.runtimeState().inquiryResult();
    const auto descriptor = sinkInquiryDescriptor(resultSnapshot.status.type);
    if (!descriptor.has_value()) {
        _finish(context, SinkInquiryOutcome::ProtocolError);
        return;
    }
    const InquiryMatch match = matchInquiryResponse(
        descriptor.value(), static_cast<uint32_t>(header.messageClass()),
        rawType, header.numDataObjects());
    if (match == InquiryMatch::Unrelated) {
        _finish(context, SinkInquiryOutcome::Aborted);
        context.handleMessageAsReady(message);
        return;
    }
    if (match == InquiryMatch::Response) {
        const auto extendedPayload = header.messageClass() ==
                Proto::PDHeader::MessageClass::Extended
            ? context.takeInquiryExtendedPayload()
            : std::nullopt;
        const auto body = extendedPayload.has_value()
            ? extendedPayload->span()
            : message->rawBody();
        context.runtimeState().finishInquiry(
            SinkInquiryOutcome::Response,
            static_cast<uint32_t>(header.messageClass()),
            rawType,
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
    const auto result = context.runtimeState().inquiryResult();
    _sent = context.sendInquiryRequest(SinkInquiryRequest{
        result.status.id, result.status.type, result.parameters});
}

void InquiryStateHandler::_finish(SinkContext& context, SinkInquiryOutcome outcome) {
    context.runtimeState().finishInquiry(outcome);
    context.transitionTo(SinkState::PE_SNK_Ready);
}
