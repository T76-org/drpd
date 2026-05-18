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
#include "state_handlers/send_response.hpp"
#include "state_handlers/send_soft_reset.hpp"
#include "state_handlers/select_capability.hpp"
#include "state_handlers/transition_sink.hpp"
#include "state_handlers/wait_for_capabilities.hpp"

namespace T76::DRPD::Logic {

namespace {
    void writeLE32(std::span<uint8_t> bytes, size_t offset, uint32_t value) {
        bytes[offset + 0] = static_cast<uint8_t>(value & 0xFF);
        bytes[offset + 1] = static_cast<uint8_t>((value >> 8) & 0xFF);
        bytes[offset + 2] = static_cast<uint8_t>((value >> 16) & 0xFF);
        bytes[offset + 3] = static_cast<uint8_t>((value >> 24) & 0xFF);
    }
}

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
    SendResponseStateHandler& sendResponseStateHandler,
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
    _localSinkCapabilityPDOs({_defaultFixedSinkPDO()}),
    _localEPRSinkCapabilityPDOs({}),
    _disconnectedStateHandler(disconnectedStateHandler),
    _eprKeepaliveStateHandler(eprKeepaliveStateHandler),
    _eprModeExitStateHandler(eprModeExitStateHandler),
    _eprModeEntryStateHandler(eprModeEntryStateHandler),
    _getPPSStatusStateHandler(getPPSStatusStateHandler),
    _readySinkStateHandler(readySinkStateHandler),
    _sendResponseStateHandler(sendResponseStateHandler),
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

