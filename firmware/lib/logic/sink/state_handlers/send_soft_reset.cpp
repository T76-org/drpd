/**
 * @file send_soft_reset.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "send_soft_reset.hpp"

#include "../sink_context.hpp"
#include "../../../phy/bmc_encoded_message.hpp"


using namespace T76::DRPD::Logic;


int64_t SendSoftResetStateHandler::_onResponseTimeoutCallback(
    alarm_id_t id,
    void *user_data) {
    (void)id;
    SendSoftResetStateHandler *handler =
        static_cast<SendSoftResetStateHandler *>(user_data);
    handler->_responseTimeoutAlarmId = -1;
    if (handler->_context != nullptr) {
        handler->_context->enqueueTimeoutEvent(
            SinkTimeoutEvent{SinkTimeoutEventType::SoftResetResponseTimeout}
        );
    }
    return 0;
}

void SendSoftResetStateHandler::handleMessage(
    SinkContext& context,
    const PHY::BMCDecodedMessage *message) {
    const Proto::PDHeader decodedHeader = message->decodedHeader();

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Control) {
        const auto controlMessageType = decodedHeader.controlMessageType();
        if (controlMessageType.has_value() &&
            controlMessageType.value() == Proto::ControlMessageType::Accept) {
            if (_responseTimeoutAlarmId != -1) {
                context.cancelAlarm(_responseTimeoutAlarmId);
                _responseTimeoutAlarmId = -1;
            }
            context.transitionTo(SinkState::PE_SNK_Wait_for_Capabilities);
            return;
        }
    }

    context.performReset(SinkResetType::HardReset);
}

void SendSoftResetStateHandler::handleMessageSenderStateChange(
    SinkContext& context,
    SinkMessageSenderState state) {
    if (state == SinkMessageSenderState::GoodCRCReceived) {
        _startResponseTimer(context);
        return;
    }

    if (state == SinkMessageSenderState::GoodCRCTimeout) {
        context.performReset(SinkResetType::HardReset);
    }
}

void SendSoftResetStateHandler::handleTimeoutEvent(
    SinkContext& context,
    SinkTimeoutEventType eventType) {
    if (eventType == SinkTimeoutEventType::SoftResetResponseTimeout) {
        context.performReset(SinkResetType::HardReset);
    }
}

void SendSoftResetStateHandler::enter(SinkContext& context) {
    _bindContext(context);
    context.sendMessageAndAwaitGoodCRC(
        PHY::BMCEncodedMessage::softResetMessage(
            Proto::PDHeader::PortDataRole::UFP,
            Proto::PDHeader::PortPowerRole::Sink,
            context.specRevision()
        )
    );
}

void SendSoftResetStateHandler::reset(SinkContext& context) {
    if (_responseTimeoutAlarmId != -1) {
        context.cancelAlarm(_responseTimeoutAlarmId);
        _responseTimeoutAlarmId = -1;
    }
    _unbindContext();
}

void SendSoftResetStateHandler::_startResponseTimer(SinkContext& context) {
    if (_responseTimeoutAlarmId != -1) {
        context.cancelAlarm(_responseTimeoutAlarmId);
    }

    _responseTimeoutAlarmId = context.addAlarmInUs(
        LOGIC_SINK_SOFT_RESET_RESPONSE_TIMEOUT_US,
        _onResponseTimeoutCallback,
        this,
        true
    );
}
