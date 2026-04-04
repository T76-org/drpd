/**
 * @file app_scpi_analog_monitor.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "app.hpp"

#include <cmath>
#include <cstdio>

using namespace T76::DRPD;

std::string App::_formatAnalogValue(float value) {
    float truncatedValue = std::trunc(value * 100.0f) / 100.0f;
    char buffer[20];
    int written = std::snprintf(
        buffer, sizeof(buffer), "%.2f", static_cast<double>(truncatedValue));
    if (written < 0) {
        return "0.00";
    }
    if (written >= static_cast<int>(sizeof(buffer))) {
        return std::string(buffer, sizeof(buffer) - 1);
    }
    return std::string(buffer);
}

void App::_measureAllAnalogValues(const std::vector<T76::SCPI::ParameterValue> &) {
    PHY::AnalogMonitorReadings readings = _analogMonitor.allReadings();
    uint64_t accumulationElapsedTimeUs = 0;

    if (readings.accumulationStartTimestampUs != 0 &&
        readings.lastAccumulationTimestampUs >= readings.accumulationStartTimestampUs) {
        accumulationElapsedTimeUs =
            readings.lastAccumulationTimestampUs - readings.accumulationStartTimestampUs;
    }

    std::string response = 
        std::to_string(readings.captureTimestampUs) + "," +
        _formatAnalogValue(_analogMonitor.vBusVoltage()) + "," +
        _formatAnalogValue(_analogMonitor.vBusCurrent()) + "," +
        _formatAnalogValue(readings.dutCC1Voltage) + "," +
        _formatAnalogValue(readings.dutCC2Voltage) + "," +
        _formatAnalogValue(readings.usdsCC1Voltage) + "," +
        _formatAnalogValue(readings.usdsCC2Voltage) + "," +
        _formatAnalogValue(readings.adcVRefVoltage) + "," +
        _formatAnalogValue(readings.groundRefVoltage) + "," +
        _formatAnalogValue(readings.currentRefVoltage) + "," +
        std::to_string(accumulationElapsedTimeUs) + "," +
        std::to_string(readings.accumulatedChargeMah) + "," +
        std::to_string(readings.accumulatedEnergyMwh);

    _sendTransportTextResponse(response);
}

void App::_measureVBusVoltage(const std::vector<T76::SCPI::ParameterValue> &) {
    _sendTransportTextResponse(_formatAnalogValue(_analogMonitor.vBusVoltage()));
}

void App::_measureVBusCurrent(const std::vector<T76::SCPI::ParameterValue> &) {
    _sendTransportTextResponse(_formatAnalogValue(_analogMonitor.vBusCurrent()));
}

void App::_measureDUTCC1Voltage(const std::vector<T76::SCPI::ParameterValue> &) {
    _sendTransportTextResponse(_formatAnalogValue(_analogMonitor.dutCC1Voltage()));
}

void App::_measureDUTCC2Voltage(const std::vector<T76::SCPI::ParameterValue> &) {
    _sendTransportTextResponse(_formatAnalogValue(_analogMonitor.dutCC2Voltage()));
}

void App::_measureUSDSCC1Voltage(const std::vector<T76::SCPI::ParameterValue> &) {
    _sendTransportTextResponse(_formatAnalogValue(_analogMonitor.usdsCC1Voltage()));
}

void App::_measureUSDSCC2Voltage(const std::vector<T76::SCPI::ParameterValue> &) {
    _sendTransportTextResponse(_formatAnalogValue(_analogMonitor.usdsCC2Voltage()));
}

void App::_measureADCRefVoltage(const std::vector<T76::SCPI::ParameterValue> &) {
    _sendTransportTextResponse(_formatAnalogValue(_analogMonitor.adcVRefVoltage()));
}

void App::_measureCurrentRefVoltage(const std::vector<T76::SCPI::ParameterValue> &) {
    _sendTransportTextResponse(_formatAnalogValue(_analogMonitor.currentRefVoltage()));
}

void App::_measureGroundRefVoltage(const std::vector<T76::SCPI::ParameterValue> &) {
    _sendTransportTextResponse(_formatAnalogValue(_analogMonitor.groundRefVoltage()));
}

void App::_measureAccumulatedValues(const std::vector<T76::SCPI::ParameterValue> &) {
    std::string response =
        std::to_string(_analogMonitor.accumulationElapsedTimeUs()) + "," +
        std::to_string(_analogMonitor.accumulatedChargeMah()) + "," +
        std::to_string(_analogMonitor.accumulatedEnergyMwh());

    _sendTransportTextResponse(response);
}

void App::_resetAccumulatedValues(const std::vector<T76::SCPI::ParameterValue> &) {
    _analogMonitor.resetAccumulatedMeasurements();
}
