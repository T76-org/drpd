/**
 * @file app_scpi_vbus.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 * 
 */

#include "app.hpp"

#include <cmath>

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

    const uint64_t ovpTimestampUs = _vbusManager.lastOvpEventTimestampUs();
    const uint64_t ocpTimestampUs = _vbusManager.lastOcpEventTimestampUs();
    const std::string ovpField = ovpTimestampUs == 0 ? "NONE" : std::to_string(ovpTimestampUs);
    const std::string ocpField = ocpTimestampUs == 0 ? "NONE" : std::to_string(ocpTimestampUs);

    _sendTransportTextResponse(status + "," + ovpField + "," + ocpField);
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
    _savePersistentConfig();
}

void App::_queryVBusOVPThreshold(const std::vector<T76::SCPI::ParameterValue> &) {
    float threshold = _vbusManager.ovpThreshold();
    _sendTransportTextResponse(std::to_string(threshold));
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
    _savePersistentConfig();
}

void App::_queryVBusOCPThreshold(const std::vector<T76::SCPI::ParameterValue> &) {
    float threshold = _vbusManager.ocpThreshold();
    _sendTransportTextResponse(std::to_string(threshold));
}

void App::_setVBusCalibrationPoint(const std::vector<T76::SCPI::ParameterValue> &params) {
    if (params.empty()) {
        _interpreter.addError(-222, "Calibration bucket is required");
        return;
    }

    double bucketValue = params[0].numberValue;
    if (std::trunc(bucketValue) != bucketValue) {
        _interpreter.addError(-222, "Calibration bucket must be an integer from 0 to 60");
        return;
    }

    if (bucketValue < 0.0 || bucketValue > 60.0) {
        _interpreter.addError(-222, "Calibration bucket must be in the range 0 to 60");
        return;
    }

    size_t bucket = static_cast<size_t>(bucketValue);
    float measuredVBus = _analogMonitor.vBusVoltage();
    float correctionVolts = static_cast<float>(bucket) - measuredVBus;

    _analogMonitor.vBusVoltageCorrectionByRawVolt(bucket, correctionVolts);
    _savePersistentConfig();
}

void App::_queryVBusCalibration(const std::vector<T76::SCPI::ParameterValue> &) {
    const auto &corrections = _analogMonitor.vBusVoltageCorrectionByRawVolt();
    std::string response;

    for (size_t index = 0; index < corrections.size(); ++index) {
        response += _formatAnalogValue(corrections[index]);
        if (index < corrections.size() - 1) {
            response += ",";
        }
    }

    _sendTransportTextResponse(response);
}

void App::_resetVBusCalibration(const std::vector<T76::SCPI::ParameterValue> &) {
    _analogMonitor.applyPersistentConfig(T76::DRPD::AnalogMonitorPersistentConfig{
        .vbusVoltageCorrectionByRawVolt = PHY::AnalogMonitor::defaultVBusVoltageCorrection(),
    });
    _savePersistentConfig();
}
