/**
 * @file request.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 */

#include "request.hpp"

#include <cstdio>

#include "../pd_message_types.hpp"


using namespace T76::DRPD::Proto;

// --- Request ---

Request::Request(uint32_t raw) : _raw(raw) {}

std::span<const uint8_t> Request::raw() const {
    std::copy(
        reinterpret_cast<const uint8_t*>(&_raw),
        reinterpret_cast<const uint8_t*>(&_raw) + sizeof(uint32_t),
        _rawBytes.data()
    );

    return _rawBytes;
}

uint32_t Request::numDataObjects() const {
    return 1;
}

uint32_t Request::rawMessageType() const {
    return static_cast<uint32_t>(DataMessageType::Request);
}

uint8_t Request::objectPosition() const {
    return (_raw >> 28) & 0xF;
}

void Request::objectPosition(uint8_t position) {
    _raw = (_raw & ~(0xFu << 28)) | ((position & 0xFu) << 28);
}

bool Request::giveBackFlag() const {
    return ((_raw >> 27) & 0x1) != 0;
}

void Request::giveBackFlag(bool value) {
    if (value) {
        _raw |= (1u << 27);
    } else {
        _raw &= ~(1u << 27);
    }
}

bool Request::capabilityMismatch() const {
    return ((_raw >> 26) & 0x1) != 0;
}

void Request::capabilityMismatch(bool value) {
    if (value) {
        _raw |= (1u << 26);
    } else {
        _raw &= ~(1u << 26);
    }
}

bool Request::usbCommunicationsCapable() const {
    return ((_raw >> 25) & 0x1) != 0;
}

void Request::usbCommunicationsCapable(bool value) {
    if (value) {
        _raw |= (1u << 25);
    } else {
        _raw &= ~(1u << 25);
    }
}

bool Request::noUsbSuspend() const {
    return ((_raw >> 24) & 0x1) != 0;
}

void Request::noUsbSuspend(bool value) {
    if (value) {
        _raw |= (1u << 24);
    } else {
        _raw &= ~(1u << 24);
    }
}

bool Request::unchunkedExtendedMessageSupported() const {
    return ((_raw >> 23) & 0x1) != 0;
}

void Request::unchunkedExtendedMessageSupported(bool value) {
    if (value) {
        _raw |= (1u << 23);
    } else {
        _raw &= ~(1u << 23);
    }
}

bool Request::eprModeCapable() const {
    return ((_raw >> 22) & 0x1) != 0;
}

void Request::eprModeCapable(bool value) {
    if (value) {
        _raw |= (1u << 22);
    } else {
        _raw &= ~(1u << 22);
    }
}

std::string Request::toString() const {
    char buffer[256];
    int written = std::snprintf(
        buffer,
        sizeof(buffer),
        "Request (raw: 0x%08X)\n"
        "  ObjPos: %d\n"
        "  GiveBack: %s\n"
        "  Mismatch: %s\n"
        "  USBComm: %s\n"
        "  NoSuspend: %s\n"
        "  EPRMode: %s\n",
        _raw,
        static_cast<int>(objectPosition()),
        giveBackFlag() ? "yes" : "no",
        capabilityMismatch() ? "yes" : "no",
        usbCommunicationsCapable() ? "yes" : "no",
        noUsbSuspend() ? "yes" : "no",
        eprModeCapable() ? "yes" : "no"
    );

    std::string out;
    if (written > 0) {
        size_t count = static_cast<size_t>(written);
        if (count >= sizeof(buffer)) {
            count = sizeof(buffer) - 1;
        }
        out.append(buffer, count);
    }

    return out;
}

// --- FixedVariableRequest ---

FixedVariableRequest::FixedVariableRequest(uint32_t raw) : Request(raw) {}

uint32_t FixedVariableRequest::operatingCurrentMilliamps() const {
    uint32_t units = (_raw >> 10) & 0x3FF;
    return units * 10; // 10mA units
}

void FixedVariableRequest::operatingCurrentMilliamps(uint32_t milliamps) {
    uint32_t units = milliamps / 10;
    _raw = (_raw & ~(0x3FFu << 10)) | ((units & 0x3FFu) << 10);
}

uint32_t FixedVariableRequest::maxOperatingCurrentMilliamps() const {
    uint32_t units = _raw & 0x3FF;
    return units * 10; // 10mA units
}

void FixedVariableRequest::maxOperatingCurrentMilliamps(uint32_t milliamps) {
    uint32_t units = milliamps / 10;
    _raw = (_raw & ~0x3FFu) | (units & 0x3FFu);
}

uint32_t FixedVariableRequest::minOperatingCurrentMilliamps() const {
    uint32_t units = _raw & 0x3FF;
    return units * 10; // 10mA units
}

void FixedVariableRequest::minOperatingCurrentMilliamps(uint32_t milliamps) {
    uint32_t units = milliamps / 10;
    _raw = (_raw & ~0x3FFu) | (units & 0x3FFu);
}

