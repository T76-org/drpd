/**
 * @file get_pps_status.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "get_pps_status.hpp"

#include "../sink.hpp"

using namespace T76::DRPD::Logic;

int64_t GetPPSStatusStateHandler::_onResponseTimeoutCallback(
    alarm_id_t id,
    void *userData) {
    (void)id;
    auto *handler = static_cast<GetPPSStatusStateHandler *>(userData);
    handler->_responseTimeoutAlarmId = -1;
    if (handler->_context != nullptr) {
        handler->_context->enqueueTimeoutEvent(
            SinkTimeoutEvent{SinkTimeoutEventType::GetPPSStatusResponseTimeout}
        );
    }
    return 0;
}

void GetPPSStatusStateHandler::handleMessage(
    SinkContext& context,
    const T76::DRPD::PHY::BMCDecodedMessage *message) {
    const auto decodedHeader = message->decodedHeader();

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Extended) {
        const auto extendedType = decodedHeader.extendedMessageType();
        if (extendedType.has_value() &&
            extendedType.value() == Proto::ExtendedMessageType::PPS_Status) {
            const auto payload =
                context.takeCompletedExtendedPayload(Proto::ExtendedMessageType::PPS_Status);
            if (payload.has_value()) {
                Proto::PPSStatus status(payload->span());
                if (status.valid()) {
                    context.runtimeState()._ppsStatus = status;
                }
            }
            _finish(context);
            return;
        }
    }

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Control) {
        const auto controlType = decodedHeader.controlMessageType();
        if (controlType.has_value() &&
            (controlType.value() == Proto::ControlMessageType::Not_Supported ||
             controlType.value() == Proto::ControlMessageType::Reject ||
             controlType.value() == Proto::ControlMessageType::Wait)) {
            _finish(context);
            return;
        }
    }

    context.performReset(SinkResetType::SoftReset);
}

void GetPPSStatusStateHandler::handleMessageSenderStateChange(
    SinkContext& context,
    SinkMessageSenderState state) {
    if (state == SinkMessageSenderState::GoodCRCTimeout) {
        _finish(context);
    }
}

void GetPPSStatusStateHandler::handleTimeoutEvent(
    SinkContext& context,
    SinkTimeoutEventType eventType) {
    if (eventType == SinkTimeoutEventType::GetPPSStatusResponseTimeout) {
        _finish(context);
    }
}

void GetPPSStatusStateHandler::enter(SinkContext& context) {
    _bindContext(context);
    context.sendGetPPSStatus();

    _responseTimeoutAlarmId = context.addAlarmInUs(
        LOGIC_SINK_GET_PPS_STATUS_RESPONSE_TIMEOUT_US,
        _onResponseTimeoutCallback,
        this,
        true
    );
}

void GetPPSStatusStateHandler::reset(SinkContext& context) {
    if (_responseTimeoutAlarmId != -1) {
        context.cancelAlarm(_responseTimeoutAlarmId);
        _responseTimeoutAlarmId = -1;
    }
    _unbindContext();
}

void GetPPSStatusStateHandler::_finish(SinkContext& context) {
    if (_responseTimeoutAlarmId != -1) {
        context.cancelAlarm(_responseTimeoutAlarmId);
        _responseTimeoutAlarmId = -1;
    }
    context.transitionTo(SinkState::PE_SNK_Ready);
}
