/**
 * @file select_capability.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 * 
 */

#include "select_capability.hpp"

#include <algorithm>

#include "../sink.hpp"


using namespace T76::DRPD;
using namespace T76::DRPD::Logic;


int64_t SelectCapabilityStateHandler::_onResponseTimeoutCallback(
    alarm_id_t id,
    void *user_data) {
    (void)id;
    SelectCapabilityStateHandler *handler =
        static_cast<SelectCapabilityStateHandler *>(user_data);
    handler->_responseTimeoutAlarmId = -1;
    if (handler->_context != nullptr) {
        handler->_context->enqueueTimeoutEvent(
            SinkTimeoutEvent{SinkTimeoutEventType::SelectCapabilityResponseTimeout}
        );
    }
    return 0;  // One-shot timer
}

void SelectCapabilityStateHandler::_onResponseTimeout() {
    if (_context == nullptr) {
        return;
    }

    _context->setRequestOutcome(SinkRequestOutcome::Timeout);
    _context->performReset(SinkResetType::HardReset);
}


SinkRequestResult SelectCapabilityStateHandler::requestPDO(
    SinkContext& context,
    size_t pdoIndex,
    uint32_t voltageMV,
    uint32_t currentMA,
    bool collisionAvoidanceExempt) {
    _bindContext(context);
    _currentRequestCollisionAvoidanceExempt = collisionAvoidanceExempt;

    // Request against the active capability view (SPR-only before EPR retrieval,
    // EPR capability set after retrieval).
    if (context.totalPDOCount() == 0) {
        _currentRequestCollisionAvoidanceExempt = false;
        return SinkRequestResult::failure("No source PDOs are available");
    }

    if (pdoIndex >= context.totalPDOCount()) {
        _currentRequestCollisionAvoidanceExempt = false;
        return SinkRequestResult::failure("PDO index out of range");
    }

    const auto pdoOpt = context.pdoAtIndex(pdoIndex);
    if (!pdoOpt.has_value()) {
        _currentRequestCollisionAvoidanceExempt = false;
        return SinkRequestResult::failure("PDO is unavailable");
    }

    const auto& pdoVariant = pdoOpt.value();
    const auto& state = context.runtimeState();

    if (std::holds_alternative<Proto::EPRAVSAPDO>(pdoVariant) &&
        (!state._eprModeActive || !state._eprCapabilities.has_value())) {
        _currentRequestCollisionAvoidanceExempt = false;
        return SinkRequestResult::failure("EPR PDO cannot be requested outside EPR mode");
    }

    SinkRequestResult result = SinkRequestResult::failure("Unsupported PDO type");
    if (std::holds_alternative<Proto::FixedSupplyPDO>(pdoVariant)) {
        result = _requestFixedPDO(pdoIndex, pdoVariant, currentMA);
    } else if (std::holds_alternative<Proto::VariableSupplyPDO>(pdoVariant)) {
        result = _requestVariablePDO(pdoIndex, pdoVariant, currentMA);
    } else if (std::holds_alternative<Proto::BatterySupplyPDO>(pdoVariant)) {
        result = _requestBatteryPDO(pdoIndex, pdoVariant, voltageMV, currentMA);
    } else if (std::holds_alternative<Proto::SPRPPSAPDO>(pdoVariant) ||
        std::holds_alternative<Proto::SPRAVSAPDO>(pdoVariant) ||
        std::holds_alternative<Proto::EPRAVSAPDO>(pdoVariant)) {
        result = _requestAugmentedPDO(pdoIndex, pdoVariant, voltageMV, currentMA);
    } else {
        result = _requestFixedPDO(pdoIndex, pdoVariant, currentMA);
    }

    _currentRequestCollisionAvoidanceExempt = false;
    return result;
}

