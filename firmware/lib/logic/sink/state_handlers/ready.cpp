/**
 * @file ready.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "ready.hpp"

#include <variant>

#include "../sink.hpp"


using namespace T76::DRPD::Logic;


int64_t ReadySinkStateHandler::_onSinkRequestTimeoutCallback(
    alarm_id_t id,
    void *user_data) {
    (void)id;
    auto *handler = static_cast<ReadySinkStateHandler *>(user_data);
    handler->_sinkRequestTimerAlarmId = -1;
    if (handler->_context != nullptr) {
        handler->_context->enqueueTimeoutEvent(
            SinkTimeoutEvent{SinkTimeoutEventType::ReadySinkRequestTimeout}
        );
    }
    return 0;
}

int64_t ReadySinkStateHandler::_onPDORefreshTimeoutCallback(
    alarm_id_t id,
    void *user_data) {
    (void)id;
    auto *handler = static_cast<ReadySinkStateHandler *>(user_data);
    handler->_pdoRefreshTimerAlarmId = -1;
    if (handler->_context != nullptr) {
        handler->_context->enqueueTimeoutEvent(
            SinkTimeoutEvent{SinkTimeoutEventType::ReadyPDORefreshTimeout}
        );
    }
    return 0;
}

void ReadySinkStateHandler::_onSinkRequestTimeout() {
    if (_context != nullptr) {
        _context->transitionTo(SinkState::PE_SNK_Select_Capability);
    }
}

void ReadySinkStateHandler::_onPDORefreshTimeout() {
    if (_context != nullptr) {
        auto& state = _context->runtimeState();
        state._pendingRequestedPDO = state._negotiatedPDO;
        state._pendingVoltage = state._negotiatedVoltage;
        state._pendingCurrent = state._negotiatedCurrent;
        _context->transitionTo(SinkState::PE_SNK_Select_Capability);
    }
}

void ReadySinkStateHandler::handleMessage(
    SinkContext& context,
    const T76::DRPD::PHY::BMCDecodedMessage *message) {
    if (_sinkRequestTimerAlarmId != -1) {
        context.cancelAlarm(_sinkRequestTimerAlarmId);
        _sinkRequestTimerAlarmId = -1;
    }
    if (_pdoRefreshTimerAlarmId != -1) {
        context.cancelAlarm(_pdoRefreshTimerAlarmId);
        _pdoRefreshTimerAlarmId = -1;
    }

    const Proto::PDHeader decodedHeader = message->decodedHeader();

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Data) {
        const auto dataMessageType = decodedHeader.dataMessageType();

        if (dataMessageType.has_value() && dataMessageType.value() == Proto::DataMessageType::Source_Capabilities) {
            context.setSourceCapabilities(
                Proto::SourceCapabilities(message->rawBody(), decodedHeader.numDataObjects()));

            auto& state = context.runtimeState();
            state._pendingRequestedPDO = state._negotiatedPDO;
            state._pendingVoltage = state._negotiatedVoltage;
            state._pendingCurrent = state._negotiatedCurrent;

            context.transitionTo(SinkState::PE_SNK_Select_Capability);
            return;
        }
    }

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Extended) {
        const auto extendedType = decodedHeader.extendedMessageType();

        if (extendedType.has_value() &&
            (extendedType.value() == Proto::ExtendedMessageType::EPR_Source_Capabilities ||
             extendedType.value() == Proto::ExtendedMessageType::Extended_Control)) {
            context.transitionTo(SinkState::PE_SNK_EPR_Keepalive);
            context.runtimeState()._currentStateHandler->handleMessage(context, message);
            return;
        }
    }

    context.sendNotSupportedMessage();
}

void ReadySinkStateHandler::handleMessageSenderStateChange(
    SinkContext& context,
    SinkMessageSenderState state) {
    (void)context;
    (void)state;
}

void ReadySinkStateHandler::handleTimeoutEvent(
    SinkContext& context,
    SinkTimeoutEventType eventType) {
    (void)context;
    if (eventType == SinkTimeoutEventType::ReadySinkRequestTimeout) {
        _onSinkRequestTimeout();
        return;
    }

    if (eventType == SinkTimeoutEventType::ReadyPDORefreshTimeout) {
        _onPDORefreshTimeout();
    }
}

void ReadySinkStateHandler::enter(SinkContext& context) {
    _bindContext(context);
    auto& state = context.runtimeState();

    if (state._pendingRequestedPDO.has_value()) {
        _sinkRequestTimerAlarmId = context.addAlarmInUs(
            LOGIC_SINK_READY_SINK_REQUEST_TIMER_US,
            _onSinkRequestTimeoutCallback,
            this,
            true
        );
    }

    if (state._negotiatedPDO.has_value()) {
        const auto &pdo = state._negotiatedPDO.value();

        if (std::holds_alternative<Proto::EPRAVSAPDO>(pdo) && state._eprModeActive) {
            context.transitionTo(SinkState::PE_SNK_EPR_Keepalive);
            return;
        }

        bool requiresRefresh = false;

        if (std::holds_alternative<Proto::SPRPPSAPDO>(pdo)) {
            requiresRefresh = true;
        } else if (std::holds_alternative<Proto::SPRAVSAPDO>(pdo)) {
            requiresRefresh = true;
        }

        if (requiresRefresh) {
            _pdoRefreshTimerAlarmId = context.addAlarmInUs(
                LOGIC_SINK_READY_PDO_PPS_REFRESH_TIMER_US,
                _onPDORefreshTimeoutCallback,
                this,
                true
            );
        }
    }
}

void ReadySinkStateHandler::reset(SinkContext& context) {
    if (_sinkRequestTimerAlarmId != -1) {
        context.cancelAlarm(_sinkRequestTimerAlarmId);
        _sinkRequestTimerAlarmId = -1;
    }
    if (_pdoRefreshTimerAlarmId != -1) {
        context.cancelAlarm(_pdoRefreshTimerAlarmId);
        _pdoRefreshTimerAlarmId = -1;
    }
    _unbindContext();
}
