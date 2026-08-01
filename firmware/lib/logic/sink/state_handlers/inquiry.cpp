#include "inquiry.hpp"

#include "../sink_context.hpp"
#include "../inquiry_descriptor.hpp"
#include <optional>
#include <variant>
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
        const bool refreshesSourceCapabilities =
            resultSnapshot.status.type == SinkInquiryType::GetSourceCapabilities;
        const auto previousPDO = context.runtimeState()._negotiatedPDO;
        const std::optional<uint32_t> previousRawPDO = previousPDO.has_value()
            ? std::optional<uint32_t>(std::visit(
                [](const auto& typedPDO) { return typedPDO.raw(); }, previousPDO.value()))
            : std::nullopt;
        const uint32_t previousVoltageMV = static_cast<uint32_t>(
            context.runtimeState()._negotiatedVoltage);
        const uint32_t previousCurrentMA = static_cast<uint32_t>(
            context.runtimeState()._negotiatedCurrent);
        const auto extendedPayload = header.messageClass() ==
                Proto::PDHeader::MessageClass::Extended
            ? context.takeInquiryExtendedPayload()
            : std::nullopt;
        const auto body = extendedPayload.has_value()
            ? extendedPayload->span()
            : message->rawBody();
        if (!inquiryResponsePayloadSizeValid(descriptor.value(), body.size()) ||
            !inquiryResponseStructureValid(descriptor.value(), body)) {
            _finish(context, SinkInquiryOutcome::MalformedResponse);
            return;
        }
        const uint32_t selector = static_cast<uint32_t>(resultSnapshot.parameters.selector[0]) |
            (static_cast<uint32_t>(resultSnapshot.parameters.selector[1]) << 8) |
            (static_cast<uint32_t>(resultSnapshot.parameters.selector[2]) << 16) |
            (static_cast<uint32_t>(resultSnapshot.parameters.selector[3]) << 24);
        if (!inquiryResponseCorrelates(descriptor.value(), selector, body)) {
            _finish(context, SinkInquiryOutcome::MalformedResponse);
            return;
        }
        if (!context.cacheInquiryResponse(resultSnapshot.status.type, message, body)) {
            _finish(context, SinkInquiryOutcome::MalformedResponse);
            return;
        }
        context.runtimeState().finishInquiry(
            SinkInquiryOutcome::Response,
            static_cast<uint32_t>(header.messageClass()),
            rawType,
            body,
            descriptor->warningFlags |
                (context.runtimeState()._inquiryRecoveredMalformedPPSStatus
                    ? InquiryWarningRecoveredMalformedPPSStatus : InquiryWarningNone));
        context.transitionTo(SinkState::PE_SNK_Ready);
        if (refreshesSourceCapabilities) {
            context.requestAfterSourceCapabilitiesInquiry(
                previousRawPDO, previousVoltageMV, previousCurrentMA);
        }
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