SinkRequestResult SelectCapabilityStateHandler::_requestPDO(size_t pdoIndex,
                                                            const Proto::PDOVariant& pdoVariant,
                                                            uint32_t voltageMV,
                                                            uint32_t currentMA,
                                                            Proto::Request& request) {
    if (_context == nullptr) {
        return SinkRequestResult::failure("Sink request context is not bound");
    }

    auto& context = *_context;
    auto& state = context.runtimeState();

    const auto objectPosition = context.requestObjectPositionAtIndex(pdoIndex);
    if (!objectPosition.has_value()) {
        return SinkRequestResult::failure("PDO request object position is unavailable");
    }

    context.transitionTo(SinkState::PE_SNK_Select_Capability);

    state._pendingRequestedPDO = pdoVariant;
    state._pendingPDOIndex = pdoIndex;
    state._pendingVoltage = voltageMV;
    state._pendingCurrent = currentMA;
    context.setRequestOutcome(SinkRequestOutcome::Pending);

    request.objectPosition(objectPosition.value());
    request.giveBackFlag(false);
    request.capabilityMismatch(false);
    request.usbCommunicationsCapable(false);
    request.noUsbSuspend(true);
    request.eprModeCapable(state._eprEntryEnabled);

    const bool useEprRequestType = state._eprModeActive && state._eprCapabilities.has_value();

    if (useEprRequestType) {
        const auto requestRawBytes = request.raw();
        const uint32_t requestRaw = static_cast<uint32_t>(requestRawBytes[0]) |
            (static_cast<uint32_t>(requestRawBytes[1]) << 8) |
            (static_cast<uint32_t>(requestRawBytes[2]) << 16) |
            (static_cast<uint32_t>(requestRawBytes[3]) << 24);

        const uint32_t sourcePdoRaw = std::visit(
            [](const auto& pdo) { return pdo.raw(); },
            pdoVariant
        );

        Proto::EPRRequest eprRequest(requestRaw, sourcePdoRaw);
        PHY::BMCEncodedMessage requestMessage(
            Proto::SOP::SOPType::SOP,
            eprRequest
        );

        requestMessage.header().portDataRole(Proto::PDHeader::PortDataRole::UFP);
        requestMessage.header().portPowerRole(Proto::PDHeader::PortPowerRole::Sink);
        requestMessage.header().specRevision(Proto::PDHeader::SpecRevision::Rev3_x);

        if (!_currentRequestCollisionAvoidanceExempt &&
            !context.sendSinkInitiatedMessageAndAwaitGoodCRC(requestMessage)) {
            return SinkRequestResult::ok();
        }
        if (_currentRequestCollisionAvoidanceExempt) {
            context.sendMessageAndAwaitGoodCRC(requestMessage);
        }
        return SinkRequestResult::ok();
    }

    PHY::BMCEncodedMessage requestMessage(
        Proto::SOP::SOPType::SOP,
        request
    );

    requestMessage.header().portDataRole(Proto::PDHeader::PortDataRole::UFP);
    requestMessage.header().portPowerRole(Proto::PDHeader::PortPowerRole::Sink);
    requestMessage.header().specRevision(Proto::PDHeader::SpecRevision::Rev3_x);

    if (!_currentRequestCollisionAvoidanceExempt &&
        !context.sendSinkInitiatedMessageAndAwaitGoodCRC(requestMessage)) {
        return SinkRequestResult::ok();
    }
    if (_currentRequestCollisionAvoidanceExempt) {
        context.sendMessageAndAwaitGoodCRC(requestMessage);
    }

    return SinkRequestResult::ok();
}

SinkRequestResult SelectCapabilityStateHandler::_requestFixedPDO(
    size_t pdoIndex,
    const Proto::PDOVariant& pdoVariant,
    uint32_t currentMA) {
    Proto::FixedSupplyPDO fixedPDO = std::get<Proto::FixedSupplyPDO>(pdoVariant);

    uint32_t requestedMilliamps = currentMA;

    // If the requested current is zero, request the maximum available current
    // Otherwise, clamp to the maximum available current

    requestedMilliamps = requestedMilliamps == 0
        ? fixedPDO.maxCurrentMilliamps()
        : std::min(requestedMilliamps, fixedPDO.maxCurrentMilliamps());

    Proto::FixedVariableRequest request(0);

    request.operatingCurrentMilliamps(requestedMilliamps);
    request.maxOperatingCurrentMilliamps(requestedMilliamps);
    // DRPD keeps source-test behavior conservative: advertise chunked-only
    // extended-message support until full large unchunked RX/TX is validated.
    request.unchunkedExtendedMessageSupported(false);

    return _requestPDO(pdoIndex, pdoVariant, fixedPDO.voltageMillivolts(), requestedMilliamps, request);
}

SinkRequestResult SelectCapabilityStateHandler::_requestVariablePDO(
    size_t pdoIndex,
    const Proto::PDOVariant &pdoVariant,
    uint32_t currentMA) {
    const Proto::VariableSupplyPDO& variablePDO = std::get<Proto::VariableSupplyPDO>(pdoVariant);

    uint32_t requestedMilliamps = currentMA;

    requestedMilliamps = requestedMilliamps == 0
        ? variablePDO.maxCurrentMilliamps()
        : std::min(requestedMilliamps, variablePDO.maxCurrentMilliamps());

    Proto::FixedVariableRequest request(0);

    request.operatingCurrentMilliamps(requestedMilliamps);
    request.maxOperatingCurrentMilliamps(requestedMilliamps);

    return _requestPDO(pdoIndex, pdoVariant, variablePDO.minVoltageMillivolts(), requestedMilliamps, request);
}

