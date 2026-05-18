/**
 * @file manufacturer_info.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "manufacturer_info.hpp"

#include <algorithm>
#include <cstring>

#include "../pd_extended_header.hpp"
#include "../pd_message_types.hpp"

using namespace T76::DRPD::Proto;

ManufacturerInfo ManufacturerInfo::port(
    uint16_t vid,
    uint16_t pid,
    const char *manufacturer) {
    return ManufacturerInfo(vid, pid, manufacturer);
}

ManufacturerInfo ManufacturerInfo::unsupported() {
    return ManufacturerInfo(0xFFFF, 0, "Not Supported");
}

ManufacturerInfo::ManufacturerInfo(uint16_t vid, uint16_t pid, const char *manufacturer) :
    _vid(vid),
    _pid(pid) {
    const size_t sourceLength = manufacturer == nullptr ? 0 : std::strlen(manufacturer);
    const size_t length = std::min(sourceLength, MaxManufacturerStringChars);
    if (length > 0) {
        std::copy_n(manufacturer, length, _manufacturer.begin());
    }
    _manufacturer[length] = '\0';
}

std::span<const uint8_t> ManufacturerInfo::raw() const {
    _rawBytes.fill(0);

    PDExtendedHeader extHeader;
    extHeader.dataSizeBytes(static_cast<uint16_t>(_midbSize()));
    extHeader.requestChunk(false);
    // Sink policy advertises chunked-only extended-message support, so even
    // single-fragment responses use chunked framing with Chunk Number 0.
    extHeader.chunked(true);
    extHeader.chunkNumber(0);

    _rawBytes[0] = static_cast<uint8_t>(extHeader.raw() & 0xFF);
    _rawBytes[1] = static_cast<uint8_t>((extHeader.raw() >> 8) & 0xFF);

    constexpr size_t kMIDBOffset = 2;
    _writeLE16(_rawBytes, kMIDBOffset + 0, _vid);
    _writeLE16(_rawBytes, kMIDBOffset + 2, _pid);

    const size_t manufacturerBytes = _midbSize() - 4;
    for (size_t i = 0; i < manufacturerBytes; ++i) {
        _rawBytes[kMIDBOffset + 4 + i] = static_cast<uint8_t>(_manufacturer[i]);
    }

    return std::span<const uint8_t>(_rawBytes.data(), numDataObjects() * 4);
}

uint32_t ManufacturerInfo::numDataObjects() const {
    return static_cast<uint32_t>((2 + _midbSize() + 3) / 4);
}

uint32_t ManufacturerInfo::rawMessageType() const {
    return static_cast<uint32_t>(ExtendedMessageType::Manufacturer_Info);
}

size_t ManufacturerInfo::_midbSize() const {
    return 4 + std::strlen(_manufacturer.data()) + 1;
}

void ManufacturerInfo::_writeLE16(
    std::array<uint8_t, 28>& bytes,
    size_t offset,
    uint16_t value) {
    bytes[offset] = static_cast<uint8_t>(value & 0xFF);
    bytes[offset + 1] = static_cast<uint8_t>((value >> 8) & 0xFF);
}
