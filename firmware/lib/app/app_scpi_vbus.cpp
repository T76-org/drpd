/**
 * @file app_scpi_vbus.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 * 
 */

#include "app.hpp"

#include "../phy/vbus_manager.hpp"


using namespace T76::DRPD;


void App::_queryVBusStatus(const std::vector<T76::SCPI::ParameterValue> &) {
    PHY::VBusState state = _vbusManager.state();
    std::string status;

    switch(state) {
        case PHY::VBusState::Enabled:
            status = "ENABLED";
            break;
        case PHY::VBusState::Disabled:
            status = "DISABLED";
            break;
        case PHY::VBusState::OverVoltage:
            status = "OVP";
            break;
        case PHY::VBusState::OverCurrent:
            status = "OCP";
            break;
        default:
            status = "UNKNOWN";
            break;
    }

    _usbInterface.sendUSBTMCBulkData(status);
}

void App::_resetVBus(const std::vector<T76::SCPI::ParameterValue> &) {
    _vbusManager.reset();
}

void App::_setVBusOVPThreshold(const std::vector<T76::SCPI::ParameterValue> &params) {
    float threshold = static_cast<float>(params[0].numberValue);

    // Ensure that the threshold is within valid range

    if (threshold < 0.0f) {
        _interpreter.addError(-222, "OVP threshold cannot be negative");
        return;
    } else if (threshold > 60.0f) {
        _interpreter.addError(-222, "OVP threshold exceeds maximum limit of 60V");
        return;
    }

    _vbusManager.ovpThreshold(threshold);
}

void App::_queryVBusOVPThreshold(const std::vector<T76::SCPI::ParameterValue> &) {
    float threshold = _vbusManager.ovpThreshold();
    _usbInterface.sendUSBTMCBulkData(std::to_string(threshold));
}

void App::_setVBusOCPThreshold(const std::vector<T76::SCPI::ParameterValue> &params) {
    float threshold = static_cast<float>(params[0].numberValue);

    // Ensure that the threshold is within valid range

    if (threshold < 0.0f) {
        _interpreter.addError(-222, "OCP threshold cannot be negative");
        return;
    } else if (threshold > 6.0f) {
        _interpreter.addError(-222, "OCP threshold exceeds maximum limit of 6A");
        return;
    }

    _vbusManager.ocpThreshold(threshold);
}

void App::_queryVBusOCPThreshold(const std::vector<T76::SCPI::ParameterValue> &) {
    float threshold = _vbusManager.ocpThreshold();
    _usbInterface.sendUSBTMCBulkData(std::to_string(threshold));
}