SinkRequestResult SelectCapabilityStateHandler::_requestBatteryPDO(
    size_t pdoIndex,
    const Proto::PDOVariant& pdoVariant,
    uint32_t voltageMV,
    uint32_t currentMA) {
    const Proto::BatterySupplyPDO& batteryPDO = std::get<Proto::BatterySupplyPDO>(pdoVariant);

    uint32_t requestedPowerMilliwatts = static_cast<uint32_t>(voltageMV * currentMA / 1000.0f);

    requestedPowerMilliwatts = requestedPowerMilliwatts == 0
        ? batteryPDO.maxPowerMilliwatts()
        : std::min(requestedPowerMilliwatts, batteryPDO.maxPowerMilliwatts());

    Proto::BatteryRequest request(0);

    request.operatingPowerMilliwatts(requestedPowerMilliwatts);
    request.maxOperatingPowerMilliwatts(requestedPowerMilliwatts);

    return _requestPDO(pdoIndex, pdoVariant, voltageMV, currentMA, request);
}

SinkRequestResult SelectCapabilityStateHandler::_requestAugmentedPDO(
    size_t pdoIndex,
    const Proto::PDOVariant& pdoVariant,
    uint32_t voltageMV,
    uint32_t currentMA) {
    // Handle SPR PPS APDO
    if (std::holds_alternative<Proto::SPRPPSAPDO>(pdoVariant)) {
        const Proto::SPRPPSAPDO& sprPps = std::get<Proto::SPRPPSAPDO>(pdoVariant);
        
        uint32_t requestedVoltageMillivolts = voltageMV <= 0
        ? sprPps.minVoltageMillivolts()
        : voltageMV;

        requestedVoltageMillivolts = std::clamp(
            requestedVoltageMillivolts,
            sprPps.minVoltageMillivolts(),
            sprPps.maxVoltageMillivolts()
        );

        uint32_t requestedMilliamps = currentMA <= 0
            ? sprPps.maxCurrentMilliamps()
            : currentMA;

        requestedMilliamps = std::min(requestedMilliamps, sprPps.maxCurrentMilliamps());

        Proto::AugmentedPPSRequest request(0);

        request.outputVoltageMillivolts(requestedVoltageMillivolts);
        request.operatingCurrentMilliamps(requestedMilliamps);

        return _requestPDO(pdoIndex, pdoVariant, requestedVoltageMillivolts, requestedMilliamps, request);
    }

    // Handle SPR AVS APDO
    else if (std::holds_alternative<Proto::SPRAVSAPDO>(pdoVariant)) {
        const Proto::SPRAVSAPDO& sprAvs = std::get<Proto::SPRAVSAPDO>(pdoVariant);
        
        uint32_t requestedVoltageMillivolts = voltageMV <= 0
            ? 15000
            : voltageMV;

        requestedVoltageMillivolts = std::clamp(
            requestedVoltageMillivolts,
            sprAvs.minVoltageMillivolts(),
            sprAvs.maxVoltageMillivolts()
        );

        if (requestedVoltageMillivolts == 0) {
            return SinkRequestResult::failure("SPR AVS requested voltage is invalid");
        }

        const bool use20VBand = requestedVoltageMillivolts > 15000;
        const uint32_t maxBandCurrentMA = use20VBand
            ? sprAvs.maxCurrent20VMilliamps()
            : sprAvs.maxCurrent15VMilliamps();
        if (maxBandCurrentMA == 0) {
            return SinkRequestResult::failure("SPR AVS selected voltage band has no available current");
        }
        const uint32_t requestedCurrentMA = currentMA <= 0
            ? maxBandCurrentMA
            : std::min(currentMA, maxBandCurrentMA);

        Proto::AugmentedAVSRequest request(0);

        request.outputVoltageMillivolts(requestedVoltageMillivolts);
        request.operatingCurrentMilliamps(requestedCurrentMA);

        return _requestPDO(pdoIndex, pdoVariant, requestedVoltageMillivolts, requestedCurrentMA, request);
    }

    // Handle EPR AVS APDO
    else if (std::holds_alternative<Proto::EPRAVSAPDO>(pdoVariant)) {
        const Proto::EPRAVSAPDO& eprAvs = std::get<Proto::EPRAVSAPDO>(pdoVariant);
        
        uint32_t requestedVoltageMillivolts = voltageMV <= 0
            ? eprAvs.minVoltageMillivolts()
            : voltageMV;

        requestedVoltageMillivolts = std::clamp(
            requestedVoltageMillivolts,
            eprAvs.minVoltageMillivolts(),
            eprAvs.maxVoltageMillivolts()
        );

        if (requestedVoltageMillivolts == 0) {
            return SinkRequestResult::failure("EPR AVS requested voltage is invalid");
        }

        const uint32_t maxCurrentMA = eprAvs.maxPowerMilliwatts() / requestedVoltageMillivolts;
        if (maxCurrentMA == 0) {
            return SinkRequestResult::failure("EPR AVS selected voltage has no available current");
        }

        const uint32_t requestedCurrentMA = currentMA <= 0
            ? maxCurrentMA
            : std::min(currentMA, maxCurrentMA);

        Proto::AugmentedAVSRequest request(0);

        request.outputVoltageMillivolts(requestedVoltageMillivolts);
        request.operatingCurrentMilliamps(requestedCurrentMA);

        return _requestPDO(pdoIndex, pdoVariant, requestedVoltageMillivolts, requestedCurrentMA, request);
    }

    return SinkRequestResult::failure("Unsupported augmented PDO type");
}

