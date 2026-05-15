/**
 * @file sink_capabilities_extended.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "sink_capabilities_extended.hpp"

#include "../pd_extended_header.hpp"
#include "../pd_message_types.hpp"

using namespace T76::DRPD::Proto;

SinkCapabilitiesExtended SinkCapabilitiesExtended::minimalSPR(
    uint16_t vid,
    uint16_t pid,
    uint8_t sprPDPW) {
    Fields fields;
    fields.vid = vid;
    fields.pid = pid;
    fields.sprSinkMinimumPDP = sprPDPW;
    fields.sprSinkOperationalPDP = sprPDPW;
    fields.sprSinkMaximumPDP = sprPDPW;
    return SinkCapabilitiesExtended(fields);
}

SinkCapabilitiesExtended::SinkCapabilitiesExtended(const Fields& fields) :
    _fields(fields) {}

std::span<const uint8_t> SinkCapabilitiesExtended::raw() const {
    _rawBytes.fill(0);

    PDExtendedHeader extHeader;
    extHeader.dataSizeBytes(24);
    extHeader.requestChunk(false);
    // Sink policy advertises chunked-only extended-message support, so even
    // single-fragment responses use chunked framing with Chunk Number 0.
    extHeader.chunked(true);
    extHeader.chunkNumber(0);

    _rawBytes[0] = static_cast<uint8_t>(extHeader.raw() & 0xFF);
    _rawBytes[1] = static_cast<uint8_t>((extHeader.raw() >> 8) & 0xFF);

    constexpr size_t kSKEDBOffset = 2;
    _writeLE16(_rawBytes, kSKEDBOffset + 0, _fields.vid);
    _writeLE16(_rawBytes, kSKEDBOffset + 2, _fields.pid);
    _writeLE32(_rawBytes, kSKEDBOffset + 4, _fields.xid);
    _rawBytes[kSKEDBOffset + 8] = _fields.firmwareVersion;
    _rawBytes[kSKEDBOffset + 9] = _fields.hardwareVersion;
    _rawBytes[kSKEDBOffset + 10] = 1;
    _rawBytes[kSKEDBOffset + 11] = _fields.loadStep & 0x03u;
    _writeLE16(_rawBytes, kSKEDBOffset + 12, _fields.sinkLoadCharacteristics);
    _rawBytes[kSKEDBOffset + 14] = _fields.compliance & 0x07u;
    _rawBytes[kSKEDBOffset + 15] = _fields.touchTemp & 0x03u;
    _rawBytes[kSKEDBOffset + 16] = _fields.batteryInfo;
    _rawBytes[kSKEDBOffset + 17] = _fields.sinkModes & 0x3Fu;
    _rawBytes[kSKEDBOffset + 18] = _fields.sprSinkMinimumPDP & 0x7Fu;
    _rawBytes[kSKEDBOffset + 19] = _fields.sprSinkOperationalPDP & 0x7Fu;
    _rawBytes[kSKEDBOffset + 20] = _fields.sprSinkMaximumPDP & 0x7Fu;
    _rawBytes[kSKEDBOffset + 21] = _fields.eprSinkMinimumPDP;
    _rawBytes[kSKEDBOffset + 22] = _fields.eprSinkOperationalPDP;
    _rawBytes[kSKEDBOffset + 23] = _fields.eprSinkMaximumPDP;

    return _rawBytes;
}

uint32_t SinkCapabilitiesExtended::numDataObjects() const {
    return 7;
}

uint32_t SinkCapabilitiesExtended::rawMessageType() const {
    return static_cast<uint32_t>(ExtendedMessageType::Sink_Capabilities_Extended);
}

void SinkCapabilitiesExtended::_writeLE16(
    std::array<uint8_t, 28>& bytes,
    size_t offset,
    uint16_t value) {
    bytes[offset] = static_cast<uint8_t>(value & 0xFF);
    bytes[offset + 1] = static_cast<uint8_t>((value >> 8) & 0xFF);
}

void SinkCapabilitiesExtended::_writeLE32(
    std::array<uint8_t, 28>& bytes,
    size_t offset,
    uint32_t value) {
    bytes[offset] = static_cast<uint8_t>(value & 0xFF);
    bytes[offset + 1] = static_cast<uint8_t>((value >> 8) & 0xFF);
    bytes[offset + 2] = static_cast<uint8_t>((value >> 16) & 0xFF);
    bytes[offset + 3] = static_cast<uint8_t>((value >> 24) & 0xFF);
}