std::string FixedVariableRequest::toString() const {
    char buffer[256];
    int written = std::snprintf(
        buffer,
        sizeof(buffer),
        "Fixed/Variable Request (raw: 0x%08X)\n"
        "  ObjPos: %d\n"
        "  GiveBack: %s\n"
        "  Mismatch: %s\n"
        "  USBComm: %s\n"
        "  NoSuspend: %s\n"
        "  OpCurrent: %umA\n",
        _raw,
        static_cast<int>(objectPosition()),
        giveBackFlag() ? "yes" : "no",
        capabilityMismatch() ? "yes" : "no",
        usbCommunicationsCapable() ? "yes" : "no",
        noUsbSuspend() ? "yes" : "no",
        operatingCurrentMilliamps()
    );

    std::string out;
    if (written > 0) {
        size_t count = static_cast<size_t>(written);
        if (count >= sizeof(buffer)) {
            count = sizeof(buffer) - 1;
        }
        out.append(buffer, count);
    }

    if (giveBackFlag()) {
        written = std::snprintf(buffer, sizeof(buffer), "  MinCurrent: %umA\n", minOperatingCurrentMilliamps());
    } else {
        written = std::snprintf(buffer, sizeof(buffer), "  MaxCurrent: %umA\n", maxOperatingCurrentMilliamps());
    }

    if (written > 0) {
        size_t count = static_cast<size_t>(written);
        if (count >= sizeof(buffer)) {
            count = sizeof(buffer) - 1;
        }
        out.append(buffer, count);
    }

    return out;
}


// --- BatteryRequest ---

BatteryRequest::BatteryRequest(uint32_t raw) : Request(raw) {}

uint32_t BatteryRequest::operatingPowerMilliwatts() const {
    uint32_t units = (_raw >> 10) & 0x3FF;
    return units * 250; // 250mW units
}

void BatteryRequest::operatingPowerMilliwatts(uint32_t milliwatts) {
    uint32_t units = milliwatts / 250;
    _raw = (_raw & ~(0x3FFu << 10)) | ((units & 0x3FFu) << 10);
}

uint32_t BatteryRequest::maxOperatingPowerMilliwatts() const {
    uint32_t units = _raw & 0x3FF;
    return units * 250; // 250mW units
}

void BatteryRequest::maxOperatingPowerMilliwatts(uint32_t milliwatts) {
    uint32_t units = milliwatts / 250;
    _raw = (_raw & ~0x3FFu) | (units & 0x3FFu);
}

uint32_t BatteryRequest::minOperatingPowerMilliwatts() const {
    uint32_t units = _raw & 0x3FF;
    return units * 250; // 250mW units
}

void BatteryRequest::minOperatingPowerMilliwatts(uint32_t milliwatts) {
    uint32_t units = milliwatts / 250;
    _raw = (_raw & ~0x3FFu) | (units & 0x3FFu);
}

std::string BatteryRequest::toString() const {
    char buffer[256];
    int written = std::snprintf(
        buffer,
        sizeof(buffer),
        "Battery Request (raw: 0x%08X)\n"
        "  ObjPos: %d\n"
        "  GiveBack: %s\n"
        "  Mismatch: %s\n"
        "  USBComm: %s\n"
        "  NoSuspend: %s\n"
        "  OpPower: %umW\n",
        _raw,
        static_cast<int>(objectPosition()),
        giveBackFlag() ? "yes" : "no",
        capabilityMismatch() ? "yes" : "no",
        usbCommunicationsCapable() ? "yes" : "no",
        noUsbSuspend() ? "yes" : "no",
        operatingPowerMilliwatts()
    );

    std::string out;
    if (written > 0) {
        size_t count = static_cast<size_t>(written);
        if (count >= sizeof(buffer)) {
            count = sizeof(buffer) - 1;
        }
        out.append(buffer, count);
    }

    if (giveBackFlag()) {
        written = std::snprintf(buffer, sizeof(buffer), "  MinPower: %umW\n", minOperatingPowerMilliwatts());
    } else {
        written = std::snprintf(buffer, sizeof(buffer), "  MaxPower: %umW\n", maxOperatingPowerMilliwatts());
    }

    if (written > 0) {
        size_t count = static_cast<size_t>(written);
        if (count >= sizeof(buffer)) {
            count = sizeof(buffer) - 1;
        }
        out.append(buffer, count);
    }

    return out;
}


// --- Augmented Requests ---

AugmentedRequestBase::AugmentedRequestBase(uint32_t raw) : Request(raw) {}

bool AugmentedRequestBase::eprModeCapable() const {
    return ((_raw >> 22) & 0x1) != 0;
}

void AugmentedRequestBase::eprModeCapable(bool value) {
    if (value) {
        _raw |= (1u << 22);
    } else {
        _raw &= ~(1u << 22);
    }
}

