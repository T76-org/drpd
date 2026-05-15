/**
 * @file sink_capabilities.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "sink_capabilities.hpp"

#include <algorithm>

#include "../pd_message_types.hpp"

using namespace T76::DRPD::Proto;

SinkCapabilities SinkCapabilities::fixedSupply(
    uint32_t voltageMillivolts,
    uint32_t operationalCurrentMilliamps) {
    return SinkCapabilities(_fixedSupplyPDO(voltageMillivolts, operationalCurrentMilliamps));
}

SinkCapabilities::SinkCapabilities(uint32_t rawPDO) :
    _rawPDOs({rawPDO}),
    _pdoCount(1),
    _messageInvalid(false) {}

SinkCapabilities::SinkCapabilities(std::span<const uint32_t> rawPDOs) :
    _pdoCount(std::min<size_t>(rawPDOs.size(), _rawPDOs.size())),
    _messageInvalid(rawPDOs.empty() || rawPDOs.size() > _rawPDOs.size()) {
    for (size_t i = 0; i < _pdoCount; ++i) {
        _rawPDOs[i] = rawPDOs[i];
    }
}

std::span<const uint8_t> SinkCapabilities::raw() const {
    for (size_t i = 0; i < _pdoCount; ++i) {
        const uint32_t rawPDO = _rawPDOs[i];
        _rawBytes[(i * 4) + 0] = static_cast<uint8_t>(rawPDO & 0xFF);
        _rawBytes[(i * 4) + 1] = static_cast<uint8_t>((rawPDO >> 8) & 0xFF);
        _rawBytes[(i * 4) + 2] = static_cast<uint8_t>((rawPDO >> 16) & 0xFF);
        _rawBytes[(i * 4) + 3] = static_cast<uint8_t>((rawPDO >> 24) & 0xFF);
    }

    return std::span<const uint8_t>(_rawBytes.data(), _pdoCount * 4);
}

uint32_t SinkCapabilities::numDataObjects() const {
    return _pdoCount;
}

uint32_t SinkCapabilities::rawMessageType() const {
    return static_cast<uint32_t>(DataMessageType::Sink_Capabilities);
}

bool SinkCapabilities::isMessageInvalid() const {
    return _messageInvalid;
}

uint32_t SinkCapabilities::_fixedSupplyPDO(
    uint32_t voltageMillivolts,
    uint32_t operationalCurrentMilliamps) {
    const uint32_t voltage50mV = voltageMillivolts / 50;
    const uint32_t current10mA = operationalCurrentMilliamps / 10;

    return ((voltage50mV & 0x3FFu) << 10) |
        (current10mA & 0x3FFu);
}
