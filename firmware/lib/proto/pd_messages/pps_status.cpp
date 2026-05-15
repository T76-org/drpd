/**
 * @file pps_status.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "pps_status.hpp"

using namespace T76::DRPD::Proto;

PPSStatus::PPSStatus(std::span<const uint8_t> payload) {
    if (payload.size() != 4) {
        return;
    }

    _valid = true;
    _outputVoltage20mV = static_cast<uint16_t>(payload[0]) |
        (static_cast<uint16_t>(payload[1]) << 8);
    _outputCurrent50mA = payload[2];
    _realTimeFlags = payload[3];
}

bool PPSStatus::valid() const {
    return _valid;
}

bool PPSStatus::outputVoltageSupported() const {
    return _valid && _outputVoltage20mV != 0xFFFF;
}

uint32_t PPSStatus::outputVoltageMillivolts() const {
    return outputVoltageSupported()
        ? static_cast<uint32_t>(_outputVoltage20mV) * 20
        : 0;
}

bool PPSStatus::outputCurrentSupported() const {
    return _valid && _outputCurrent50mA != 0xFF;
}

uint32_t PPSStatus::outputCurrentMilliamps() const {
    return outputCurrentSupported()
        ? static_cast<uint32_t>(_outputCurrent50mA) * 50
        : 0;
}

PPSStatus::PresentTemperatureFlag PPSStatus::presentTemperatureFlag() const {
    return static_cast<PresentTemperatureFlag>((_realTimeFlags >> 1) & 0x03u);
}

bool PPSStatus::operatingModeCurrentLimit() const {
    return (_realTimeFlags & 0x08u) != 0;
}

uint8_t PPSStatus::realTimeFlags() const {
    return _realTimeFlags;
}