std::string AugmentedRequestBase::toString() const {
    char buffer[256];
    int written = std::snprintf(
        buffer,
        sizeof(buffer),
        "%s (raw: 0x%08X)\n"
        "  ObjPos: %d\n"
        "  Mismatch: %s\n"
        "  USBComm: %s\n"
        "  NoSuspend: %s\n"
        "  EPRMode: %s\n"
        "  OutputVoltage: %umV\n"
        "  OpCurrent: %umA\n",
        label(),
        _raw,
        static_cast<int>(objectPosition()),
        capabilityMismatch() ? "yes" : "no",
        usbCommunicationsCapable() ? "yes" : "no",
        noUsbSuspend() ? "yes" : "no",
        eprModeCapable() ? "yes" : "no",
        outputVoltageMillivolts(),
        operatingCurrentMilliamps()
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

// --- AugmentedPPSRequest ---

AugmentedPPSRequest::AugmentedPPSRequest(uint32_t raw) : AugmentedRequestBase(raw) {}

uint32_t AugmentedPPSRequest::outputVoltageMillivolts() const {
    uint32_t units = (_raw >> 9) & 0xFFF;
    return units * 20; // 20mV units
}

void AugmentedPPSRequest::outputVoltageMillivolts(uint32_t millivolts) {
    uint32_t units = millivolts / 20;
    _raw = (_raw & ~(0xFFFu << 9)) | ((units & 0xFFFu) << 9);
}

uint32_t AugmentedPPSRequest::operatingCurrentMilliamps() const {
    uint32_t units = _raw & 0x7F;
    return units * 50; // 50mA units
}

void AugmentedPPSRequest::operatingCurrentMilliamps(uint32_t milliamps) {
    uint32_t units = milliamps / 50;
    _raw = (_raw & ~0x7Fu) | (units & 0x7Fu);
}

const char* AugmentedPPSRequest::label() const {
    return "Augmented PPS Request";
}

// --- AugmentedAVSRequest ---

AugmentedAVSRequest::AugmentedAVSRequest(uint32_t raw) : AugmentedRequestBase(raw) {}

uint32_t AugmentedAVSRequest::outputVoltageMillivolts() const {
    uint32_t units = (_raw >> 9) & 0xFFF;
    return units * 25; // 25mV units; valid requests use 100mV effective step
}

void AugmentedAVSRequest::outputVoltageMillivolts(uint32_t millivolts) {
    // AVS RDO encodes voltage in 25mV units, with the least-significant two bits reserved.
    uint32_t units = (millivolts / 25) & ~0x3u;
    _raw = (_raw & ~(0xFFFu << 9)) | ((units & 0xFFFu) << 9);
}

uint32_t AugmentedAVSRequest::operatingCurrentMilliamps() const {
    uint32_t units = _raw & 0x7F;
    return units * 50; // 50mA units
}

void AugmentedAVSRequest::operatingCurrentMilliamps(uint32_t milliamps) {
    uint32_t units = milliamps / 50;
    _raw = (_raw & ~0x7Fu) | (units & 0x7Fu);
}

const char* AugmentedAVSRequest::label() const {
    return "Augmented AVS Request";
}

// --- EPRRequest ---

EPRRequest::EPRRequest(uint32_t requestRaw, uint32_t sourcePdoRaw) :
    Request(requestRaw),
    _sourcePdoRaw(sourcePdoRaw) {}

std::span<const uint8_t> EPRRequest::raw() const {
    std::copy(
        reinterpret_cast<const uint8_t*>(&_raw),
        reinterpret_cast<const uint8_t*>(&_raw) + sizeof(uint32_t),
        _eprRawBytes.data()
    );

    std::copy(
        reinterpret_cast<const uint8_t*>(&_sourcePdoRaw),
        reinterpret_cast<const uint8_t*>(&_sourcePdoRaw) + sizeof(uint32_t),
        _eprRawBytes.data() + sizeof(uint32_t)
    );

    return _eprRawBytes;
}

uint32_t EPRRequest::numDataObjects() const {
    return 2;
}

uint32_t EPRRequest::rawMessageType() const {
    return static_cast<uint32_t>(DataMessageType::EPR_Request);
}

uint32_t EPRRequest::sourcePdoRaw() const {
    return _sourcePdoRaw;
}

void EPRRequest::sourcePdoRaw(uint32_t raw) {
    _sourcePdoRaw = raw;
}

std::string EPRRequest::toString() const {
    char buffer[320];
    int written = std::snprintf(
        buffer,
        sizeof(buffer),
        "EPR Request\n"
        "  RDO Raw: 0x%08X\n"
        "  Source PDO Copy Raw: 0x%08X\n"
        "  ObjPos: %d\n"
        "  Mismatch: %s\n"
        "  USBComm: %s\n"
        "  NoSuspend: %s\n"
        "  EPRMode: %s\n",
        _raw,
        _sourcePdoRaw,
        static_cast<int>(objectPosition()),
        capabilityMismatch() ? "yes" : "no",
        usbCommunicationsCapable() ? "yes" : "no",
        noUsbSuspend() ? "yes" : "no",
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
