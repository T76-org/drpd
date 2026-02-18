/**
 * @file epr_keepalive.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "epr_keepalive.hpp"

#include "../sink.hpp"


using namespace T76::DRPD::Logic;


int64_t EPRKeepaliveStateHandler::_onKeepaliveIntervalTimeoutCallback(
    alarm_id_t id,
    void *user_data) {
    auto *handler = static_cast<EPRKeepaliveStateHandler *>(user_data);
    handler->_keepaliveIntervalAlarmId = -1;
    handler->_onKeepaliveIntervalTimeout();
    return 0;
}

int64_t EPRKeepaliveStateHandler::_onSourceWatchdogTimeoutCallback(alarm_id_t id, void *user_data) {
    auto *handler = static_cast<EPRKeepaliveStateHandler *>(user_data);
    handler->_sourceWatchdogAlarmId = -1;
    handler->_onSourceWatchdogTimeout();
    return 0;
}

void EPRKeepaliveStateHandler::_onKeepaliveIntervalTimeout() {
    if (_context == nullptr) {
        return;
    }

    _awaitingKeepaliveAck = true;
    // Keepalive is periodic best-effort; avoid rapid GoodCRC retry bursts.
    _context->sendExtendedControlMessage(
        static_cast<uint8_t>(Sink::ExtendedControlType::EPR_KeepAlive),
        false);

    _keepaliveIntervalAlarmId = _context->addAlarmInUs(
        LOGIC_SINK_EPR_KEEPALIVE_INTERVAL_US,
        _onKeepaliveIntervalTimeoutCallback,
        this,
        true
    );
}

void EPRKeepaliveStateHandler::_onSourceWatchdogTimeout() {
    if (_context == nullptr) {
        return;
    }

    _keepaliveFailureCount++;

    if (_keepaliveFailureCount >= 3) {
        _exitEPRMode();
        return;
    }

    _sourceWatchdogAlarmId = _context->addAlarmInUs(
        LOGIC_SINK_EPR_SOURCE_KEEPALIVE_WATCHDOG_US,
        _onSourceWatchdogTimeoutCallback,
        this,
        true
    );
}

void EPRKeepaliveStateHandler::_exitEPRMode() {
    if (_context == nullptr) {
        return;
    }

    _context->sendEPRMode(Proto::EPRMode::Action::Exit, 0);
    _context->setEPRModeActive(false);
    _context->clearEPRSourceCapabilities();

    if (_context->runtimeState()._negotiatedPDO.has_value()) {
        _context->transitionTo(SinkState::PE_SNK_Ready);
    } else {
        _context->transitionTo(SinkState::PE_SNK_Wait_for_Capabilities);
    }
}

void EPRKeepaliveStateHandler::handleMessage(
    SinkContext& context,
    const T76::DRPD::PHY::BMCDecodedMessage *message) {
    const auto decodedHeader = message->decodedHeader();

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Extended) {
        const auto type = decodedHeader.extendedMessageType();

        if (type.has_value() &&
            type.value() == Proto::ExtendedMessageType::EPR_Source_Capabilities) {
            const auto payload = context.takeCompletedExtendedPayload(type.value());

            if (!payload.has_value()) {
                return;
            }

            const Proto::EPRSourceCapabilities eprCapabilities(payload.value().span());
            if (eprCapabilities.isMessageInvalid()) {
                context.performReset(SinkResetType::SoftReset);
                return;
            }

            context.setEPRSourceCapabilities(eprCapabilities);
            // Per EPR flow, establish an explicit EPR contract before entering ready.
            // Start from EPR PDO #0 (commonly the 5V EPR entry contract).
            if (!context.requestPDO(0, 5000, 0)) {
                context.performReset(SinkResetType::SoftReset);
            }
            return;
        }

        if (type.has_value() && type.value() == Proto::ExtendedMessageType::Extended_Control) {
            const auto payload = context.takeCompletedExtendedPayload(type.value());
            const auto payloadSpan = payload.has_value()
                ? payload.value().span()
                : std::span<const uint8_t>{};

            if (!payload.has_value() || payloadSpan.empty()) {
                return;
            }

            const uint8_t controlType = payloadSpan.front();
            const bool isKeepalive =
                controlType == static_cast<uint8_t>(Sink::ExtendedControlType::EPR_KeepAlive);
            const bool isKeepaliveAck = controlType ==
                static_cast<uint8_t>(Sink::ExtendedControlType::EPR_KeepAlive_Ack);

            if (isKeepalive) {
                // Source keepalive must be acknowledged.
                context.sendExtendedControlMessage(
                    static_cast<uint8_t>(Sink::ExtendedControlType::EPR_KeepAlive_Ack),
                    false);
            }

            if (isKeepalive || isKeepaliveAck) {
                if (isKeepaliveAck) {
                    _awaitingKeepaliveAck = false;
                }
                _keepaliveFailureCount = 0;

                if (_sourceWatchdogAlarmId != -1) {
                    context.cancelAlarm(_sourceWatchdogAlarmId);
                    _sourceWatchdogAlarmId = -1;
                }

                _sourceWatchdogAlarmId = context.addAlarmInUs(
                    LOGIC_SINK_EPR_SOURCE_KEEPALIVE_WATCHDOG_US,
                    _onSourceWatchdogTimeoutCallback,
                    this,
                    true
                );
                return;
            }

            return;
        }
    }

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
            const Proto::EPRMode eprMode(rawEprMode);

            if (eprMode.action() == Proto::EPRMode::Action::Exit) {
                context.setEPRModeActive(false);
                context.clearEPRSourceCapabilities();
                context.transitionTo(SinkState::PE_SNK_Ready);
                return;
            }
        }

        if (dataType.has_value() &&
            dataType.value() == Proto::DataMessageType::Source_Capabilities) {
            context.setSourceCapabilities(Proto::SourceCapabilities(
                message->rawBody(), decodedHeader.numDataObjects()));
            return;
        }
    }

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Control) {
        const auto controlType = decodedHeader.controlMessageType();

        if (controlType.has_value() &&
            controlType.value() == Proto::ControlMessageType::Soft_Reset) {
            context.performReset(SinkResetType::SoftReset);
            return;
        }
    }
}

void EPRKeepaliveStateHandler::handleMessageSenderStateChange(
    SinkContext& context,
    SinkMessageSenderState state) {
    (void)context;
    if (state == SinkMessageSenderState::GoodCRCTimeout) {
        _awaitingKeepaliveAck = false;
        _keepaliveFailureCount++;
        if (_keepaliveFailureCount >= 3) {
            _exitEPRMode();
        }
    }
}

void EPRKeepaliveStateHandler::enter(SinkContext& context) {
    _bindContext(context);
    _awaitingKeepaliveAck = false;
    _keepaliveFailureCount = 0;

    if (!context.runtimeState()._eprCapabilities.has_value()) {
        context.sendExtendedControlMessage(
            static_cast<uint8_t>(Sink::ExtendedControlType::EPR_Get_Source_Cap));
    }

    _keepaliveIntervalAlarmId = context.addAlarmInUs(
        LOGIC_SINK_EPR_KEEPALIVE_INTERVAL_US,
        _onKeepaliveIntervalTimeoutCallback,
        this,
        true
    );

    _sourceWatchdogAlarmId = context.addAlarmInUs(
        LOGIC_SINK_EPR_SOURCE_KEEPALIVE_WATCHDOG_US,
        _onSourceWatchdogTimeoutCallback,
        this,
        true
    );
}

void EPRKeepaliveStateHandler::reset(SinkContext& context) {
    if (_keepaliveIntervalAlarmId != -1) {
        context.cancelAlarm(_keepaliveIntervalAlarmId);
        _keepaliveIntervalAlarmId = -1;
    }

    if (_sourceWatchdogAlarmId != -1) {
        context.cancelAlarm(_sourceWatchdogAlarmId);
        _sourceWatchdogAlarmId = -1;
    }

    _awaitingKeepaliveAck = false;
    _keepaliveFailureCount = 0;
    _unbindContext();
}
