/**
 * @file revision.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "revision.hpp"

#include "../pd_message_types.hpp"

using namespace T76::DRPD::Proto;

Revision Revision::revision3p2Version1p1() {
    return Revision(3, 2, 1, 1);
}

Revision::Revision(
    uint8_t revisionMajor,
    uint8_t revisionMinor,
    uint8_t versionMajor,
    uint8_t versionMinor) :
    _raw(((static_cast<uint32_t>(revisionMajor) & 0x0Fu) << 28) |
         ((static_cast<uint32_t>(revisionMinor) & 0x0Fu) << 24) |
         ((static_cast<uint32_t>(versionMajor) & 0x0Fu) << 20) |
         ((static_cast<uint32_t>(versionMinor) & 0x0Fu) << 16)) {}

std::span<const uint8_t> Revision::raw() const {
    _rawBytes[0] = static_cast<uint8_t>(_raw & 0xFF);
    _rawBytes[1] = static_cast<uint8_t>((_raw >> 8) & 0xFF);
    _rawBytes[2] = static_cast<uint8_t>((_raw >> 16) & 0xFF);
    _rawBytes[3] = static_cast<uint8_t>((_raw >> 24) & 0xFF);

    return _rawBytes;
}

uint32_t Revision::numDataObjects() const {
    return 1;
}

uint32_t Revision::rawMessageType() const {
    return static_cast<uint32_t>(DataMessageType::Revision);
}