        case SinkState::PE_SNK_Send_Response:
            _runtimeState._currentStateHandler = &_sendResponseStateHandler;
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

size_t SinkContext::localSinkCapabilityCount() const {
    size_t count = 0;
    for (const uint32_t rawPDO : _localSinkCapabilityPDOs) {
        if (rawPDO != 0) {
            ++count;
        }
    }
    return count;
}

std::optional<uint32_t> SinkContext::localSinkCapabilityPDO(size_t index) const {
    if (index >= _localSinkCapabilityPDOs.size()) {
        return std::nullopt;
    }

    return _localSinkCapabilityPDOs[index];
}

bool SinkContext::setLocalSinkCapabilityPDO(size_t index, uint32_t rawPDO) {
    if (index >= _localSinkCapabilityPDOs.size()) {
        return false;
    }

    const uint32_t previous = _localSinkCapabilityPDOs[index];
    _localSinkCapabilityPDOs[index] = rawPDO;
    if (localSinkCapabilityCount() == 0) {
        _localSinkCapabilityPDOs[index] = previous;
        _ensureLocalSinkCapabilities();
        return false;
    }

    _notifySinkInfoChanged(SinkInfoChange::OtherInfoChanged);
    return true;
}

size_t SinkContext::localEPRSinkCapabilityCount() const {
    size_t count = 0;
    for (const uint32_t rawPDO : _localEPRSinkCapabilityPDOs) {
        if (rawPDO != 0) {
            ++count;
        }
    }
    return count;
}

std::optional<uint32_t> SinkContext::localEPRSinkCapabilityPDO(size_t index) const {
    if (index >= _localEPRSinkCapabilityPDOs.size()) {
        return std::nullopt;
    }

    return _localEPRSinkCapabilityPDOs[index];
}

bool SinkContext::setLocalEPRSinkCapabilityPDO(size_t index, uint32_t rawPDO) {
    if (index >= _localEPRSinkCapabilityPDOs.size()) {
        return false;
    }

    _localEPRSinkCapabilityPDOs[index] = rawPDO;
    _notifySinkInfoChanged(SinkInfoChange::OtherInfoChanged);
    return true;
}

void SinkContext::setNegotiatedValues(const Proto::PDOVariant pdoVariant, float voltage, float current) {
    _runtimeState._negotiatedPDO = pdoVariant;
    _runtimeState._negotiatedVoltage = voltage;
    _runtimeState._negotiatedCurrent = current;
    _notifySinkInfoChanged(SinkInfoChange::OtherInfoChanged);
}

void SinkContext::setRequestOutcome(SinkRequestOutcome outcome) {
    _runtimeState._lastRequestStatus = SinkRequestStatus{
        .outcome = outcome,
        .pdoIndex = _runtimeState._pendingPDOIndex,
        .voltageMV = static_cast<uint32_t>(_runtimeState._pendingVoltage),
        .currentMA = static_cast<uint32_t>(_runtimeState._pendingCurrent),
    };
    _notifySinkInfoChanged(SinkInfoChange::RequestOutcomeUpdated);
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

void SinkContext::setPPSStatusQueryEnabled(bool enabled) {
    if (_runtimeState._ppsStatusQueryEnabled == enabled) {
        return;
    }

    _runtimeState._ppsStatusQueryEnabled = enabled;
    _notifySinkInfoChanged(SinkInfoChange::OtherInfoChanged);
}

bool SinkContext::ppsStatusQueryEnabled() const {
    return _runtimeState._ppsStatusQueryEnabled;
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

void SinkContext::sendNotSupportedResponse() {
    _sendResponseStateHandler.prepareResponse(
        PHY::BMCEncodedMessage::notAcceptedMessage(
            Proto::PDHeader::PortDataRole::UFP,
            Proto::PDHeader::PortPowerRole::Sink
        )
    );
    transitionTo(SinkState::PE_SNK_Send_Response);
}

void SinkContext::sendSinkCapabilities() {
    std::array<uint32_t, MaxLocalSPRSinkPDOs> rawPDOs = {};
    const size_t pdoCount = _buildLocalSinkCapabilityPDOs(rawPDOs);
    const Proto::SinkCapabilities sinkCapabilities(
        std::span<const uint32_t>(rawPDOs.data(), pdoCount)
    );
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

void SinkContext::sendSinkCapabilitiesResponse() {
    std::array<uint32_t, MaxLocalSPRSinkPDOs> rawPDOs = {};
    const size_t pdoCount = _buildLocalSinkCapabilityPDOs(rawPDOs);
    const Proto::SinkCapabilities sinkCapabilities(
        std::span<const uint32_t>(rawPDOs.data(), pdoCount)
    );
    PHY::BMCEncodedMessage message(
        Proto::SOP::SOPType::SOP,
        sinkCapabilities
    );

    auto &header = message.header();
    header.portDataRole(Proto::PDHeader::PortDataRole::UFP);
    header.portPowerRole(Proto::PDHeader::PortPowerRole::Sink);
    header.specRevision(Proto::PDHeader::SpecRevision::Rev3_x);

    _sendResponseStateHandler.prepareResponse(message);
    transitionTo(SinkState::PE_SNK_Send_Response);
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

void SinkContext::sendSinkCapabilitiesExtendedResponse() {
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

    _sendResponseStateHandler.prepareResponse(message);
    transitionTo(SinkState::PE_SNK_Send_Response);
}

bool SinkContext::sendEPRSinkCapabilitiesResponse(uint8_t chunkNumber, bool trackAsReadyResponse) {
    if (!eprEntryEnabled() || localEPRSinkCapabilityCount() == 0) {
        return false;
    }

    std::array<uint8_t, (MaxLocalSPRSinkPDOs + MaxLocalEPRSinkPDOs) * 4> payload = {};
    const size_t payloadBytes = _localEPRSinkCapabilityPayload(payload);
    if (payloadBytes == 0) {
        return false;
    }

    const size_t chunkOffset = static_cast<size_t>(chunkNumber) * EPRCapabilityChunkPayloadBytes;
    if (chunkOffset >= payloadBytes) {
        return false;
    }

    const size_t chunkPayloadBytes = std::min(
        EPRCapabilityChunkPayloadBytes,
        payloadBytes - chunkOffset
    );
    const size_t rawBodyBytes = 2 + chunkPayloadBytes;
    const size_t paddedBodyBytes = ((rawBodyBytes + 3) / 4) * 4;

    std::array<uint8_t, 28> rawBody = {};
    Proto::PDExtendedHeader extHeader;
    extHeader.dataSizeBytes(static_cast<uint16_t>(payloadBytes));
    extHeader.requestChunk(false);
    extHeader.chunked(true);
    extHeader.chunkNumber(chunkNumber);

    rawBody[0] = static_cast<uint8_t>(extHeader.raw() & 0xFF);
    rawBody[1] = static_cast<uint8_t>((extHeader.raw() >> 8) & 0xFF);
    for (size_t i = 0; i < chunkPayloadBytes; ++i) {
        rawBody[2 + i] = payload[chunkOffset + i];
    }

    const SinkRawPDMessage rawMessage(
        std::span<const uint8_t>(rawBody.data(), paddedBodyBytes),
        static_cast<uint32_t>(paddedBodyBytes / 4),
        static_cast<uint32_t>(Proto::ExtendedMessageType::EPR_Sink_Capabilities)
    );

    PHY::BMCEncodedMessage message(
        Proto::SOP::SOPType::SOP,
        rawMessage
    );

    auto &header = message.header();
    header.extended(true);
    header.extendedMessageType(Proto::ExtendedMessageType::EPR_Sink_Capabilities);
    header.portDataRole(Proto::PDHeader::PortDataRole::UFP);
    header.portPowerRole(Proto::PDHeader::PortPowerRole::Sink);
    header.specRevision(Proto::PDHeader::SpecRevision::Rev3_x);

    if (trackAsReadyResponse) {
        _sendResponseStateHandler.prepareResponse(message);
        transitionTo(SinkState::PE_SNK_Send_Response);
    } else {
        sendMessageAndAwaitGoodCRC(message);
    }

    return true;
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

void SinkContext::sendRevisionResponse() {
    const Proto::Revision revision = Proto::Revision::revision3p2Version1p1();
    PHY::BMCEncodedMessage message(
        Proto::SOP::SOPType::SOP,
        revision
    );

    auto &header = message.header();
    header.portDataRole(Proto::PDHeader::PortDataRole::UFP);
    header.portPowerRole(Proto::PDHeader::PortPowerRole::Sink);
    header.specRevision(Proto::PDHeader::SpecRevision::Rev3_x);

    _sendResponseStateHandler.prepareResponse(message);
    transitionTo(SinkState::PE_SNK_Send_Response);
}

bool SinkContext::sendGetPPSStatus() {
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

    return sendSinkInitiatedMessageAndAwaitGoodCRC(message);
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

void SinkContext::sendManufacturerInfoResponse(std::span<const uint8_t> requestPayload) {
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

    _sendResponseStateHandler.prepareResponse(message);
    transitionTo(SinkState::PE_SNK_Send_Response);
}

bool SinkContext::sendEPRMode(Proto::EPRMode::Action action, uint8_t data) {
    const Proto::EPRMode eprMode(action, data);
    PHY::BMCEncodedMessage message(
        Proto::SOP::SOPType::SOP,
        eprMode
    );

    auto &header = message.header();
    header.portDataRole(Proto::PDHeader::PortDataRole::UFP);
    header.portPowerRole(Proto::PDHeader::PortPowerRole::Sink);
    header.specRevision(Proto::PDHeader::SpecRevision::Rev3_x);

    return sendSinkInitiatedMessageAndAwaitGoodCRC(message);
}

bool SinkContext::sendExtendedControlMessage(uint8_t controlType, bool awaitGoodCRC) {
    Proto::PDExtendedHeader extHeader(0);
    extHeader.dataSizeBytes(2);
    extHeader.requestChunk(false);
    // Sink policy advertises chunked-only extended-message support, so even
    // single-fragment extended control messages use chunked framing.
    extHeader.chunked(true);
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

    if (!sinkMayInitiateAMS()) {
        _scheduleSinkTxOKRetry();
        return false;
    }

    if (awaitGoodCRC) {
        sendMessageAndAwaitGoodCRC(message);
    } else {
        _messageSender.sendMessage(message);
    }

    return true;
}

bool SinkContext::sinkMayInitiateAMS() const {
    return _ccBusController.sinkTransmitPermission() == SinkTransmitPermission::SinkTxOK;
}

bool SinkContext::sendSinkInitiatedMessageAndAwaitGoodCRC(const PHY::BMCEncodedMessage& message) {
    if (!sinkMayInitiateAMS()) {
        _scheduleSinkTxOKRetry();
        return false;
    }

    sendMessageAndAwaitGoodCRC(message);
    return true;
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

SinkRequestResult SinkContext::requestPDO(
    size_t pdoIndex,
    uint32_t voltageMV,
    uint32_t currentMA,
    bool collisionAvoidanceExempt) {
    const SinkRequestResult validation = validatePDORequest(pdoIndex, voltageMV, currentMA);
    if (!validation) {
        return validation;
    }

    return _selectCapabilityStateHandler.requestPDO(
        *this,
        pdoIndex,
        voltageMV,
        currentMA,
        collisionAvoidanceExempt);
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

uint32_t SinkContext::_defaultFixedSinkPDO() {
    constexpr uint32_t kVoltage50mV = 5000 / 50;
    constexpr uint32_t kCurrent10mA = 500 / 10;
    return ((kVoltage50mV & 0x3FFu) << 10) | (kCurrent10mA & 0x3FFu);
}

void SinkContext::_ensureLocalSinkCapabilities() {
    if (localSinkCapabilityCount() == 0) {
        _localSinkCapabilityPDOs[0] = _defaultFixedSinkPDO();
    }
}

size_t SinkContext::_buildLocalSinkCapabilityPDOs(
    std::array<uint32_t, MaxLocalSPRSinkPDOs>& pdos) const {
    size_t count = 0;
    for (const uint32_t rawPDO : _localSinkCapabilityPDOs) {
        if (rawPDO == 0) {
            continue;
        }
        pdos[count++] = rawPDO;
    }
    return count;
}

size_t SinkContext::_localEPRSinkCapabilityPayload(
    std::array<uint8_t, (MaxLocalSPRSinkPDOs + MaxLocalEPRSinkPDOs) * 4>& payload) const {
    std::array<uint32_t, MaxLocalSPRSinkPDOs> sprPDOs = {};
    const size_t sprCount = _buildLocalSinkCapabilityPDOs(sprPDOs);
    if (sprCount == 0 || localEPRSinkCapabilityCount() == 0) {
        return 0;
    }

    for (size_t i = 0; i < MaxLocalSPRSinkPDOs; ++i) {
        const uint32_t rawPDO = i < sprCount ? sprPDOs[i] : 0;
        writeLE32(payload, i * 4, rawPDO);
    }

    size_t eprIndex = 0;
    for (const uint32_t rawPDO : _localEPRSinkCapabilityPDOs) {
        if (rawPDO == 0) {
            continue;
        }
        writeLE32(payload, (MaxLocalSPRSinkPDOs + eprIndex) * 4, rawPDO);
        ++eprIndex;
    }

    return (MaxLocalSPRSinkPDOs + eprIndex) * 4;
}

void SinkContext::_scheduleSinkTxOKRetry() {
    addAlarmInUs(
        LOGIC_SINK_COLLISION_AVOIDANCE_RETRY_US,
        _onSinkTxOKRetryTimeoutCallback,
        this,
        true
    );
}

int64_t SinkContext::_onSinkTxOKRetryTimeoutCallback(alarm_id_t id, void *userData) {
    (void)id;
    auto *context = static_cast<SinkContext *>(userData);
    context->enqueueTimeoutEvent(SinkTimeoutEvent{SinkTimeoutEventType::SinkTxOKRetryTimeout});
    return 0;
}

} // namespace T76::DRPD::Logic
