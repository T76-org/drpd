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
    auto *handler = static_cast<ReadySinkStateHandler *>(user_data);
    handler->_sinkRequestTimerAlarmId = -1;
    handler->_onSinkRequestTimeout();
    return 0;
}

int64_t ReadySinkStateHandler::_onPDORefreshTimeoutCallback(
    alarm_id_t id,
    void *user_data) {
    auto *handler = static_cast<ReadySinkStateHandler *>(user_data);
    handler->_pdoRefreshTimerAlarmId = -1;
    handler->_onPDORefreshTimeout();
    return 0;
}

void ReadySinkStateHandler::_onSinkRequestTimeout() {
    _sink._setState(SinkState::PE_SNK_Select_Capability);
}

void ReadySinkStateHandler::_onPDORefreshTimeout() {
    _sink._pendingRequestedPDO = _sink._negotiatedPDO;
    _sink._pendingVoltage = _sink._negotiatedVoltage;
    _sink._pendingCurrent = _sink._negotiatedCurrent;

    _sink._setState(SinkState::PE_SNK_Select_Capability);
}

void ReadySinkStateHandler::handleMessage(const T76::DRPD::PHY::BMCDecodedMessage *message) {
    if (_sinkRequestTimerAlarmId != -1) {
        cancel_alarm(_sinkRequestTimerAlarmId);
        _sinkRequestTimerAlarmId = -1;
    }
    if (_pdoRefreshTimerAlarmId != -1) {
        cancel_alarm(_pdoRefreshTimerAlarmId);
        _pdoRefreshTimerAlarmId = -1;
    }

    const Proto::PDHeader decodedHeader = message->decodedHeader();

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Data) {
        const auto dataMessageType = decodedHeader.dataMessageType();

        if (dataMessageType.has_value() && dataMessageType.value() == Proto::DataMessageType::Source_Capabilities) {
            _sink._setSourceCapabilities(Proto::SourceCapabilities(message->rawBody(), decodedHeader.numDataObjects()));

            _sink._pendingRequestedPDO = _sink._negotiatedPDO;
            _sink._pendingVoltage = _sink._negotiatedVoltage;
            _sink._pendingCurrent = _sink._negotiatedCurrent;

            _sink._setState(SinkState::PE_SNK_Select_Capability);
            return;
        }
    }

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Extended) {
        const auto extendedType = decodedHeader.extendedMessageType();

        if (extendedType.has_value() &&
            (extendedType.value() == Proto::ExtendedMessageType::EPR_Source_Capabilities ||
             extendedType.value() == Proto::ExtendedMessageType::Extended_Control)) {
            _sink._setState(SinkState::PE_SNK_EPR_Keepalive);
            _sink._currentStateHandler->handleMessage(message);
            return;
        }
    }

    _sink._sendNotSupportedMessage();
}

void ReadySinkStateHandler::handleMessageSenderStateChange(SinkMessageSenderState state) {
    (void)state;
}

void ReadySinkStateHandler::enter() {
    if (_sink._pendingRequestedPDO.has_value()) {
        _sinkRequestTimerAlarmId = add_alarm_in_us(
            LOGIC_SINK_READY_SINK_REQUEST_TIMER_US,
            _onSinkRequestTimeoutCallback,
            this,
            true
        );
    }

    if (_sink._negotiatedPDO.has_value()) {
        const auto &pdo = _sink._negotiatedPDO.value();

        if (std::holds_alternative<Proto::EPRAVSAPDO>(pdo) && _sink._eprModeActive) {
            _sink._setState(SinkState::PE_SNK_EPR_Keepalive);
            return;
        }

        bool requiresRefresh = false;

        if (std::holds_alternative<Proto::SPRPPSAPDO>(pdo)) {
            requiresRefresh = true;
        } else if (std::holds_alternative<Proto::SPRAVSAPDO>(pdo)) {
            requiresRefresh = true;
        }

        if (requiresRefresh) {
            _pdoRefreshTimerAlarmId = add_alarm_in_us(
                LOGIC_SINK_READY_PDO_PPS_REFRESH_TIMER_US,
                _onPDORefreshTimeoutCallback,
                this,
                true
            );
        }
    }
}

void ReadySinkStateHandler::reset() {
    if (_sinkRequestTimerAlarmId != -1) {
        cancel_alarm(_sinkRequestTimerAlarmId);
        _sinkRequestTimerAlarmId = -1;
    }
    if (_pdoRefreshTimerAlarmId != -1) {
        cancel_alarm(_pdoRefreshTimerAlarmId);
        _pdoRefreshTimerAlarmId = -1;
    }
}
