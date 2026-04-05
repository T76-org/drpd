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
    _context.performReset(resetType);
}

size_t Sink::pdoCount() const {
    return _context.totalPDOCount();
}

std::optional<Proto::PDOVariant> Sink::pdo(size_t index) const {
    return _context.pdoAtIndex(index);
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

bool Sink::requestPDO(size_t pdoIndex, uint32_t voltageMV, uint32_t currentMA) {
    if (!_enabled.load()) {
        return false;
    }

    const PendingPDORequest request{pdoIndex, voltageMV, currentMA};
    return queue_try_add(&_pendingRequestQueue, &request);
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
    Proto::PDExtendedHeader extHeader(0);
    extHeader.dataSizeBytes(payloadSizeBytes);
    extHeader.requestChunk(true);
    extHeader.chunked(true);
    extHeader.chunkNumber(chunkNumber & 0x0F);

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
