/**
 * @file ready.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "ready.hpp"

#include <variant>

#include "../sink.hpp"


using namespace T76::DRPD::Logic;


namespace {
    enum class ReadyMessageAction {
        Process,
        SoftReset,
        NotSupported,
        Ignore
    };

    ReadyMessageAction readyControlAction(Proto::ControlMessageType type) {
        switch (type) {
            case Proto::ControlMessageType::GoodCRC:
                return ReadyMessageAction::Ignore;

            case Proto::ControlMessageType::Accept:
            case Proto::ControlMessageType::Reject:
            case Proto::ControlMessageType::Wait:
            case Proto::ControlMessageType::PS_RDY:
            case Proto::ControlMessageType::Data_Reset_Complete:
                return ReadyMessageAction::SoftReset;

            case Proto::ControlMessageType::Not_Supported:
                return ReadyMessageAction::Process;

            case Proto::ControlMessageType::GotoMin:
            case Proto::ControlMessageType::Ping:
            case Proto::ControlMessageType::Get_Source_Cap:
            case Proto::ControlMessageType::DR_Swap:
            case Proto::ControlMessageType::PR_Swap:
            case Proto::ControlMessageType::VCONN_Swap:
            case Proto::ControlMessageType::Data_Reset:
            case Proto::ControlMessageType::Get_Source_Cap_Extended:
            case Proto::ControlMessageType::Get_Status:
            case Proto::ControlMessageType::FR_Swap:
            case Proto::ControlMessageType::Get_PPS_Status:
            case Proto::ControlMessageType::Get_Country_Codes:
            case Proto::ControlMessageType::Get_Source_Info:
                return ReadyMessageAction::NotSupported;

            case Proto::ControlMessageType::Get_Sink_Cap:
            case Proto::ControlMessageType::Get_Sink_Cap_Extended:
            case Proto::ControlMessageType::Get_Revision:
                return ReadyMessageAction::Process;

            case Proto::ControlMessageType::Soft_Reset:
                return ReadyMessageAction::Ignore;
        }

        return ReadyMessageAction::NotSupported;
    }

    ReadyMessageAction readyDataAction(Proto::DataMessageType type) {
        switch (type) {
            case Proto::DataMessageType::Source_Capabilities:
                return ReadyMessageAction::Process;

            case Proto::DataMessageType::Request:
            case Proto::DataMessageType::BIST:
            case Proto::DataMessageType::Sink_Capabilities:
            case Proto::DataMessageType::EPR_Request:
            case Proto::DataMessageType::Source_Info:
            case Proto::DataMessageType::Revision:
                return ReadyMessageAction::SoftReset;

            case Proto::DataMessageType::Battery_Status:
            case Proto::DataMessageType::Alert:
            case Proto::DataMessageType::Get_Country_Info:
            case Proto::DataMessageType::Enter_USB:
            case Proto::DataMessageType::EPR_Mode:
            case Proto::DataMessageType::Vendor_Defined:
                return ReadyMessageAction::NotSupported;
        }

        return ReadyMessageAction::NotSupported;
    }

    ReadyMessageAction readyExtendedAction(Proto::ExtendedMessageType type) {
        switch (type) {
            case Proto::ExtendedMessageType::EPR_Source_Capabilities:
            case Proto::ExtendedMessageType::Extended_Control:
                return ReadyMessageAction::Process;

            case Proto::ExtendedMessageType::Source_Capabilities_Extended:
            case Proto::ExtendedMessageType::Status:
            case Proto::ExtendedMessageType::Battery_Capabilities:
            case Proto::ExtendedMessageType::Manufacturer_Info:
            case Proto::ExtendedMessageType::Security_Response:
            case Proto::ExtendedMessageType::Firmware_Update_Response:
            case Proto::ExtendedMessageType::PPS_Status:
            case Proto::ExtendedMessageType::Country_Codes:
            case Proto::ExtendedMessageType::Country_Info:
            case Proto::ExtendedMessageType::Sink_Capabilities_Extended:
            case Proto::ExtendedMessageType::EPR_Sink_Capabilities:
                return ReadyMessageAction::SoftReset;

            case Proto::ExtendedMessageType::Get_Battery_Cap:
            case Proto::ExtendedMessageType::Get_Battery_Status:
            case Proto::ExtendedMessageType::Get_Manufacturer_Info:
            case Proto::ExtendedMessageType::Security_Request:
            case Proto::ExtendedMessageType::Firmware_Update_Request:
            case Proto::ExtendedMessageType::Vendor_Defined_Extended:
                return ReadyMessageAction::NotSupported;
        }

        return ReadyMessageAction::NotSupported;
    }
}


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

    ReadyMessageAction action = ReadyMessageAction::NotSupported;

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Control) {
        const auto controlMessageType = decodedHeader.controlMessageType();
        action = controlMessageType.has_value()
            ? readyControlAction(controlMessageType.value())
            : ReadyMessageAction::NotSupported;
    } else if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Data) {
        const auto dataMessageType = decodedHeader.dataMessageType();
        action = dataMessageType.has_value()
            ? readyDataAction(dataMessageType.value())
            : ReadyMessageAction::NotSupported;
    } else if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Extended) {
        const auto extendedType = decodedHeader.extendedMessageType();
        action = extendedType.has_value()
            ? readyExtendedAction(extendedType.value())
            : ReadyMessageAction::NotSupported;
    }

    if (action == ReadyMessageAction::SoftReset) {
        context.performReset(SinkResetType::SoftReset);
        return;
    }

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Control) {
        const auto controlMessageType = decodedHeader.controlMessageType();
        if (controlMessageType.has_value() &&
            controlMessageType.value() == Proto::ControlMessageType::Get_Sink_Cap) {
            context.sendSinkCapabilities();
            return;
        }

        if (controlMessageType.has_value() &&
            controlMessageType.value() == Proto::ControlMessageType::Get_Sink_Cap_Extended) {
            context.sendSinkCapabilitiesExtended();
            return;
        }

        if (controlMessageType.has_value() &&
            controlMessageType.value() == Proto::ControlMessageType::Get_Revision) {
            context.sendRevision();
            return;
        }
    }

    if (action == ReadyMessageAction::Ignore ||
        action == ReadyMessageAction::Process) {
        if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Control) {
            return;
        }
    }

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

    if (action == ReadyMessageAction::NotSupported) {
        context.sendNotSupportedMessage();
    }
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
