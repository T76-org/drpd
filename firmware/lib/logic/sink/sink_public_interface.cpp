/**
 * @file sink_interface.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "sink.hpp"

#include <set>
#include <utility>
#include <vector>

#include "state_handlers/select_capability.hpp"

#include "../cc_bus_controller.hpp"


using namespace T76::DRPD::Logic;

namespace {

    class RawPDMessage : public T76::DRPD::Proto::PDMessage {
    public:
        RawPDMessage(
            std::vector<uint8_t> rawBody,
            uint32_t numDataObjects,
            uint32_t rawMessageType) :
            _rawBody(std::move(rawBody)),
            _numDataObjects(numDataObjects),
            _rawMessageType(rawMessageType) {}

        std::span<const uint8_t> raw() const override {
            return _rawBody;
        }

        uint32_t numDataObjects() const override {
            return _numDataObjects;
        }

        uint32_t rawMessageType() const override {
            return _rawMessageType;
        }

    protected:
        std::vector<uint8_t> _rawBody;
        uint32_t _numDataObjects;
        uint32_t _rawMessageType;
    };

} // namespace

void Sink::reset(SinkResetType resetType) {
    _messageSender.reset();

    if (resetType == SinkResetType::SoftReset) {
        _messageSender.sendMessage(
            PHY::BMCEncodedMessage::softResetMessage(
                Proto::PDHeader::PortDataRole::UFP,
                Proto::PDHeader::PortPowerRole::Sink
            )
        );
    }

    _sourceCapabilities.reset();
    _eprCapabilities.reset();
    _sourceSupportsEpr = false;

    _hasExplicitContract = false;
    _eprModeActive = false;
    _eprEntryAttempted = false;

    _hasLastReceivedMessageId = false;
    _lastReceivedMessageId = 0;

    _pendingRequestedPDO.reset();
    _pendingVoltage = 0.0f;
    _pendingCurrent = 0.0f;

    _negotiatedPDO.reset();
    _negotiatedVoltage = 0.0f;
    _negotiatedCurrent = 0.0f;

    for (auto &reassembly : _extendedReassemblyStates) {
        reassembly = ExtendedReassemblyState{};
    }

    for (auto &payload : _completedExtendedPayloads) {
        payload.reset();
    }

    if (_currentStateHandler) {
        _currentStateHandler->reset();
    }

    if (_ccBusController.state() == CCBusState::Attached) {
        _setState(SinkState::PE_SNK_Wait_for_Capabilities);
    } else {
        _setState(SinkState::Disconnected);
    }
}

size_t Sink::pdoCount() const {
    return _totalPDOCount();
}

std::optional<Proto::PDOVariant> Sink::pdo(size_t index) const {
    return _pdoAtIndex(index);
}

std::optional<Proto::PDOVariant> Sink::negotiatedPDO() const {
    return _negotiatedPDO;
}

float Sink::negotiatedVoltage() const {
    return _negotiatedVoltage;
}

float Sink::negotiatedCurrent() const {
    return _negotiatedCurrent;
}

bool Sink::requestPDO(size_t pdoIndex, uint32_t voltageMV, uint32_t currentMA) {
    static std::set<SinkState> validStates = {
        SinkState::PE_SNK_Ready,
        SinkState::PE_SNK_Wait_for_Capabilities,
        SinkState::PE_SNK_Get_Source_Cap,
        SinkState::PE_SNK_EPR_Keepalive,
    };

    if (validStates.find(state()) == validStates.end()) {
        return false;
    }

    return _selectCapabilityStateHandler.requestPDO(pdoIndex, voltageMV, currentMA);
}

bool Sink::sourceEPRCapable() const {
    if (!_sourceCapabilities.has_value() || _sourceCapabilities->pdoCount() == 0) {
        return false;
    }

    const auto& firstPDO = _sourceCapabilities->pdo(0);
    if (std::holds_alternative<Proto::FixedSupplyPDO>(firstPDO)) {
        const auto& fixedPDO = std::get<Proto::FixedSupplyPDO>(firstPDO);
        return fixedPDO.eprModeCapable();
    }

    return false;
}

SinkState Sink::state() const {
    return _state;
}

void Sink::sinkInfoChanged(std::function<void(SinkInfoChange)> callback) {
    _sinkInfoChangedCallback = std::move(callback);
}

std::function<void(SinkInfoChange)> Sink::sinkInfoChanged() const {
    return _sinkInfoChangedCallback;
}

std::optional<std::vector<uint8_t>> Sink::_takeCompletedExtendedPayload(
    Proto::ExtendedMessageType type) {
    const size_t typeIndex = static_cast<size_t>(type) & 0x1F;

    if (!_completedExtendedPayloads[typeIndex].has_value()) {
        return std::nullopt;
    }

    auto payload = std::move(_completedExtendedPayloads[typeIndex].value());
    _completedExtendedPayloads[typeIndex].reset();
    return payload;
}

void Sink::_sendNotSupportedMessage() {
    _messageSender.sendMessageAndAwaitGoodCRC(
        PHY::BMCEncodedMessage::notAcceptedMessage(
            Proto::PDHeader::PortDataRole::UFP,
            Proto::PDHeader::PortPowerRole::Sink
        )
    );
}

void Sink::_sendEPRMode(Proto::EPRMode::Action action, uint8_t data) {
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

void Sink::_sendExtendedControlMessage(
    ExtendedControlType controlType,
    bool awaitGoodCRC) {
    Proto::PDExtendedHeader extHeader(0);
    // ECDB is always 2 bytes: Type + Data (set Data=0 when unused).
    extHeader.dataSizeBytes(2);
    extHeader.requestChunk(false);
    extHeader.chunked(false);
    extHeader.chunkNumber(0);

    std::vector<uint8_t> rawBody = {
        static_cast<uint8_t>(extHeader.raw() & 0xFF),
        static_cast<uint8_t>((extHeader.raw() >> 8) & 0xFF),
        static_cast<uint8_t>(controlType),
        0
    };

    while ((rawBody.size() % 4) != 0) {
        rawBody.push_back(0);
    }

    const uint32_t numDataObjects = static_cast<uint32_t>(rawBody.size() / 4);
    const RawPDMessage rawMessage(
        std::move(rawBody),
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

void Sink::_sendExtendedChunkRequest(
    Proto::ExtendedMessageType type,
    uint16_t payloadSizeBytes,
    uint8_t chunkNumber) {
    Proto::PDExtendedHeader extHeader(0);
    extHeader.dataSizeBytes(payloadSizeBytes);
    extHeader.requestChunk(true);
    extHeader.chunked(true);
    extHeader.chunkNumber(chunkNumber & 0x0F);

    std::vector<uint8_t> rawBody = {
        static_cast<uint8_t>(extHeader.raw() & 0xFF),
        static_cast<uint8_t>((extHeader.raw() >> 8) & 0xFF),
        0,
        0
    };

    const RawPDMessage rawMessage(
        std::move(rawBody),
        1,
        static_cast<uint32_t>(type)
    );

    PHY::BMCEncodedMessage message(
        Proto::SOP::SOPType::SOP,
        rawMessage
    );

    auto &header = message.header();
    header.extended(true);
    header.extendedMessageType(type);
    header.portDataRole(Proto::PDHeader::PortDataRole::UFP);
    header.portPowerRole(Proto::PDHeader::PortPowerRole::Sink);
    header.specRevision(Proto::PDHeader::SpecRevision::Rev3_x);

    _messageSender.sendMessageAndAwaitGoodCRC(message);
}
