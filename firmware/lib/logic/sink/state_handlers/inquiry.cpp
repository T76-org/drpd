#include "inquiry.hpp"

#include "../sink_context.hpp"
#include "../inquiry_descriptor.hpp"
#include "../authentication_inquiry.hpp"
#include "../../../proto/pd_extended_header.hpp"
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
    _authenticationChunkState.begin(
        context.runtimeState().inquiryResult().status.type, _requestId);
    _trySend(context);
}

void InquiryStateHandler::handleMessageSenderStateChange(
    SinkContext& context, SinkMessageSenderState state) {
    if (state == SinkMessageSenderState::GoodCRCTimeout) {
        _finish(context, SinkInquiryOutcome::GoodCRCTimeout);
        return;
    }
    if (state == SinkMessageSenderState::GoodCRCReceived && _sent &&
        _responseTimeoutAlarmId == -1) {
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
    const auto resultSnapshot = context.runtimeState().inquiryResult();
    const auto descriptor = sinkInquiryDescriptor(resultSnapshot.status.type);
    if (!descriptor.has_value()) {
        _finish(context, SinkInquiryOutcome::ProtocolError);
        return;
    }
    if (header.messageClass() == Proto::PDHeader::MessageClass::Extended &&
        header.extendedMessageType() == Proto::ExtendedMessageType::Security_Request) {
        const auto body = message->rawBody();
        if (resultSnapshot.status.type != SinkInquiryType::Challenge || body.size() != 4) {
            _finish(context, SinkInquiryOutcome::ProtocolError);
            return;
        }
        const uint16_t raw = static_cast<uint16_t>(body[0]) |
            (static_cast<uint16_t>(body[1]) << 8);
        const Proto::PDExtendedHeader ext(raw);
        if (!ext.chunked() || !ext.requestChunk() || ext.dataSizeBytes() != 0 ||
            ext.chunkNumber() != 1 || body[2] != 0 || body[3] != 0 ||
            !_authenticationChunkState.accept(resultSnapshot.status.id, ext.chunkNumber()) ||
            !context.sendAuthenticationRequestChunk(
                SinkInquiryRequest{resultSnapshot.status.id, resultSnapshot.status.type,
                    resultSnapshot.parameters}, 1)) {
            _finish(context, SinkInquiryOutcome::ProtocolError);
        }
        return;
    }
    if (resultSnapshot.status.type == SinkInquiryType::Challenge &&
        header.messageClass() == Proto::PDHeader::MessageClass::Extended &&
        header.extendedMessageType() == Proto::ExtendedMessageType::Security_Response &&
        _authenticationChunkState.expected()) {
        _finish(context, SinkInquiryOutcome::ProtocolError);
        return;
    }
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
    InquiryMatch match = matchInquiryResponse(
        descriptor.value(), static_cast<uint32_t>(header.messageClass()),
        rawType, header.numDataObjects());
    const bool structuredDiscovery =
        descriptor->parameterKind == InquiryParameterKind::DiscoverIdentity ||
        descriptor->parameterKind == InquiryParameterKind::DiscoverSVIDs ||
        descriptor->parameterKind == InquiryParameterKind::DiscoverModes;
    if (match == InquiryMatch::Response && structuredDiscovery) {
        match = matchStructuredVDMResponse(
            descriptor.value(), resultSnapshot.parameters.argument, message->rawBody());
    }
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
        if (descriptor->parameterKind == InquiryParameterKind::Authentication) {
            const auto authentication = validateAuthenticationResponse(
                resultSnapshot.status.type, resultSnapshot.parameters, body);
            if (authentication == AuthenticationResponseKind::Malformed) {
                _finish(context, SinkInquiryOutcome::MalformedResponse);
                return;
            }
            // A well-formed Authentication ERROR is a protocol response, not
            // transport success or trust. Preserve it as the raw RESPONSE body.
        }
        if (!inquiryResponsePayloadSizeValid(
                descriptor.value(), body.size(),
                resultSnapshot.parameters.sopTarget != SinkInquirySOPTarget::SOP) ||
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
        if (resultSnapshot.status.type == SinkInquiryType::DiscoverIdentity &&
            !context.recordStructuredVDMIdentityACK(
                resultSnapshot.parameters.sopTarget, body)) {
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
    if (match == InquiryMatch::VDMNAK || match == InquiryMatch::VDMBusy) {
        context.runtimeState().finishInquiry(
            match == InquiryMatch::VDMNAK ? SinkInquiryOutcome::NAK : SinkInquiryOutcome::Busy,
            static_cast<uint32_t>(header.messageClass()), rawType, message->rawBody(),
            descriptor->warningFlags);
        context.transitionTo(SinkState::PE_SNK_Ready);
    }
    else if (match == InquiryMatch::NotSupported) _finish(context, SinkInquiryOutcome::NotSupported);
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
    _authenticationChunkState.reset();
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