void SelectCapabilityStateHandler::handleMessage(SinkContext& context, const T76::DRPD::PHY::BMCDecodedMessage *message) {
    _bindContext(context);
    // Cancel the response timeout timer
    if (_responseTimeoutAlarmId != -1) {
        context.cancelAlarm(_responseTimeoutAlarmId);
        _responseTimeoutAlarmId = -1;
    }

    Proto::PDHeader decodedHeader = message->decodedHeader();

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Data) {
        const auto dataMessageType = decodedHeader.dataMessageType();

        if (dataMessageType.has_value() &&
            dataMessageType.value() == Proto::DataMessageType::Source_Capabilities) {
            context.setSourceCapabilities(
                Proto::SourceCapabilities(message->rawBody(), decodedHeader.numDataObjects()));

            if (context.runtimeState()._pendingRequestedPDO.has_value()) {
                (void)_requestPendingPDO(context);
            } else {
                (void)context.requestPDO(0, 0, 0);
            }
            return;
        }
    }

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Control) {
        auto controlMessageType = decodedHeader.controlMessageType();

        if (!controlMessageType.has_value()) {
            // This should never occur unless something goes wrong with the sequencing
            // of messages. Initiate a soft reset.

            //TODO: Soft reset
            return;
        }

        if (controlMessageType.value() == Proto::ControlMessageType::Accept) {
            // If we have successfully received an Accept message for our requested PDO,
            // update the Sink's negotiated values and transition to Transition_Sink state.
            auto& state = context.runtimeState();
            // Accept without an in-flight request indicates a sequencing race/out-of-order
            // response, so reset protocol state instead of dereferencing an empty optional.
            if (!state._pendingRequestedPDO.has_value()) {
                context.performReset(SinkResetType::SoftReset);
                return;
            }

            context.setNegotiatedValues(
                state._pendingRequestedPDO.value(),
                state._pendingVoltage,
                state._pendingCurrent
            );
            context.setRequestOutcome(SinkRequestOutcome::Accepted);

            state._pendingRequestedPDO = std::nullopt;
            state._pendingPDOIndex = 0;
            state._pendingCurrent = 0.0f;
            state._pendingVoltage = 0.0f;

            context.transitionTo(SinkState::PE_SNK_Transition_Sink);
            
            return;
        } 
        
        if (controlMessageType.value() == Proto::ControlMessageType::Reject) {
            // If the source rejects our request and:
            //
            // - We have an explicit contract already, we transition to the PE_SNK_Ready state
            // - We don't have an explicit contract, we transition back to the PE_SNK_Wait_for_Capabilities state
            //
            // TODO: Need a mechanism to signal that the request was rejected to the higher-level application

            auto& state = context.runtimeState();
            context.setRequestOutcome(SinkRequestOutcome::Rejected);
            state._pendingRequestedPDO = std::nullopt;
            state._pendingPDOIndex = 0;
            state._pendingCurrent = 0.0f;
            state._pendingVoltage = 0.0f;

            if (state._negotiatedPDO.has_value()) {
                context.transitionTo(SinkState::PE_SNK_Ready);
            } else {
                context.transitionTo(SinkState::PE_SNK_Wait_for_Capabilities);
            }

            return;
        }
        
        if (controlMessageType.value() == Proto::ControlMessageType::Wait) {
            // If the source responds with a Wait message, and:
            //
            // - We have an explicit contract already, we transition to the PE_SNK_Ready state
            // - We don't have an explicit contract, we transition back to the PE_SNK_Wait_for_Capabilities state

            context.setRequestOutcome(SinkRequestOutcome::Wait);

            if (context.runtimeState()._negotiatedPDO.has_value()) {
                context.transitionTo(SinkState::PE_SNK_Ready);
            } else {
                context.transitionTo(SinkState::PE_SNK_Wait_for_Capabilities);
            }

            return;
        }

        if (controlMessageType.value() == Proto::ControlMessageType::Not_Supported) {
            auto& state = context.runtimeState();
            context.setRequestOutcome(SinkRequestOutcome::NotSupported);
            state._pendingRequestedPDO = std::nullopt;
            state._pendingPDOIndex = 0;
            state._pendingCurrent = 0.0f;
            state._pendingVoltage = 0.0f;

            if (state._negotiatedPDO.has_value()) {
                context.transitionTo(SinkState::PE_SNK_Ready);
            } else {
                context.transitionTo(SinkState::PE_SNK_Wait_for_Capabilities);
            }

            return;
        }
        
        context.performReset(SinkResetType::SoftReset);
    }
}

