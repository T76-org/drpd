/**
 * @file pdo_augmented.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 */

#include "pdo_augmented.hpp"
#include <algorithm>
#include <cstdio>
#include <memory>


using namespace T76::DRPD::Proto;


// ============================================================================
// AugmentedPDO Base Class Implementation
// ============================================================================

AugmentedPDO::AugmentedPDO(uint32_t raw) : PDObject(raw) {
    if (!validateCommonFields()) {
        _messageInvalid = true;
    }
}

PDObject::PDOType AugmentedPDO::type() const {
    return PDOType::Augmented;
}

bool AugmentedPDO::validateCommonFields() {
    // Validate that bits 31:30 are 11 (Augmented type)
    uint32_t pdo_type = (_raw >> 30) & 0x3;
    if (pdo_type != 3) {
        return false;
    }

    // Validate that bits 29:28 are valid APDO type (00, 01, or 10)
    uint32_t apdo_type = (_raw >> 28) & 0x3;
    if (apdo_type > 2) {  // Only 00, 01, 10 are valid (0, 1, 2)
        return false;
    }

    return true;
}

AugmentedPDO::APDOType AugmentedPDO::getAPDOTypeField() const {
    uint32_t apdo_type = (_raw >> 28) & 0x3;
    return static_cast<APDOType>(apdo_type);
}


// ============================================================================
// SPR PPS APDO Implementation (bits 29:28 = 00)
// ============================================================================

SPRPPSAPDO::SPRPPSAPDO(uint32_t raw) : AugmentedPDO(raw) {
    // Reserved fields are specific to PPS encoding.
    // B27 is PPS Power Limited (not reserved). Only B26..25 are reserved.
    if (((_raw >> 25) & 0x3) != 0 || ((_raw >> 16) & 0x1) != 0 || ((_raw >> 7) & 0x1) != 0) {
        _messageInvalid = true;
    }

    // Additional validation specific to SPR PPS
    uint32_t max_voltage = (_raw >> 17) & 0xFF;
    uint32_t min_voltage = (_raw >> 8) & 0xFF;

    // Maximum Voltage must be >= Minimum Voltage
    if (max_voltage < min_voltage) {
        _messageInvalid = true;
    }
}

AugmentedPDO::APDOType SPRPPSAPDO::apdoType() const {
    return APDOType::SPR_PPS;
}

uint32_t SPRPPSAPDO::maxVoltageMillivolts() const {
    uint32_t voltage_units = (_raw >> 17) & 0xFF;
    return voltage_units * 100;  // Each unit is 100mV
}

uint32_t SPRPPSAPDO::minVoltageMillivolts() const {
    uint32_t voltage_units = (_raw >> 8) & 0xFF;
    return voltage_units * 100;  // Each unit is 100mV
}

uint32_t SPRPPSAPDO::maxCurrentMilliamps() const {
    uint32_t current_units = _raw & 0x7F;
    return current_units * 50;  // Each unit is 50mA
}

std::string SPRPPSAPDO::toString() const {
    char buffer[192];
    int written = std::snprintf(
        buffer,
        sizeof(buffer),
        "    SPR PPS APDO (raw: 0x%08X)\n"
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


// ============================================================================
// SPR AVS APDO Implementation (bits 29:28 = 10)
// ============================================================================

SPRAVSAPDO::SPRAVSAPDO(uint32_t raw) : AugmentedPDO(raw) {
    // B25..20 are reserved in SPR AVS.
    if (((_raw >> 20) & 0x3F) != 0) {
        _messageInvalid = true;
    }

    // B9..0 set to 0 means the 15-20V band is not supported.
    // B19..10 must still advertise non-zero current capability for 9-15V band.
    if (maxCurrent15VMilliamps() == 0) {
        _messageInvalid = true;
    }
}

AugmentedPDO::APDOType SPRAVSAPDO::apdoType() const {
    return APDOType::SPR_AVS;
}

uint32_t SPRAVSAPDO::peakCurrentCode() const {
    return (_raw >> 26) & 0x3;
}

uint32_t SPRAVSAPDO::maxCurrent15VMilliamps() const {
    uint32_t current_units = (_raw >> 10) & 0x3FF;
    return current_units * 10;  // Each unit is 10mA
}

uint32_t SPRAVSAPDO::maxCurrent20VMilliamps() const {
    uint32_t current_units = _raw & 0x3FF;
    return current_units * 10;  // Each unit is 10mA
}

uint32_t SPRAVSAPDO::minVoltageMillivolts() const {
    return 9000;
}

uint32_t SPRAVSAPDO::maxVoltageMillivolts() const {
    return maxCurrent20VMilliamps() > 0 ? 20000 : 15000;
}

uint32_t SPRAVSAPDO::maxPowerMilliwatts() const {
    const uint32_t power15vMw = static_cast<uint32_t>((15000ULL * maxCurrent15VMilliamps()) / 1000ULL);
    const uint32_t power20vMw = static_cast<uint32_t>((20000ULL * maxCurrent20VMilliamps()) / 1000ULL);
    return std::max(power15vMw, power20vMw);
}

std::string SPRAVSAPDO::toString() const {
    char buffer[192];
    int written = std::snprintf(
        buffer,
        sizeof(buffer),
        "    SPR AVS APDO (raw: 0x%08X)\n"
        "      peakCurrentCode: %u\n"
        "      maxCurrent15V: %umA\n"
        "      maxCurrent20V: %umA\n"
        "      voltageRange: %u-%umV\n"
        "      maxPower: %umW\n",
        _raw,
        peakCurrentCode(),
        maxCurrent15VMilliamps(),
        maxCurrent20VMilliamps(),
        minVoltageMillivolts(),
        maxVoltageMillivolts(),
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


// ============================================================================
// EPR AVS APDO Implementation (bits 29:28 = 01)
// ============================================================================

EPRAVSAPDO::EPRAVSAPDO(uint32_t raw) : AugmentedPDO(raw) {
    // Additional validation specific to EPR AVS
    // EPR AVS uses a 9-bit maximum voltage field.
    uint32_t max_voltage = (_raw >> 17) & 0x1FF;
    uint32_t min_voltage = (_raw >> 8) & 0xFF;

    // Bit 16 is reserved for EPR AVS and shall be zero.
    if (((_raw >> 16) & 0x1) != 0) {
        _messageInvalid = true;
    }

    // Zero voltage range is invalid for AVS operation.
    if (max_voltage == 0 || min_voltage == 0) {
        _messageInvalid = true;
    }

    // Maximum Voltage must be >= Minimum Voltage
    if (max_voltage < min_voltage) {
        _messageInvalid = true;
    }
}

AugmentedPDO::APDOType EPRAVSAPDO::apdoType() const {
    return APDOType::EPR_AVS;
}

uint32_t EPRAVSAPDO::maxVoltageMillivolts() const {
    uint32_t voltage_units = (_raw >> 17) & 0x1FF;
    return voltage_units * 100;  // Each unit is 100mV (EPR)
}

uint32_t EPRAVSAPDO::minVoltageMillivolts() const {
    uint32_t voltage_units = (_raw >> 8) & 0xFF;
    return voltage_units * 100;  // Each unit is 100mV (EPR)
}

uint32_t EPRAVSAPDO::maxPowerMilliwatts() const {
    uint32_t power_units = _raw & 0xFF;
    return power_units * 1000;  // Each unit is 1W
}

std::string EPRAVSAPDO::toString() const {
    char buffer[192];
    int written = std::snprintf(
        buffer,
        sizeof(buffer),
        "    EPR AVS APDO (raw: 0x%08X)\n"
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
