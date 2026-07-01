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

void EPRModeEntryStateHandler::_handleEntryRefusal(SinkContext& context, const char *reason) {
    auto& state = context.runtimeState();
    state._eprModeActive = false;
    state._eprEntryRefusedFallbackActive = true;
    context.reportError(reason);
    context.transitionTo(_nonEPRPostContractState(context));
}

SinkState EPRModeEntryStateHandler::_nonEPRPostContractState(SinkContext& context) const {
    const auto& state = context.runtimeState();
    if (state._negotiatedPDO.has_value() &&
        state._ppsStatusQueryEnabled &&
        std::holds_alternative<Proto::SPRPPSAPDO>(state._negotiatedPDO.value())) {
        return SinkState::PE_SNK_Get_PPS_Status;
    }

    return SinkState::PE_SNK_Ready;
}

const char *EPRModeEntryStateHandler::_enterFailedReasonText(uint8_t reason) const {
    switch (static_cast<Proto::EPRMode::FailureReason>(reason)) {
        case Proto::EPRMode::FailureReason::CableNotEprCapable:
            return "EPR entry refused: Cable not EPR Capable; "
                "falling back to SPR mode";
        case Proto::EPRMode::FailureReason::SourceNotVconnSource:
            return "EPR entry refused: Source failed to become VCONN Source; "
                "falling back to SPR mode";
        case Proto::EPRMode::FailureReason::EprCapableNotInRdo:
            return "EPR entry refused: EPR Capable bit not set in RDO; "
                "falling back to SPR mode";
        case Proto::EPRMode::FailureReason::SourceCannotEnterEpr:
            return "EPR entry refused: Source unable to enter EPR Mode; "
                "falling back to SPR mode";
        case Proto::EPRMode::FailureReason::EprCapableNotInPdo:
            return "EPR entry refused: EPR Capable bit not set in PDO; "
                "falling back to SPR mode";
        case Proto::EPRMode::FailureReason::UnknownCause:
        default:
            return "EPR entry refused: Unknown cause; falling back to SPR mode";
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

            if (response.action() == Proto::EPRMode::Action::EnterFailed) {
                _handleEntryRefusal(context, _enterFailedReasonText(response.data()));
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
            _handleEntryRefusal(
                context,
                "EPR entry refused by Source control response; "
                "falling back to SPR mode"
            );
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
    if (eventType == SinkTimeoutEventType::SinkTxOKRetryTimeout) {
        enter(context);
        return;
    }

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
        // Advertised EPR Sink Operational PDP for source-test policy, in 1 W units.
        if (!context.sendEPRMode(
            Proto::EPRMode::Action::Enter,
            LOGIC_SINK_EPR_OPERATIONAL_PDP_W)) {
            return;
        }

        _startEntryTimeout(context);
        _startSenderResponseTimeout(context);
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
