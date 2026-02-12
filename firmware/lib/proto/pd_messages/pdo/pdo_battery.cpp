/**
 * @file pdo_battery.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 */

#include "pdo_battery.hpp"
#include <cstdio>


using namespace T76::DRPD::Proto;


BatterySupplyPDO::BatterySupplyPDO(uint32_t raw) : PDObject(raw) {
    // Validate that bits 31:30 are 01 (Battery Supply type)
    uint32_t pdo_type = (_raw >> 30) & 0x3;
    if (pdo_type != 1) {
        _messageInvalid = true;
    }

    uint32_t max_voltage = (_raw >> 20) & 0x3FF;
    uint32_t min_voltage = (_raw >> 10) & 0x3FF;

    // Maximum Voltage must be at least 5V (100 units of 50mV)
    if (max_voltage < 100) {
        _messageInvalid = true;
    }

    // Minimum Voltage must be at least 5V (100 units of 50mV)
    if (min_voltage < 100) {
        _messageInvalid = true;
    }

    // Maximum Voltage must be >= Minimum Voltage
    if (max_voltage < min_voltage) {
        _messageInvalid = true;
    }
}


PDObject::PDOType BatterySupplyPDO::type() const {
    return PDOType::BatterySupply;
}


uint32_t BatterySupplyPDO::maxVoltageMillivolts() const {
    uint32_t voltage_units = (_raw >> 20) & 0x3FF;
    return voltage_units * 50;  // Each unit is 50mV
}


uint32_t BatterySupplyPDO::minVoltageMillivolts() const {
    uint32_t voltage_units = (_raw >> 10) & 0x3FF;
    return voltage_units * 50;  // Each unit is 50mV
}


uint32_t BatterySupplyPDO::maxPowerMilliwatts() const {
    uint32_t power_units = _raw & 0x3FF;
    return power_units * 250;  // Each unit is 250mW
}


std::string BatterySupplyPDO::toString() const {
    char buffer[192];
    int written = std::snprintf(
        buffer,
        sizeof(buffer),
        "    BatterySupplyPDO (raw: 0x%08X)\n"
        "      maxVoltage: %umV\n"
        "      minVoltage: %umV\n"
        "      maxPower: %umW\n",
        _raw,
        maxVoltageMillivolts(),
        minVoltageMillivolts(),
        maxPowerMilliwatts()
    );

    if (written <= 0) {
        return {};
    }

    size_t count = static_cast<size_t>(written);
    if (count >= sizeof(buffer)) {
        count = sizeof(buffer) - 1;
    }
    return std::string(buffer, count);
}
