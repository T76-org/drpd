/**
 * @file sink_context.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "sink_context.hpp"
#include "sink_raw_pd_message.hpp"

#include <algorithm>
#include <array>

#include "../cc_bus_controller.hpp"
#include "state_handlers/disconnected.hpp"
#include "state_handlers/epr_keepalive.hpp"
#include "state_handlers/epr_mode_exit.hpp"
#include "state_handlers/epr_mode_entry.hpp"
#include "state_handlers/get_pps_status.hpp"
#include "state_handlers/ready.hpp"
#include "state_handlers/send_soft_reset.hpp"
#include "state_handlers/select_capability.hpp"
#include "state_handlers/transition_sink.hpp"
#include "state_handlers/wait_for_capabilities.hpp"

namespace T76::DRPD::Logic {

SinkContext::SinkContext(
    SinkRuntimeState& runtimeState,
    SinkAlarmService& alarmService,
    SinkMessageSender& messageSender,
    CCBusController& ccBusController,
    DisconnectedStateHandler& disconnectedStateHandler,
    EPRKeepaliveStateHandler& eprKeepaliveStateHandler,
    EPRModeExitStateHandler& eprModeExitStateHandler,
    EPRModeEntryStateHandler& eprModeEntryStateHandler,
    GetPPSStatusStateHandler& getPPSStatusStateHandler,
    ReadySinkStateHandler& readySinkStateHandler,
    SendSoftResetStateHandler& sendSoftResetStateHandler,
    SelectCapabilityStateHandler& selectCapabilityStateHandler,
    TransitionSinkStateHandler& transitionSinkStateHandler,
    WaitForCapabilitiesStateHandler& waitForCapabilitiesStateHandler,
    std::function<void(SinkInfoChange)>& sinkInfoChangedCallback,
    std::function<void(SinkTimeoutEvent)>& enqueueTimeoutEventCallback) :
    _runtimeState(runtimeState),
    _alarmService(alarmService),
    _messageSender(messageSender),
    _ccBusController(ccBusController),
    _disconnectedStateHandler(disconnectedStateHandler),
    _eprKeepaliveStateHandler(eprKeepaliveStateHandler),
    _eprModeExitStateHandler(eprModeExitStateHandler),
    _eprModeEntryStateHandler(eprModeEntryStateHandler),
    _getPPSStatusStateHandler(getPPSStatusStateHandler),
    _readySinkStateHandler(readySinkStateHandler),
    _sendSoftResetStateHandler(sendSoftResetStateHandler),
    _selectCapabilityStateHandler(selectCapabilityStateHandler),
    _transitionSinkStateHandler(transitionSinkStateHandler),
    _waitForCapabilitiesStateHandler(waitForCapabilitiesStateHandler),
    _sinkInfoChangedCallback(sinkInfoChangedCallback),
    _enqueueTimeoutEventCallback(enqueueTimeoutEventCallback) {}

SinkRuntimeState& SinkContext::runtimeState() {
    return _runtimeState;
}

const SinkRuntimeState& SinkContext::runtimeState() const {
    return _runtimeState;
}

void SinkContext::transitionTo(SinkState state) {
    if (_runtimeState._state == state) {
        return;
    }

    _runtimeState._state = state;

    if (_runtimeState._currentStateHandler) {
        _runtimeState._currentStateHandler->reset(*this);
    }

    switch (state) {
        case SinkState::Disconnected:
            _runtimeState._currentStateHandler = &_disconnectedStateHandler;
            break;

        case SinkState::PE_SNK_Wait_for_Capabilities:
            _runtimeState._currentStateHandler = &_waitForCapabilitiesStateHandler;
            break;

        case SinkState::PE_SNK_Send_Soft_Reset:
            _runtimeState._currentStateHandler = &_sendSoftResetStateHandler;
            break;

        case SinkState::PE_SNK_Select_Capability:
            _runtimeState._currentStateHandler = &_selectCapabilityStateHandler;
            break;

        case SinkState::PE_SNK_Transition_Sink:
            _runtimeState._currentStateHandler = &_transitionSinkStateHandler;
            break;

        case SinkState::PE_SNK_Ready:
            _runtimeState._currentStateHandler = &_readySinkStateHandler;
            break;

        case SinkState::PE_SNK_Send_EPR_Mode_Entry:
        case SinkState::PE_SNK_EPR_Mode_Wait_For_Response:
            _runtimeState._currentStateHandler = &_eprModeEntryStateHandler;
            break;

        case SinkState::PE_SNK_Send_EPR_Mode_Exit:
            _runtimeState._currentStateHandler = &_eprModeExitStateHandler;
            break;

        case SinkState::PE_SNK_Get_Source_Cap:
            _runtimeState._currentStateHandler = &_eprKeepaliveStateHandler;
            break;

        case SinkState::PE_SNK_Get_PPS_Status:
            _runtimeState._currentStateHandler = &_getPPSStatusStateHandler;
            break;

        case SinkState::PE_SNK_EPR_Keepalive:
            _runtimeState._currentStateHandler = &_eprKeepaliveStateHandler;
            break;

        default:
            _runtimeState._currentStateHandler = nullptr;
            break;
    }

    if (_runtimeState._currentStateHandler) {
        _runtimeState._currentStateHandler->enter(*this);
    }

    _notifySinkInfoChanged(SinkInfoChange::OtherInfoChanged);
}

void SinkContext::performReset(SinkResetType resetType) {
    _messageSender.reset();
    _runtimeState.resetStoredReceivedMessageId();

    if (resetType == SinkResetType::HardReset &&
        _ccBusController.state() == CCBusState::Attached) {
        _messageSender.resetMessageIdCounter();
        _messageSender.sendHardResetSignaling();
    }

    if (_runtimeState._currentStateHandler) {
        _runtimeState._currentStateHandler->reset(*this);
    }
    _runtimeState.reset();

    if (_ccBusController.state() == CCBusState::Attached) {
        if (resetType == SinkResetType::SoftReset) {
            transitionTo(SinkState::PE_SNK_Send_Soft_Reset);
        } else {
            transitionTo(SinkState::PE_SNK_Wait_for_Capabilities);
        }
    } else {
        transitionTo(SinkState::Disconnected);
    }
}

void SinkContext::handleReceivedSoftReset() {
    _messageSender.reset();
    _runtimeState.resetStoredReceivedMessageId();

    if (_runtimeState._currentStateHandler) {
        _runtimeState._currentStateHandler->reset(*this);
    }

    _runtimeState.reset();

    if (_ccBusController.state() != CCBusState::Attached) {
        transitionTo(SinkState::Disconnected);
        return;
    }

    _messageSender.sendMessageAndAwaitGoodCRC(
        PHY::BMCEncodedMessage::acceptMessage(
            Proto::PDHeader::PortDataRole::UFP,
            Proto::PDHeader::PortPowerRole::Sink
        )
    );
    transitionTo(SinkState::PE_SNK_Wait_for_Capabilities);
}

void SinkContext::setSourceCapabilities(const Proto::SourceCapabilities& sourceCapabilities) {
    _runtimeState._sourceCapabilities = sourceCapabilities;
    _runtimeState._sourceSupportsEpr = _sourceEPRCapable();
    _runtimeState._eprCapabilities.reset();
    _notifySinkInfoChanged(SinkInfoChange::PDOListUpdated);
}

void SinkContext::setEPRSourceCapabilities(const Proto::EPRSourceCapabilities& sourceCapabilities) {
    _runtimeState._eprCapabilities = sourceCapabilities;
    _notifySinkInfoChanged(SinkInfoChange::PDOListUpdated);
}

void SinkContext::clearEPRSourceCapabilities() {
    if (_runtimeState._eprCapabilities.has_value()) {
        _runtimeState._eprCapabilities.reset();
        _notifySinkInfoChanged(SinkInfoChange::PDOListUpdated);
    }
}

void SinkContext::setNegotiatedValues(const Proto::PDOVariant pdoVariant, float voltage, float current) {
    _runtimeState._negotiatedPDO = pdoVariant;
    _runtimeState._negotiatedVoltage = voltage;
    _runtimeState._negotiatedCurrent = current;
    _notifySinkInfoChanged(SinkInfoChange::OtherInfoChanged);
}

void SinkContext::setEPRModeActive(bool active) {
    _runtimeState._eprModeActive = active;
    _runtimeState._eprEntryAttempted = _runtimeState._eprEntryAttempted || active;

    if (!active) {
        _runtimeState._eprModeActive = false;
    }

    _notifySinkInfoChanged(SinkInfoChange::OtherInfoChanged);
}

void SinkContext::setEPREntryEnabled(bool enabled) {
    if (_runtimeState._eprEntryEnabled == enabled) {
        return;
    }

    _runtimeState._eprEntryEnabled = enabled;
    _notifySinkInfoChanged(SinkInfoChange::OtherInfoChanged);
}

bool SinkContext::eprEntryEnabled() const {
    return _runtimeState._eprEntryEnabled;
}

bool SinkContext::eprExitContractReady() const {
    if (!_runtimeState._negotiatedPDO.has_value()) {
        return false;
    }

    if (std::holds_alternative<Proto::EPRAVSAPDO>(_runtimeState._negotiatedPDO.value())) {
        return false;
    }

    return _runtimeState._negotiatedVoltage > 0.0f &&
        _runtimeState._negotiatedVoltage <= 20000.0f;
}

size_t SinkContext::totalPDOCount() const {
    if (_runtimeState._eprModeActive && _runtimeState._eprCapabilities.has_value()) {
        return _runtimeState._eprCapabilities->pdoCount();
    }

    if (_runtimeState._sourceCapabilities.has_value()) {
        return _runtimeState._sourceCapabilities->pdoCount();
    }

    return 0;
}

std::optional<Proto::PDOVariant> SinkContext::pdoAtIndex(size_t index) const {
    if (_runtimeState._eprModeActive && _runtimeState._eprCapabilities.has_value()) {
        if (index < _runtimeState._eprCapabilities->pdoCount()) {
            return _runtimeState._eprCapabilities->pdo(index);
        }
        return std::nullopt;
    }

    if (_runtimeState._sourceCapabilities.has_value() &&
        index < _runtimeState._sourceCapabilities->pdoCount()) {
        return _runtimeState._sourceCapabilities->pdo(index);
    }

    return std::nullopt;
}

std::optional<uint8_t> SinkContext::requestObjectPositionAtIndex(size_t index) const {
    if (_runtimeState._eprModeActive && _runtimeState._eprCapabilities.has_value()) {
        if (index < _runtimeState._eprCapabilities->pdoCount()) {
            return _runtimeState._eprCapabilities->objectPosition(index);
        }
        return std::nullopt;
    }

    if (_runtimeState._sourceCapabilities.has_value() &&
        index < _runtimeState._sourceCapabilities->pdoCount()) {
        return static_cast<uint8_t>(index + 1);
    }

    return std::nullopt;
}

std::optional<SinkRuntimeState::ExtendedPayloadBuffer> SinkContext::takeCompletedExtendedPayload(
    Proto::ExtendedMessageType type) {
    const auto typeIndex = SinkRuntimeState::trackedTypeIndex(type);

    if (!typeIndex.has_value() ||
        !_runtimeState._completedExtendedPayloads[typeIndex.value()].has_value()) {
        return std::nullopt;
    }

    auto payload = _runtimeState._completedExtendedPayloads[typeIndex.value()].value();
    _runtimeState._completedExtendedPayloads[typeIndex.value()].reset();
    return payload;
}

void SinkContext::sendNotSupportedMessage() {
    _messageSender.sendMessageAndAwaitGoodCRC(
        PHY::BMCEncodedMessage::notAcceptedMessage(
            Proto::PDHeader::PortDataRole::UFP,
            Proto::PDHeader::PortPowerRole::Sink
        )
    );
}

void SinkContext::sendSinkCapabilities() {
    const Proto::SinkCapabilities sinkCapabilities =
        Proto::SinkCapabilities::fixedSupply(5000, 500);
    PHY::BMCEncodedMessage message(
        Proto::SOP::SOPType::SOP,
        sinkCapabilities
    );

    auto &header = message.header();
    header.portDataRole(Proto::PDHeader::PortDataRole::UFP);
    header.portPowerRole(Proto::PDHeader::PortPowerRole::Sink);
    header.specRevision(Proto::PDHeader::SpecRevision::Rev3_x);

    _messageSender.sendMessageAndAwaitGoodCRC(message);
}

void SinkContext::sendSinkCapabilitiesExtended() {
    constexpr uint8_t kMinimalSPRPDPW = 3;

    const Proto::SinkCapabilitiesExtended sinkCapabilities =
        Proto::SinkCapabilitiesExtended::minimalSPR(
            T76_IC_USB_VENDOR_ID,
            T76_IC_USB_PRODUCT_ID,
            kMinimalSPRPDPW
        );
    PHY::BMCEncodedMessage message(
        Proto::SOP::SOPType::SOP,
        sinkCapabilities
    );

    auto &header = message.header();
    header.extended(true);
    header.extendedMessageType(Proto::ExtendedMessageType::Sink_Capabilities_Extended);
    header.portDataRole(Proto::PDHeader::PortDataRole::UFP);
    header.portPowerRole(Proto::PDHeader::PortPowerRole::Sink);
    header.specRevision(Proto::PDHeader::SpecRevision::Rev3_x);

    _messageSender.sendMessageAndAwaitGoodCRC(message);
}

void SinkContext::sendRevision() {
    const Proto::Revision revision = Proto::Revision::revision3p2Version1p1();
    PHY::BMCEncodedMessage message(
        Proto::SOP::SOPType::SOP,
        revision
    );

    auto &header = message.header();
    header.portDataRole(Proto::PDHeader::PortDataRole::UFP);
    header.portPowerRole(Proto::PDHeader::PortPowerRole::Sink);
    header.specRevision(Proto::PDHeader::SpecRevision::Rev3_x);

    _messageSender.sendMessageAndAwaitGoodCRC(message);
}

void SinkContext::sendGetPPSStatus() {
    const Proto::ControlMessage getPPSStatus;
    PHY::BMCEncodedMessage message(
        Proto::SOP::SOPType::SOP,
        getPPSStatus
    );

    auto &header = message.header();
    header.rawMessageType(static_cast<uint32_t>(Proto::ControlMessageType::Get_PPS_Status));
    header.numDataObjects(0);
    header.portDataRole(Proto::PDHeader::PortDataRole::UFP);
    header.portPowerRole(Proto::PDHeader::PortPowerRole::Sink);
    header.specRevision(Proto::PDHeader::SpecRevision::Rev3_x);

    _messageSender.sendMessageAndAwaitGoodCRC(message);
}

void SinkContext::sendManufacturerInfo(std::span<const uint8_t> requestPayload) {
    const bool isPortRequest =
        requestPayload.size() == 2 &&
        requestPayload[0] == 0 &&
        requestPayload[1] == 0;

    const Proto::ManufacturerInfo manufacturerInfo = isPortRequest
        ? Proto::ManufacturerInfo::port(
            T76_IC_USB_VENDOR_ID,
            T76_IC_USB_PRODUCT_ID,
            T76_IC_USB_MANUFACTURER_STRING
        )
        : Proto::ManufacturerInfo::unsupported();

    PHY::BMCEncodedMessage message(
        Proto::SOP::SOPType::SOP,
        manufacturerInfo
    );

    auto &header = message.header();
    header.extended(true);
    header.extendedMessageType(Proto::ExtendedMessageType::Manufacturer_Info);
    header.portDataRole(Proto::PDHeader::PortDataRole::UFP);
    header.portPowerRole(Proto::PDHeader::PortPowerRole::Sink);
    header.specRevision(Proto::PDHeader::SpecRevision::Rev3_x);

    _messageSender.sendMessageAndAwaitGoodCRC(message);
}

void SinkContext::sendEPRMode(Proto::EPRMode::Action action, uint8_t data) {
    const Proto::EPRMode eprMode(action, data);
    PHY::BMCEncodedMessage message(
        Proto::SOP::SOPType::SOP,
        eprMode
    );

    auto &header = message.header();
    header.portDataRole(Proto::PDHeader::PortDataRole::UFP);
    header.portPowerRole(Proto::PDHeader::PortPowerRole::Sink);
    header.specRevision(Proto::PDHeader::SpecRevision::Rev3_x);

    _messageSender.sendMessageAndAwaitGoodCRC(message);
}

void SinkContext::sendExtendedControlMessage(uint8_t controlType, bool awaitGoodCRC) {
    Proto::PDExtendedHeader extHeader(0);
    extHeader.dataSizeBytes(2);
    extHeader.requestChunk(false);
    extHeader.chunked(false);
    extHeader.chunkNumber(0);

    std::array<uint8_t, 4> rawBody = {
        static_cast<uint8_t>(extHeader.raw() & 0xFF),
        static_cast<uint8_t>((extHeader.raw() >> 8) & 0xFF),
        controlType,
        0
    };

    const uint32_t numDataObjects = 1;
    const SinkRawPDMessage rawMessage(
        std::span<const uint8_t>(rawBody.data(), rawBody.size()),
        numDataObjects,
        static_cast<uint32_t>(Proto::ExtendedMessageType::Extended_Control)
    );

    PHY::BMCEncodedMessage message(
        Proto::SOP::SOPType::SOP,
        rawMessage
    );

    auto &header = message.header();
    header.extended(true);
    header.extendedMessageType(Proto::ExtendedMessageType::Extended_Control);
    header.portDataRole(Proto::PDHeader::PortDataRole::UFP);
    header.portPowerRole(Proto::PDHeader::PortPowerRole::Sink);
    header.specRevision(Proto::PDHeader::SpecRevision::Rev3_x);

    if (awaitGoodCRC) {
        _messageSender.sendMessageAndAwaitGoodCRC(message);
    } else {
        _messageSender.sendMessage(message);
    }
}

void SinkContext::sendMessageAndAwaitGoodCRC(const PHY::BMCEncodedMessage& message) {
    _messageSender.sendMessageAndAwaitGoodCRC(message);
}

void SinkContext::abandonPendingMessage() {
    _messageSender.abandonPendingMessage();
}

SinkRequestResult SinkContext::validatePDORequest(
    size_t pdoIndex,
    uint32_t voltageMV,
    uint32_t currentMA) const {
    (void)currentMA;

    const bool isValidState = _runtimeState._state == SinkState::PE_SNK_Ready ||
        _runtimeState._state == SinkState::PE_SNK_Wait_for_Capabilities ||
        _runtimeState._state == SinkState::PE_SNK_Get_Source_Cap ||
        _runtimeState._state == SinkState::PE_SNK_EPR_Keepalive;

    if (!isValidState) {
        return SinkRequestResult::failure("Sink state does not allow PDO requests");
    }

    if (totalPDOCount() == 0) {
        return SinkRequestResult::failure("No source PDOs are available");
    }

    if (pdoIndex >= totalPDOCount()) {
        return SinkRequestResult::failure("PDO index out of range");
    }

    const auto pdoOpt = pdoAtIndex(pdoIndex);
    if (!pdoOpt.has_value()) {
        return SinkRequestResult::failure("PDO is unavailable");
    }

    if (!requestObjectPositionAtIndex(pdoIndex).has_value()) {
        return SinkRequestResult::failure("PDO request object position is unavailable");
    }

    const auto& pdoVariant = pdoOpt.value();
    if (std::holds_alternative<Proto::SPRPPSAPDO>(pdoVariant) ||
        std::holds_alternative<Proto::SPRAVSAPDO>(pdoVariant) ||
        std::holds_alternative<Proto::EPRAVSAPDO>(pdoVariant)) {
        return _validateAugmentedPDORequest(pdoVariant, voltageMV);
    }

    return SinkRequestResult::ok();
}

SinkRequestResult SinkContext::requestPDO(size_t pdoIndex, uint32_t voltageMV, uint32_t currentMA) {
    const SinkRequestResult validation = validatePDORequest(pdoIndex, voltageMV, currentMA);
    if (!validation) {
        return validation;
    }

    return _selectCapabilityStateHandler.requestPDO(*this, pdoIndex, voltageMV, currentMA);
}

alarm_id_t SinkContext::addAlarmInUs(
    int64_t delayUs,
    alarm_callback_t callback,
    void *userData,
    bool fireIfPast) {
    return _alarmService.addAlarmInUs(delayUs, callback, userData, fireIfPast);
}

bool SinkContext::cancelAlarm(alarm_id_t id) {
    return _alarmService.cancelAlarm(id);
}

void SinkContext::enqueueTimeoutEvent(SinkTimeoutEvent event) {
    if (_enqueueTimeoutEventCallback) {
        _enqueueTimeoutEventCallback(event);
    }
}

bool SinkContext::_sourceEPRCapable() const {
    if (!_runtimeState._sourceCapabilities.has_value() ||
        _runtimeState._sourceCapabilities->pdoCount() == 0) {
        return false;
    }

    const auto& firstPDO = _runtimeState._sourceCapabilities->pdo(0);
    if (std::holds_alternative<Proto::FixedSupplyPDO>(firstPDO)) {
        const auto& fixedPDO = std::get<Proto::FixedSupplyPDO>(firstPDO);
        return fixedPDO.eprModeCapable();
    }

    return false;
}

SinkRequestResult SinkContext::_validateAugmentedPDORequest(
    const Proto::PDOVariant& pdoVariant,
    uint32_t voltageMV) const {
    if (std::holds_alternative<Proto::SPRPPSAPDO>(pdoVariant)) {
        return SinkRequestResult::ok();
    }

    if (std::holds_alternative<Proto::SPRAVSAPDO>(pdoVariant)) {
        const Proto::SPRAVSAPDO& sprAvs = std::get<Proto::SPRAVSAPDO>(pdoVariant);
        uint32_t requestedVoltageMillivolts = voltageMV == 0 ? 15000 : voltageMV;
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

        return SinkRequestResult::ok();
    }

    if (std::holds_alternative<Proto::EPRAVSAPDO>(pdoVariant)) {
        const Proto::EPRAVSAPDO& eprAvs = std::get<Proto::EPRAVSAPDO>(pdoVariant);
        uint32_t requestedVoltageMillivolts = voltageMV == 0
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

        return SinkRequestResult::ok();
    }

    return SinkRequestResult::failure("Unsupported augmented PDO type");
}

void SinkContext::_notifySinkInfoChanged(SinkInfoChange change) {
    if (_sinkInfoChangedCallback) {
        _sinkInfoChangedCallback(change);
    }
}

} // namespace T76::DRPD::Logic
