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
    auto *handler = static_cast<TransitionSinkStateHandler *>(user_data);
    handler->_transitionTimeoutAlarmId = -1;
    handler->_onTransitionTimeout();
    return 0;
}

void TransitionSinkStateHandler::_onTransitionTimeout() {
    _sink.reset(SinkResetType::HardReset);
}

void TransitionSinkStateHandler::handleMessage(const T76::DRPD::PHY::BMCDecodedMessage *message) {
    if (_transitionTimeoutAlarmId != -1) {
        cancel_alarm(_transitionTimeoutAlarmId);
        _transitionTimeoutAlarmId = -1;
    }

    const auto decodedHeader = message->decodedHeader();

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Control) {
        const auto controlMessageType = decodedHeader.controlMessageType();

        if (controlMessageType.has_value() && controlMessageType.value() == Proto::ControlMessageType::PS_RDY) {
            const bool firstExplicitContract = !_sink._hasExplicitContract;
            _sink._hasExplicitContract = true;

            if (firstExplicitContract &&
                _sink._sourceSupportsEpr &&
                !_sink._eprModeActive &&
                !_sink._eprEntryAttempted) {
                _sink._eprEntryAttempted = true;
                _sink._setState(SinkState::PE_SNK_EPR_Mode_Entry);
                return;
            }

            if (_sink._eprModeActive) {
                _sink._setState(SinkState::PE_SNK_EPR_Keepalive);
            } else {
                _sink._setState(SinkState::PE_SNK_Ready);
            }
            return;
        }
    }

    _sink.reset(SinkResetType::SoftReset);
}

void TransitionSinkStateHandler::handleMessageSenderStateChange(SinkMessageSenderState state) {
    (void)state;
}

void TransitionSinkStateHandler::enter() {
    bool useEprTimeout = _sink._eprModeActive;

    if (_sink._pendingRequestedPDO.has_value() &&
        std::holds_alternative<Proto::EPRAVSAPDO>(_sink._pendingRequestedPDO.value())) {
        useEprTimeout = true;
    }

    const uint32_t timeoutUs = useEprTimeout
        ? LOGIC_SINK_TRANSITION_SINK_TIMEOUT_EPR_US
        : LOGIC_SINK_TRANSITION_SINK_TIMEOUT_SPR_US;

    _transitionTimeoutAlarmId = add_alarm_in_us(
        timeoutUs,
        _onTransitionTimeoutCallback,
        this,
        true
    );
}

void TransitionSinkStateHandler::reset() {
    if (_transitionTimeoutAlarmId != -1) {
        cancel_alarm(_transitionTimeoutAlarmId);
        _transitionTimeoutAlarmId = -1;
    }
}
