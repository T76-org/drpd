/**
 * @file epr_mode_entry.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "epr_mode_entry.hpp"

#include "../sink.hpp"


using namespace T76::DRPD::Logic;


int64_t EPRModeEntryStateHandler::_onEntryTimeoutCallback(alarm_id_t id, void *user_data) {
    (void)id;
    auto *handler = static_cast<EPRModeEntryStateHandler *>(user_data);
    handler->_entryTimeoutAlarmId = -1;
    if (handler->_context != nullptr) {
        handler->_context->enqueueTimeoutEvent(
            SinkTimeoutEvent{SinkTimeoutEventType::EPRModeEntryTimeout}
        );
    }
    return 0;
}

int64_t EPRModeEntryStateHandler::_onSenderResponseTimeoutCallback(
    alarm_id_t id,
    void *user_data) {
    (void)id;
    auto *handler = static_cast<EPRModeEntryStateHandler *>(user_data);
    handler->_senderResponseTimeoutAlarmId = -1;
    if (handler->_context != nullptr) {
        handler->_context->enqueueTimeoutEvent(
            SinkTimeoutEvent{SinkTimeoutEventType::EPRModeEntrySenderResponseTimeout}
        );
    }
    return 0;
}

void EPRModeEntryStateHandler::_startEntryTimeout(SinkContext& context) {
    if (_entryTimeoutAlarmId != -1) {
        return;
    }

    _entryTimeoutAlarmId = context.addAlarmInUs(
        LOGIC_SINK_EPR_MODE_ENTRY_TIMEOUT_US,
        _onEntryTimeoutCallback,
        this,
        true
    );
}

void EPRModeEntryStateHandler::_startSenderResponseTimeout(SinkContext& context) {
    if (_senderResponseTimeoutAlarmId != -1) {
        return;
    }

    _senderResponseTimeoutAlarmId = context.addAlarmInUs(
        LOGIC_SINK_EPR_MODE_ENTRY_SENDER_RESPONSE_TIMEOUT_US,
        _onSenderResponseTimeoutCallback,
        this,
        true
    );
}

void EPRModeEntryStateHandler::_stopSenderResponseTimeout(SinkContext& context) {
    if (_senderResponseTimeoutAlarmId == -1) {
        return;
    }

    context.cancelAlarm(_senderResponseTimeoutAlarmId);
    _senderResponseTimeoutAlarmId = -1;
}

void EPRModeEntryStateHandler::_onEntryTimeout() {
    if (_context != nullptr) {
        _context->setEPRModeActive(false);
        _context->performReset(SinkResetType::SoftReset);
    }
}

void EPRModeEntryStateHandler::_onSenderResponseTimeout() {
    if (_context != nullptr) {
        _context->setEPRModeActive(false);
        _context->performReset(SinkResetType::SoftReset);
    }
}

void EPRModeEntryStateHandler::handleMessage(
    SinkContext& context,
    const T76::DRPD::PHY::BMCDecodedMessage *message) {
    const auto decodedHeader = message->decodedHeader();

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Data) {
        const auto dataType = decodedHeader.dataMessageType();

        if (dataType.has_value() && dataType.value() == Proto::DataMessageType::EPR_Mode) {
            if (message->rawBody().size() < 4) {
                context.performReset(SinkResetType::SoftReset);
                return;
            }

            const auto body = message->rawBody();
            const uint32_t rawEprMode = static_cast<uint32_t>(body[0]) |
                (static_cast<uint32_t>(body[1]) << 8) |
                (static_cast<uint32_t>(body[2]) << 16) |
                (static_cast<uint32_t>(body[3]) << 24);

            const Proto::EPRMode response(rawEprMode);
            if (response.isMessageInvalid()) {
                context.performReset(SinkResetType::SoftReset);
                return;
            }

            const auto currentState = context.runtimeState()._state;

            if (currentState == SinkState::PE_SNK_Send_EPR_Mode_Entry &&
                response.action() == Proto::EPRMode::Action::EnterAcknowledged) {
                _stopSenderResponseTimeout(context);
                context.transitionTo(SinkState::PE_SNK_EPR_Mode_Wait_For_Response);
                return;
            }

            if (currentState == SinkState::PE_SNK_EPR_Mode_Wait_For_Response &&
                response.action() == Proto::EPRMode::Action::EnterSucceeded) {
                context.setEPRModeActive(true);
                context.transitionTo(SinkState::PE_SNK_Get_Source_Cap);
                return;
            }

            context.setEPRModeActive(false);
            context.performReset(SinkResetType::SoftReset);
            return;
        }
    }

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Control) {
        const auto controlType = decodedHeader.controlMessageType();

        if (controlType.has_value() &&
            controlType.value() == Proto::ControlMessageType::VCONN_Swap) {
            // DRPD does not source VCONN. During EPR entry, report that
            // explicitly and leave the Source to fail/continue the entry flow.
            context.sendNotSupportedMessage();
            return;
        }

        if (controlType.has_value() &&
            (controlType.value() == Proto::ControlMessageType::Reject ||
             controlType.value() == Proto::ControlMessageType::Not_Supported ||
             controlType.value() == Proto::ControlMessageType::Wait)) {
            context.setEPRModeActive(false);
            context.performReset(SinkResetType::SoftReset);
            return;
        }
    }

    context.performReset(SinkResetType::SoftReset);
}

void EPRModeEntryStateHandler::handleMessageSenderStateChange(
    SinkContext& context,
    SinkMessageSenderState state) {
    if (state == SinkMessageSenderState::GoodCRCTimeout) {
        context.performReset(SinkResetType::SoftReset);
    }
}

void EPRModeEntryStateHandler::handleTimeoutEvent(
    SinkContext& context,
    SinkTimeoutEventType eventType) {
    (void)context;
    if (eventType == SinkTimeoutEventType::EPRModeEntrySenderResponseTimeout) {
        _onSenderResponseTimeout();
        return;
    }

    if (eventType == SinkTimeoutEventType::EPRModeEntryTimeout) {
        _onEntryTimeout();
    }
}

void EPRModeEntryStateHandler::enter(SinkContext& context) {
    _bindContext(context);

    if (context.runtimeState()._state == SinkState::PE_SNK_Send_EPR_Mode_Entry) {
        _startEntryTimeout(context);
        _startSenderResponseTimeout(context);

        // Advertised EPR Sink Operational PDP for source-test policy, in 1 W units.
        context.sendEPRMode(
            Proto::EPRMode::Action::Enter,
            LOGIC_SINK_EPR_OPERATIONAL_PDP_W);
    }
}

void EPRModeEntryStateHandler::reset(SinkContext& context) {
    if (_senderResponseTimeoutAlarmId != -1) {
        context.cancelAlarm(_senderResponseTimeoutAlarmId);
        _senderResponseTimeoutAlarmId = -1;
    }

    if (context.runtimeState()._state == SinkState::PE_SNK_EPR_Mode_Wait_For_Response) {
        _bindContext(context);
        return;
    }

    if (_entryTimeoutAlarmId != -1) {
        context.cancelAlarm(_entryTimeoutAlarmId);
        _entryTimeoutAlarmId = -1;
    }
    _unbindContext();
}
