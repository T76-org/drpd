/**
 * @file sink_context.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "sink_context.hpp"

#include <algorithm>
#include <array>

#include "../cc_bus_controller.hpp"
#include "state_handlers/disconnected.hpp"
#include "state_handlers/epr_keepalive.hpp"
#include "state_handlers/epr_mode_entry.hpp"
#include "state_handlers/ready.hpp"
#include "state_handlers/select_capability.hpp"
#include "state_handlers/transition_sink.hpp"
#include "state_handlers/wait_for_capabilities.hpp"


using namespace T76::DRPD::Logic;

namespace {

    class RawPDMessage : public T76::DRPD::Proto::PDMessage {
    public:
        RawPDMessage(
            std::span<const uint8_t> rawBody,
            uint32_t numDataObjects,
            uint32_t rawMessageType) :
            _rawBody(),
            _rawBodyLength(std::min(rawBody.size(), _rawBody.size())),
            _numDataObjects(numDataObjects),
            _rawMessageType(rawMessageType) {
            for (size_t i = 0; i < _rawBodyLength; ++i) {
                _rawBody[i] = rawBody[i];
            }
        }

        std::span<const uint8_t> raw() const override {
            return std::span<const uint8_t>(_rawBody.data(), _rawBodyLength);
        }

        uint32_t numDataObjects() const override {
            return _numDataObjects;
        }

        uint32_t rawMessageType() const override {
            return _rawMessageType;
        }

    protected:
        std::array<uint8_t, LOGIC_SINK_RAW_PD_MESSAGE_MAX_BODY_BYTES> _rawBody;
        size_t _rawBodyLength;
        uint32_t _numDataObjects;
        uint32_t _rawMessageType;
    };

} // namespace

SinkContext::SinkContext(
    SinkRuntimeState& runtimeState,
    SinkMessageSender& messageSender,
    CCBusController& ccBusController,
    DisconnectedStateHandler& disconnectedStateHandler,
    EPRKeepaliveStateHandler& eprKeepaliveStateHandler,
    EPRModeEntryStateHandler& eprModeEntryStateHandler,
    ReadySinkStateHandler& readySinkStateHandler,
    SelectCapabilityStateHandler& selectCapabilityStateHandler,
    TransitionSinkStateHandler& transitionSinkStateHandler,
    WaitForCapabilitiesStateHandler& waitForCapabilitiesStateHandler,
    std::function<void(SinkInfoChange)>& sinkInfoChangedCallback) :
    _runtimeState(runtimeState),
    _messageSender(messageSender),
    _ccBusController(ccBusController),
    _disconnectedStateHandler(disconnectedStateHandler),
    _eprKeepaliveStateHandler(eprKeepaliveStateHandler),
    _eprModeEntryStateHandler(eprModeEntryStateHandler),
    _readySinkStateHandler(readySinkStateHandler),
    _selectCapabilityStateHandler(selectCapabilityStateHandler),
    _transitionSinkStateHandler(transitionSinkStateHandler),
    _waitForCapabilitiesStateHandler(waitForCapabilitiesStateHandler),
    _sinkInfoChangedCallback(sinkInfoChangedCallback) {}

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

        case SinkState::PE_SNK_Select_Capability:
            _runtimeState._currentStateHandler = &_selectCapabilityStateHandler;
            break;

        case SinkState::PE_SNK_Transition_Sink:
            _runtimeState._currentStateHandler = &_transitionSinkStateHandler;
            break;

        case SinkState::PE_SNK_Ready:
            _runtimeState._currentStateHandler = &_readySinkStateHandler;
            break;

        case SinkState::PE_SNK_EPR_Mode_Entry:
            _runtimeState._currentStateHandler = &_eprModeEntryStateHandler;
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

    if (resetType == SinkResetType::SoftReset) {
        _messageSender.sendMessage(
            PHY::BMCEncodedMessage::softResetMessage(
                Proto::PDHeader::PortDataRole::UFP,
                Proto::PDHeader::PortPowerRole::Sink
            )
        );
    }

    if (_runtimeState._currentStateHandler) {
        _runtimeState._currentStateHandler->reset(*this);
    }
    _runtimeState.reset();

    if (_ccBusController.state() == CCBusState::Attached) {
        transitionTo(SinkState::PE_SNK_Wait_for_Capabilities);
    } else {
        transitionTo(SinkState::Disconnected);
    }
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

size_t SinkContext::totalPDOCount() const {
    if (_runtimeState._eprCapabilities.has_value()) {
        return _runtimeState._eprCapabilities->pdoCount();
    }

    if (_runtimeState._sourceCapabilities.has_value()) {
        return _runtimeState._sourceCapabilities->pdoCount();
    }

    return 0;
}

std::optional<Proto::PDOVariant> SinkContext::pdoAtIndex(size_t index) const {
    if (_runtimeState._eprCapabilities.has_value()) {
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
    if (_runtimeState._eprCapabilities.has_value()) {
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
    const RawPDMessage rawMessage(
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

bool SinkContext::requestPDO(size_t pdoIndex, uint32_t voltageMV, uint32_t currentMA) {
    const bool isValidState = _runtimeState._state == SinkState::PE_SNK_Ready ||
        _runtimeState._state == SinkState::PE_SNK_Wait_for_Capabilities ||
        _runtimeState._state == SinkState::PE_SNK_Get_Source_Cap ||
        _runtimeState._state == SinkState::PE_SNK_EPR_Keepalive;

    if (!isValidState) {
        return false;
    }

    return _selectCapabilityStateHandler.requestPDO(*this, pdoIndex, voltageMV, currentMA);
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

void SinkContext::_notifySinkInfoChanged(SinkInfoChange change) {
    if (_sinkInfoChangedCallback) {
        _sinkInfoChangedCallback(change);
    }
}
