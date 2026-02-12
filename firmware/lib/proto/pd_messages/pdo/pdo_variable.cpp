/**
 * @file pdo_variable.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 */

#include "pdo_variable.hpp"
#include <cstdio>


using namespace T76::DRPD::Proto;


VariableSupplyPDO::VariableSupplyPDO(uint32_t raw) : PDObject(raw) {
    // Validate that bits 31:30 are 10 (Variable Supply type)
    uint32_t pdo_type = (_raw >> 30) & 0x3;
    if (pdo_type != 2) {
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


PDObject::PDOType VariableSupplyPDO::type() const {
    return PDOType::VariableSupply;
}


uint32_t VariableSupplyPDO::maxVoltageMillivolts() const {
    uint32_t voltage_units = (_raw >> 20) & 0x3FF;
    return voltage_units * 50;  // Each unit is 50mV
}


uint32_t VariableSupplyPDO::minVoltageMillivolts() const {
    uint32_t voltage_units = (_raw >> 10) & 0x3FF;
    return voltage_units * 50;  // Each unit is 50mV
}


uint32_t VariableSupplyPDO::maxCurrentMilliamps() const {
    uint32_t current_units = _raw & 0x3FF;
    return current_units * 10;  // Each unit is 10mA
}


std::string VariableSupplyPDO::toString() const {
    char buffer[192];
    int written = std::snprintf(
        buffer,
        sizeof(buffer),
        "    VariableSupplyPDO (raw: 0x%08X)\n"
        "      maxVoltage: %umV\n"
        "      minVoltage: %umV\n"
        "      maxCurrent: %umA\n",
        _raw,
        maxVoltageMillivolts(),
        minVoltageMillivolts(),
        maxCurrentMilliamps()
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
