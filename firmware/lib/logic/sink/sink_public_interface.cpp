/**
 * @file sink_public_interface.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "sink.hpp"
#include "sink_raw_pd_message.hpp"

#include <algorithm>
#include <array>

#include "../cc_bus_controller.hpp"

namespace T76::DRPD::Logic {

void Sink::reset(SinkResetType resetType) {
    _chunkingNotSupportedPending = false;

    if (_chunkingNotSupportedAlarmId != -1) {
        _alarmService.cancelAlarm(_chunkingNotSupportedAlarmId);
        _chunkingNotSupportedAlarmId = -1;
    }

    _context.performReset(resetType);
}

size_t Sink::pdoCount() const {
    return _context.totalPDOCount();
}

std::optional<Proto::PDOVariant> Sink::pdo(size_t index) const {
    return _context.pdoAtIndex(index);
}

size_t Sink::localSinkCapabilityCount() const {
    return _context.localSinkCapabilityCount();
}

std::optional<uint32_t> Sink::localSinkCapabilityPDO(size_t index) const {
    return _context.localSinkCapabilityPDO(index);
}

bool Sink::setLocalSinkCapabilityPDO(size_t index, uint32_t rawPDO) {
    return _context.setLocalSinkCapabilityPDO(index, rawPDO);
}

size_t Sink::localEPRSinkCapabilityCount() const {
    return _context.localEPRSinkCapabilityCount();
}

std::optional<uint32_t> Sink::localEPRSinkCapabilityPDO(size_t index) const {
    return _context.localEPRSinkCapabilityPDO(index);
}

bool Sink::setLocalEPRSinkCapabilityPDO(size_t index, uint32_t rawPDO) {
    return _context.setLocalEPRSinkCapabilityPDO(index, rawPDO);
}

std::optional<Proto::PDOVariant> Sink::negotiatedPDO() const {
    return _runtimeState._negotiatedPDO;
}

float Sink::negotiatedVoltage() const {
    return _runtimeState._negotiatedVoltage;
}

float Sink::negotiatedCurrent() const {
    return _runtimeState._negotiatedCurrent;
}

SinkRequestResult Sink::requestPDO(size_t pdoIndex, uint32_t voltageMV, uint32_t currentMA) {
    if (!_enabled.load()) {
        return SinkRequestResult::failure("Sink is disabled");
    }

    const SinkRequestResult validation = _context.validatePDORequest(
        pdoIndex,
        voltageMV,
        currentMA
    );
    if (!validation) {
        return validation;
    }

    const PendingPDORequest request{pdoIndex, voltageMV, currentMA};
    if (!queue_try_add(&_pendingRequestQueue, &request)) {
        return SinkRequestResult::failure("Sink request queue is full");
    }

    return SinkRequestResult::ok();
}

SinkRequestStatus Sink::lastRequestStatus() const {
    return _runtimeState._lastRequestStatus;
}

void Sink::eprEntryEnabled(bool enabled) {
    _context.setEPREntryEnabled(enabled);

    if (!enabled && _runtimeState._eprModeActive) {
        _eprExitPending.store(true, std::memory_order_release);
    }
}

bool Sink::eprEntryEnabled() const {
    return _context.eprEntryEnabled();
}

void Sink::ppsStatusQueryEnabled(bool enabled) {
    _context.setPPSStatusQueryEnabled(enabled);
}

bool Sink::ppsStatusQueryEnabled() const {
    return _context.ppsStatusQueryEnabled();
}

void Sink::applyPersistentConfig(const T76::DRPD::SinkPersistentConfig& config) {
    _context.setEPREntryEnabled(config.eprEntryEnabled);
    _context.setPPSStatusQueryEnabled(config.ppsStatusQueryEnabled);
}

T76::DRPD::SinkPersistentConfig Sink::exportPersistentConfig() const {
    return T76::DRPD::SinkPersistentConfig{
        .eprEntryEnabled = _context.eprEntryEnabled(),
        .ppsStatusQueryEnabled = _context.ppsStatusQueryEnabled(),
    };
}

SinkState Sink::state() const {
    return _runtimeState._state;
}

void Sink::sinkInfoChanged(std::function<void(SinkInfoChange)> callback) {
    _sinkInfoChangedCallback = std::move(callback);
}

std::function<void(SinkInfoChange)> Sink::sinkInfoChanged() const {
    return _sinkInfoChangedCallback;
}

void Sink::_sendExtendedChunkRequest(
    Proto::ExtendedMessageType type,
    uint16_t payloadSizeBytes,
    uint8_t chunkNumber) {
    (void)payloadSizeBytes;

    Proto::PDExtendedHeader extHeader(0);
    extHeader.dataSizeBytes(0);
    extHeader.requestChunk(true);
    extHeader.chunked(true);
    extHeader.chunkNumber(chunkNumber);

    std::array<uint8_t, 4> rawBody = {
        static_cast<uint8_t>(extHeader.raw() & 0xFF),
        static_cast<uint8_t>((extHeader.raw() >> 8) & 0xFF),
        0,
        0
    };

    const SinkRawPDMessage rawMessage(
        std::span<const uint8_t>(rawBody.data(), rawBody.size()),
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

} // namespace T76::DRPD::Logic
