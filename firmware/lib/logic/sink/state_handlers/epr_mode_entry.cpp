/**
 * @file epr_mode_entry.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "epr_mode_entry.hpp"

#include "../sink.hpp"


using namespace T76::DRPD::Logic;


int64_t EPRModeEntryStateHandler::_onEntryTimeoutCallback(alarm_id_t id, void *user_data) {
    auto *handler = static_cast<EPRModeEntryStateHandler *>(user_data);
    handler->_entryTimeoutAlarmId = -1;
    handler->_onEntryTimeout();
    return 0;
}

void EPRModeEntryStateHandler::_onEntryTimeout() {
    _sink._setEPRModeActive(false);
    _sink._setState(SinkState::PE_SNK_Ready);
}

void EPRModeEntryStateHandler::handleMessage(const T76::DRPD::PHY::BMCDecodedMessage *message) {
    const auto decodedHeader = message->decodedHeader();

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Data) {
        const auto dataType = decodedHeader.dataMessageType();

        if (dataType.has_value() && dataType.value() == Proto::DataMessageType::EPR_Mode) {
            if (message->rawBody().size() < 4) {
                _sink.reset(SinkResetType::SoftReset);
                return;
            }

            const auto body = message->rawBody();
            const uint32_t rawEprMode = static_cast<uint32_t>(body[0]) |
                (static_cast<uint32_t>(body[1]) << 8) |
                (static_cast<uint32_t>(body[2]) << 16) |
                (static_cast<uint32_t>(body[3]) << 24);

            const Proto::EPRMode response(rawEprMode);
            if (response.isMessageInvalid()) {
                _sink.reset(SinkResetType::SoftReset);
                return;
            }

            if (response.action() == Proto::EPRMode::Action::EnterAcknowledged) {
                _enterAcknowledged = true;
                return;
            }

            if (response.action() == Proto::EPRMode::Action::EnterSucceeded) {
                _sink._setEPRModeActive(true);
                _sink._setState(SinkState::PE_SNK_EPR_Keepalive);
                return;
            }

            if (response.action() == Proto::EPRMode::Action::EnterFailed ||
                response.action() == Proto::EPRMode::Action::Exit) {
                _sink._setEPRModeActive(false);
                _sink._setState(SinkState::PE_SNK_Ready);
                return;
            }
        }
    }

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Control) {
        const auto controlType = decodedHeader.controlMessageType();

        if (controlType.has_value() &&
            (controlType.value() == Proto::ControlMessageType::Reject ||
             controlType.value() == Proto::ControlMessageType::Not_Supported ||
             controlType.value() == Proto::ControlMessageType::Wait)) {
            _sink._setEPRModeActive(false);
            _sink._setState(SinkState::PE_SNK_Ready);
            return;
        }
    }

    _sink.reset(SinkResetType::SoftReset);
}

void EPRModeEntryStateHandler::handleMessageSenderStateChange(SinkMessageSenderState state) {
    if (state == SinkMessageSenderState::GoodCRCReceived && _entryTimeoutAlarmId == -1) {
        _entryTimeoutAlarmId = add_alarm_in_us(
            LOGIC_SINK_EPR_MODE_ENTRY_RESPONSE_TIMEOUT_US,
            _onEntryTimeoutCallback,
            this,
            true
        );
    }
}

void EPRModeEntryStateHandler::enter() {
    _enterAcknowledged = false;

    // 100 W operational PDP in 1 W units.
    _sink._sendEPRMode(Proto::EPRMode::Action::Enter, 100);
}

void EPRModeEntryStateHandler::reset() {
    if (_entryTimeoutAlarmId != -1) {
        cancel_alarm(_entryTimeoutAlarmId);
        _entryTimeoutAlarmId = -1;
    }

    _enterAcknowledged = false;
}