SinkRequestResult SelectCapabilityStateHandler::_requestPendingPDO(SinkContext& context) {
    auto& state = context.runtimeState();
    if (!state._pendingRequestedPDO.has_value()) {
        return SinkRequestResult::failure("No pending PDO request is available");
    }

    int pdoIndex = -1;
    const uint32_t pendingPdoRaw = std::visit(
        [](const auto& pdo) { return pdo.raw(); },
        state._pendingRequestedPDO.value()
    );

    const size_t pdoCount = context.totalPDOCount();
    for (size_t i = 0; i < pdoCount; ++i) {
        const auto pdo = context.pdoAtIndex(i);
        if (!pdo.has_value()) {
            continue;
        }

        const uint32_t pdoRaw = std::visit(
            [](const auto& typedPdo) { return typedPdo.raw(); },
            pdo.value()
        );

        if (pdoRaw == pendingPdoRaw) {
            pdoIndex = static_cast<int>(i);
            break;
        }
    }

    if (pdoIndex == -1) {
        return requestPDO(context, 0, 0.0f, state._pendingCurrent);
    }

    return requestPDO(
        context,
        pdoIndex,
        state._pendingVoltage,
        state._pendingCurrent
    );
}

void SelectCapabilityStateHandler::handleMessageSenderStateChange(SinkContext& context, SinkMessageSenderState state) {
    if (state == SinkMessageSenderState::GoodCRCReceived) {
        // Start the response timeout timer when GoodCRC is received
        _responseTimeoutAlarmId = context.addAlarmInUs(
            LOGIC_SINK_SELECT_CAPABILITY_RESPONSE_TIMEOUT_US,
            _onResponseTimeoutCallback,
            this,
            true  // fire_if_past
        );
    }
}

void SelectCapabilityStateHandler::handleTimeoutEvent(
    SinkContext& context,
    SinkTimeoutEventType eventType) {
    (void)context;
    if (eventType == SinkTimeoutEventType::SelectCapabilityResponseTimeout) {
        _onResponseTimeout();
        return;
    }

    if (eventType == SinkTimeoutEventType::SinkTxOKRetryTimeout) {
        (void)_requestPendingPDO(context);
    }
}


void SelectCapabilityStateHandler::enter(SinkContext& context) {
    _bindContext(context);
    // If there is a pending requested PDO, that means that we have landed here
    // because the source has sent us a Wait message in response to our last Request
    // and either the SinkRequestTimer or the SinkPPSPeriodicTimer has expired. 
    // In this case, we send a new request for the same PDO.

    if (context.runtimeState()._pendingRequestedPDO.has_value()) {
        (void)_requestPendingPDO(context);
    }
}

void SelectCapabilityStateHandler::reset(SinkContext& context) {
    // Cancel the response timeout timer
    if (_responseTimeoutAlarmId != -1) {
        context.cancelAlarm(_responseTimeoutAlarmId);
        _responseTimeoutAlarmId = -1;
    }
    _unbindContext();
}
