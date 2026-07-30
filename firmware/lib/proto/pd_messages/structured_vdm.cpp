/**
 * @file structured_vdm.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "structured_vdm.hpp"

#include "../pd_message_types.hpp"

using namespace T76::DRPD::Proto;

StructuredVDM::StructuredVDM(uint32_t rawHeader) :
    _rawHeader(rawHeader),
    _raw{
        static_cast<uint8_t>(rawHeader & 0xFF),
        static_cast<uint8_t>((rawHeader >> 8) & 0xFF),
        static_cast<uint8_t>((rawHeader >> 16) & 0xFF),
        static_cast<uint8_t>((rawHeader >> 24) & 0xFF),
    } {}

std::optional<StructuredVDM> StructuredVDM::decode(std::span<const uint8_t> body) {
    if (body.size() < 4) {
        return std::nullopt;
    }

    const uint32_t rawHeader = static_cast<uint32_t>(body[0]) |
        (static_cast<uint32_t>(body[1]) << 8) |
        (static_cast<uint32_t>(body[2]) << 16) |
        (static_cast<uint32_t>(body[3]) << 24);
    return StructuredVDM(rawHeader);
}

StructuredVDM StructuredVDM::discoverIdentityNak(const StructuredVDM& request) {
    constexpr uint32_t versionMask = 0x00007800;
    constexpr uint32_t structuredBit = 0x00008000;
    constexpr uint32_t nakCommandType = 0x00000080;
    constexpr uint32_t discoverIdentity = 0x00000001;
    const uint32_t response = (static_cast<uint32_t>(PDSID) << 16) |
        structuredBit |
        (request.rawHeader() & versionMask) |
        nakCommandType |
        discoverIdentity;
    return StructuredVDM(response);
}

uint16_t StructuredVDM::svid() const { return static_cast<uint16_t>(_rawHeader >> 16); }
bool StructuredVDM::structured() const { return (_rawHeader & 0x00008000) != 0; }
uint8_t StructuredVDM::versionMajor() const { return static_cast<uint8_t>((_rawHeader >> 13) & 0x03); }
uint8_t StructuredVDM::versionMinor() const { return static_cast<uint8_t>((_rawHeader >> 11) & 0x03); }
uint8_t StructuredVDM::objectPosition() const { return static_cast<uint8_t>((_rawHeader >> 8) & 0x07); }
StructuredVDM::CommandType StructuredVDM::commandType() const {
    return static_cast<CommandType>((_rawHeader >> 6) & 0x03);
}
uint8_t StructuredVDM::command() const { return static_cast<uint8_t>(_rawHeader & 0x1F); }
bool StructuredVDM::reservedBitSet() const { return (_rawHeader & 0x20) != 0; }

bool StructuredVDM::isDiscoverIdentityRequest() const {
    return structured() &&
        svid() == PDSID &&
        commandType() == CommandType::Request &&
        command() == static_cast<uint8_t>(Command::DiscoverIdentity) &&
        objectPosition() == 0 &&
        !reservedBitSet() &&
        versionMajor() <= 1 &&
        (versionMajor() != 0 || versionMinor() == 0) &&
        (versionMajor() != 1 || versionMinor() <= 1);
}

uint32_t StructuredVDM::rawHeader() const { return _rawHeader; }
std::span<const uint8_t> StructuredVDM::raw() const { return _raw; }
uint32_t StructuredVDM::numDataObjects() const { return 1; }
uint32_t StructuredVDM::rawMessageType() const {
    return static_cast<uint32_t>(DataMessageType::Vendor_Defined);
}
