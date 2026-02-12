/**
 * @file pdo_fixed.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 */

#include "pdo_fixed.hpp"
#include <cstdio>


using namespace T76::DRPD::Proto;


FixedSupplyPDO::FixedSupplyPDO(uint32_t raw) : PDObject(raw) {
    // Validate that bits 31:30 are 00 (Fixed Supply type)
    uint32_t pdo_type = (_raw >> 30) & 0x3;
    if (pdo_type != 0) {
        _messageInvalid = true;
    }

    // Validate that reserved bit (22) is 0
    if ((_raw >> 22) & 0x1) {
        _messageInvalid = true;
    }

    // Voltage must be at least 5V (100 units of 50mV)
    uint32_t voltage_units = (_raw >> 10) & 0x3FF;
    if (voltage_units < 100) {  // Less than 5V
        _messageInvalid = true;
    }
}


PDObject::PDOType FixedSupplyPDO::type() const {
    return PDOType::FixedSupply;
}


uint32_t FixedSupplyPDO::voltageMillivolts() const {
    uint32_t voltage_units = (_raw >> 10) & 0x3FF;
    return voltage_units * 50;  // Each unit is 50mV
}


uint32_t FixedSupplyPDO::maxCurrentMilliamps() const {
    uint32_t current_units = _raw & 0x3FF;
    return current_units * 10;  // Each unit is 10mA
}


FixedSupplyPDO::PeakCurrentCapability FixedSupplyPDO::peakCurrentCapability() const {
    uint32_t peak = (_raw >> 20) & 0x3;
    return static_cast<PeakCurrentCapability>(peak);
}


bool FixedSupplyPDO::dualRolePower() const {
    return ((_raw >> 29) & 0x1) != 0;
}


bool FixedSupplyPDO::usbSuspendSupported() const {
    return ((_raw >> 28) & 0x1) != 0;
}


bool FixedSupplyPDO::unconstrainedPower() const {
    return ((_raw >> 27) & 0x1) != 0;
}


bool FixedSupplyPDO::usbCommunicationsCapable() const {
    return ((_raw >> 26) & 0x1) != 0;
}


bool FixedSupplyPDO::dualRoleData() const {
    return ((_raw >> 25) & 0x1) != 0;
}


bool FixedSupplyPDO::unchunkedExtendedMessageSupported() const {
    return ((_raw >> 24) & 0x1) != 0;
}


bool FixedSupplyPDO::eprModeCapable() const {
    return ((_raw >> 23) & 0x1) != 0;
}


std::string FixedSupplyPDO::toString() const {
    char buffer[256];
    int written = std::snprintf(
        buffer,
        sizeof(buffer),
        "    FixedSupplyPDO (raw: 0x%08X)\n"
        "      voltage: %umV\n"
        "      maxCurrent: %umA\n"
        "      peakCurrent: %d\n"
        "      dualRolePower: %s\n"
        "      usbSuspend: %s\n"
        "      unconstrained: %s\n"
        "      usbComm: %s\n"
        "      dualRoleData: %s\n"
        "      unchunkedExt: %s\n"
        "      eprMode: %s\n",
        _raw,
        voltageMillivolts(),
        maxCurrentMilliamps(),
        static_cast<int>(peakCurrentCapability()),
        dualRolePower() ? "yes" : "no",
        usbSuspendSupported() ? "yes" : "no",
        unconstrainedPower() ? "yes" : "no",
        usbCommunicationsCapable() ? "yes" : "no",
        dualRoleData() ? "yes" : "no",
        unchunkedExtendedMessageSupported() ? "yes" : "no",
        eprModeCapable() ? "yes" : "no"
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
