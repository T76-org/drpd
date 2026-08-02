/**
 * @file epr_keepalive.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "epr_keepalive.hpp"

#include "../sink.hpp"
#include "../../../proto/pd_extended_header.hpp"


using namespace T76::DRPD::Logic;


int64_t EPRKeepaliveStateHandler::_onKeepaliveIntervalTimeoutCallback(
    alarm_id_t id,
    void *user_data) {
    (void)id;
    auto *handler = static_cast<EPRKeepaliveStateHandler *>(user_data);
    handler->_keepaliveIntervalAlarmId = -1;
    if (handler->_keepaliveTimersActive()) {
        handler->_context->enqueueTimeoutEvent(
            SinkTimeoutEvent{SinkTimeoutEventType::EPRKeepaliveIntervalTimeout}
        );
    }
    return 0;
}

int64_t EPRKeepaliveStateHandler::_onSourceWatchdogTimeoutCallback(alarm_id_t id, void *user_data) {
    (void)id;
    auto *handler = static_cast<EPRKeepaliveStateHandler *>(user_data);
    handler->_sourceWatchdogAlarmId = -1;
    if (handler->_keepaliveTimersActive()) {
        handler->_context->enqueueTimeoutEvent(
            SinkTimeoutEvent{SinkTimeoutEventType::EPRSourceWatchdogTimeout}
        );
    }
    return 0;
}

int64_t EPRKeepaliveStateHandler::_onKeepaliveResponseTimeoutCallback(
    alarm_id_t id,
    void *user_data) {
    (void)id;
    auto *handler = static_cast<EPRKeepaliveStateHandler *>(user_data);
    handler->_keepaliveResponseAlarmId = -1;
    if (handler->_keepaliveTimersActive() && handler->_waitingForKeepaliveAck) {
        handler->_context->enqueueTimeoutEvent(
            SinkTimeoutEvent{SinkTimeoutEventType::EPRKeepaliveResponseTimeout}
        );
    }
    return 0;
}

void EPRKeepaliveStateHandler::_onKeepaliveIntervalTimeout() {
    if (!_keepaliveTimersActive()) {
        return;
    }

    if (!_context->sendExtendedControlMessage(
        static_cast<uint8_t>(Sink::ExtendedControlType::EPR_KeepAlive),
        true)) {
        return;
    }

    _waitingForKeepaliveAck = true;
    _keepaliveResponseAlarmId = _context->addAlarmInUs(
        LOGIC_SINK_EPR_KEEPALIVE_RESPONSE_TIMEOUT_US,
        _onKeepaliveResponseTimeoutCallback,
        this,
        true
    );
}

void EPRKeepaliveStateHandler::_onKeepaliveResponseTimeout() {
    if (_keepaliveTimersActive() && _waitingForKeepaliveAck) {
        _waitingForKeepaliveAck = false;
        _context->performReset(SinkResetType::HardReset);
    }
}

void EPRKeepaliveStateHandler::_onSourceWatchdogTimeout() {
    if (!_keepaliveTimersActive()) {
        return;
    }

    _context->performReset(SinkResetType::HardReset);
}

void EPRKeepaliveStateHandler::_startKeepaliveIntervalTimer(SinkContext& context) {
    if (_keepaliveIntervalAlarmId != -1) {
        context.cancelAlarm(_keepaliveIntervalAlarmId);
    }

    _keepaliveIntervalAlarmId = context.addAlarmInUs(
        LOGIC_SINK_EPR_KEEPALIVE_INTERVAL_US,
        _onKeepaliveIntervalTimeoutCallback,
        this,
        true
    );
}

void EPRKeepaliveStateHandler::_restartKeepaliveIntervalAfterSinkTraffic(SinkContext& context) {
    if (!_keepaliveTimersActive() || _waitingForKeepaliveAck) {
        return;
    }

    // The SinkEPRKeepAliveTimer measures idle time since successful Sink-originated
    // traffic, so ordinary EPR messages suppress an otherwise redundant EPR_KeepAlive.
    _startKeepaliveIntervalTimer(context);
}

void EPRKeepaliveStateHandler::_stopKeepaliveResponseTimer(SinkContext& context) {
    if (_keepaliveResponseAlarmId != -1) {
        context.cancelAlarm(_keepaliveResponseAlarmId);
        _keepaliveResponseAlarmId = -1;
    }
}

bool EPRKeepaliveStateHandler::_keepaliveTimersActive() const {
    if (_context == nullptr) {
        return false;
    }

    const auto& state = _context->runtimeState();
    return state._eprModeActive &&
        (state._state == SinkState::PE_SNK_Get_Source_Cap ||
         state._state == SinkState::PE_SNK_EPR_Keepalive);
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
                context.performReset(SinkResetType::HardReset);
                return;
            }

            const auto& sourceCapabilities = context.runtimeState()._sourceCapabilities;
            if (!sourceCapabilities.has_value() ||
                !eprCapabilities.matchesSPRSourceCapabilities(sourceCapabilities.value())) {
                context.performReset(SinkResetType::HardReset);
                return;
            }

            context.setEPRSourceCapabilities(eprCapabilities);
            context.runtimeState()._eprSourceExitRequested = !eprCapabilities.hasEPRPDOs();

            // Per EPR flow, establish an explicit EPR contract before entering ready.
            // Start from EPR PDO #0 (commonly the 5V EPR entry contract).
            if (!context.requestPDO(0, 5000, 0)) {
                context.performReset(SinkResetType::HardReset);
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
            const bool isGetSinkCap =
                controlType == static_cast<uint8_t>(Sink::ExtendedControlType::EPR_Get_Sink_Cap);

            if (isGetSinkCap) {
                if (!context.sendEPRSinkCapabilitiesResponse(0, false)) {
                    context.sendNotSupportedMessage();
                }
                return;
            }

            if (isKeepalive) {
                // EPR_KeepAlive is Sink-transmitted. A Source sending it is
                // role-invalid, so do not acknowledge it or refresh liveness.
                context.sendNotSupportedMessage();
                return;
            }

            if (isKeepaliveAck) {
                if (_waitingForKeepaliveAck) {
                    _waitingForKeepaliveAck = false;
                    _stopKeepaliveResponseTimer(context);
                    _startKeepaliveIntervalTimer(context);
                }

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

        if (type.has_value() &&
            type.value() == Proto::ExtendedMessageType::EPR_Sink_Capabilities) {
            const auto body = message->rawBody();
            if (body.size() < 2) {
                context.performReset(SinkResetType::SoftReset);
                return;
            }

            const uint16_t rawExtHeader = static_cast<uint16_t>(body[0]) |
                (static_cast<uint16_t>(body[1]) << 8);
            const Proto::PDExtendedHeader extHeader(rawExtHeader);
            if (!extHeader.requestChunk()) {
                context.performReset(SinkResetType::SoftReset);
                return;
            }

            if (!context.sendEPRSinkCapabilitiesResponse(extHeader.chunkNumber(), false)) {
                context.sendNotSupportedMessage();
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
                if (!context.eprExitContractReady()) {
                    context.performReset(SinkResetType::HardReset);
                    return;
                }

                context.setEPRModeActive(false);
                context.clearEPRSourceCapabilities();
                context.transitionTo(SinkState::PE_SNK_Ready);
                return;
            }
        }

        if (dataType.has_value() &&
            dataType.value() == Proto::DataMessageType::Source_Capabilities) {
            // SPR Source_Capabilities in EPR Mode are only informational when
            // explicitly requested with Get_Source_Cap. DRPD does not issue that
            // request in this state, so treat this as an EPR critical error.
            context.performReset(SinkResetType::HardReset);
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
    if (state == SinkMessageSenderState::GoodCRCReceived) {
        _restartKeepaliveIntervalAfterSinkTraffic(context);
        return;
    }

    if (state == SinkMessageSenderState::GoodCRCTimeout) {
        if (_waitingForKeepaliveAck) {
            _waitingForKeepaliveAck = false;
            _stopKeepaliveResponseTimer(context);
            context.performReset(SinkResetType::HardReset);
        }
    }
}

void EPRKeepaliveStateHandler::handleTimeoutEvent(
    SinkContext& context,
    SinkTimeoutEventType eventType) {
    (void)context;
    if (eventType == SinkTimeoutEventType::EPRKeepaliveIntervalTimeout) {
        _onKeepaliveIntervalTimeout();
        return;
    }

    if (eventType == SinkTimeoutEventType::EPRKeepaliveResponseTimeout) {
        _onKeepaliveResponseTimeout();
        return;
    }

    if (eventType == SinkTimeoutEventType::EPRSourceWatchdogTimeout) {
        _onSourceWatchdogTimeout();
        return;
    }

    if (eventType == SinkTimeoutEventType::SinkTxOKRetryTimeout) {
        if (!context.runtimeState()._eprCapabilities.has_value()) {
            enter(context);
            return;
        }

        _onKeepaliveIntervalTimeout();
    }
}

void EPRKeepaliveStateHandler::enter(SinkContext& context) {
    _bindContext(context);

    if (!context.runtimeState()._eprCapabilities.has_value() &&
        !context.sendExtendedControlMessage(
            static_cast<uint8_t>(Sink::ExtendedControlType::EPR_Get_Source_Cap))) {
        return;
    }

    _startKeepaliveIntervalTimer(context);

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

    _stopKeepaliveResponseTimer(context);

    if (_sourceWatchdogAlarmId != -1) {
        context.cancelAlarm(_sourceWatchdogAlarmId);
        _sourceWatchdogAlarmId = -1;
    }

    _waitingForKeepaliveAck = false;
    _unbindContext();
}

bool EPRKeepaliveStateHandler::canSuspendForInquiry() const {
    return !_waitingForKeepaliveAck;
}
