/**
 * @file transition_sink.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "transition_sink.hpp"

#include "../sink.hpp"


using namespace T76::DRPD::Logic;


int64_t TransitionSinkStateHandler::_onTransitionTimeoutCallback(
    alarm_id_t id,
    void *user_data) {
    (void)id;
    auto *handler = static_cast<TransitionSinkStateHandler *>(user_data);
    handler->_transitionTimeoutAlarmId = -1;
    if (handler->_context != nullptr) {
        handler->_context->enqueueTimeoutEvent(
            SinkTimeoutEvent{SinkTimeoutEventType::TransitionSinkTimeout}
        );
    }
    return 0;
}

void TransitionSinkStateHandler::_onTransitionTimeout() {
    if (_context != nullptr) {
        _context->performReset(SinkResetType::HardReset);
    }
}

void TransitionSinkStateHandler::handleMessage(
    SinkContext& context,
    const T76::DRPD::PHY::BMCDecodedMessage *message) {
    if (_transitionTimeoutAlarmId != -1) {
        context.cancelAlarm(_transitionTimeoutAlarmId);
        _transitionTimeoutAlarmId = -1;
    }

    const auto decodedHeader = message->decodedHeader();

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Control) {
        const auto controlMessageType = decodedHeader.controlMessageType();

        if (controlMessageType.has_value() && controlMessageType.value() == Proto::ControlMessageType::PS_RDY) {
            auto& state = context.runtimeState();
            const bool firstExplicitContract = !state._hasExplicitContract;
            state._hasExplicitContract = true;

            if (firstExplicitContract &&
                state._sourceSupportsEpr &&
                !state._eprModeActive &&
                !state._eprEntryAttempted) {
                state._eprEntryAttempted = true;
                context.transitionTo(SinkState::PE_SNK_EPR_Mode_Entry);
                return;
            }

            if (state._eprModeActive) {
                context.transitionTo(SinkState::PE_SNK_EPR_Keepalive);
            } else {
                context.transitionTo(SinkState::PE_SNK_Ready);
            }
            return;
        }
    }

    context.performReset(SinkResetType::SoftReset);
}

void TransitionSinkStateHandler::handleMessageSenderStateChange(
    SinkContext& context,
    SinkMessageSenderState state) {
    (void)context;
    (void)state;
}

void TransitionSinkStateHandler::handleTimeoutEvent(
    SinkContext& context,
    SinkTimeoutEventType eventType) {
    (void)context;
    if (eventType == SinkTimeoutEventType::TransitionSinkTimeout) {
        _onTransitionTimeout();
    }
}

void TransitionSinkStateHandler::enter(SinkContext& context) {
    _bindContext(context);
    const auto& state = context.runtimeState();
    bool useEprTimeout = state._eprModeActive;

    if (state._pendingRequestedPDO.has_value() &&
        std::holds_alternative<Proto::EPRAVSAPDO>(state._pendingRequestedPDO.value())) {
        useEprTimeout = true;
    }

    const uint32_t timeoutUs = useEprTimeout
        ? LOGIC_SINK_TRANSITION_SINK_TIMEOUT_EPR_US
        : LOGIC_SINK_TRANSITION_SINK_TIMEOUT_SPR_US;

    _transitionTimeoutAlarmId = context.addAlarmInUs(
        timeoutUs,
        _onTransitionTimeoutCallback,
        this,
        true
    );
}

void TransitionSinkStateHandler::reset(SinkContext& context) {
    if (_transitionTimeoutAlarmId != -1) {
        context.cancelAlarm(_transitionTimeoutAlarmId);
        _transitionTimeoutAlarmId = -1;
    }
    _unbindContext();
}
