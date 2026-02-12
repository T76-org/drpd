/**
 * @file app_scpi_analog_monitor.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "app.hpp"

#include <cstdio>

using namespace T76::DRPD;

namespace {
    std::string formatAnalogValue(float value) {
        char buffer[20];
        int written = std::snprintf(buffer, sizeof(buffer), "%.3f", static_cast<double>(value));
        if (written < 0) {
            return "0.00";
        }
        if (written >= static_cast<int>(sizeof(buffer))) {
            return std::string(buffer, sizeof(buffer) - 1);
        }
        return std::string(buffer);
    }
}

void App::_measureAllAnalogValues(const std::vector<T76::SCPI::ParameterValue> &) {
    PHY::AnalogMonitorReadings readings = _analogMonitor.allReadings();

    std::string response = 
        std::to_string(readings.captureTimestampUs) + "," +
        formatAnalogValue(readings.vBusVoltageAverager.average()) + "," +
        formatAnalogValue(readings.vBusCurrentAverager.average()) + "," +
        formatAnalogValue(readings.dutCC1Voltage) + "," +
        formatAnalogValue(readings.dutCC2Voltage) + "," +
        formatAnalogValue(readings.usdsCC1Voltage) + "," +
        formatAnalogValue(readings.usdsCC2Voltage) + "," +
        formatAnalogValue(readings.adcVRefVoltage) + "," +
        formatAnalogValue(readings.groundRefVoltage) + "," +
        formatAnalogValue(readings.currentRefVoltage);

    _usbInterface.sendUSBTMCBulkData(response);
}

void App::_measureVBusVoltage(const std::vector<T76::SCPI::ParameterValue> &) {
    _usbInterface.sendUSBTMCBulkData(formatAnalogValue(_analogMonitor.vBusVoltage()));
}

void App::_measureVBusCurrent(const std::vector<T76::SCPI::ParameterValue> &) {
    _usbInterface.sendUSBTMCBulkData(formatAnalogValue(_analogMonitor.vBusCurrent()));
}

void App::_measureDUTCC1Voltage(const std::vector<T76::SCPI::ParameterValue> &) {
    _usbInterface.sendUSBTMCBulkData(formatAnalogValue(_analogMonitor.dutCC1Voltage()));
}

void App::_measureDUTCC2Voltage(const std::vector<T76::SCPI::ParameterValue> &) {
    _usbInterface.sendUSBTMCBulkData(formatAnalogValue(_analogMonitor.dutCC2Voltage()));
}

void App::_measureUSDSCC1Voltage(const std::vector<T76::SCPI::ParameterValue> &) {
    _usbInterface.sendUSBTMCBulkData(formatAnalogValue(_analogMonitor.usdsCC1Voltage()));
}

void App::_measureUSDSCC2Voltage(const std::vector<T76::SCPI::ParameterValue> &) {
    _usbInterface.sendUSBTMCBulkData(formatAnalogValue(_analogMonitor.usdsCC2Voltage()));
}

void App::_measureADCRefVoltage(const std::vector<T76::SCPI::ParameterValue> &) {
    _usbInterface.sendUSBTMCBulkData(formatAnalogValue(_analogMonitor.adcVRefVoltage()));
}

void App::_measureCurrentRefVoltage(const std::vector<T76::SCPI::ParameterValue> &) {
    _usbInterface.sendUSBTMCBulkData(formatAnalogValue(_analogMonitor.currentRefVoltage()));
}

void App::_measureGroundRefVoltage(const std::vector<T76::SCPI::ParameterValue> &) {
    _usbInterface.sendUSBTMCBulkData(formatAnalogValue(_analogMonitor.groundRefVoltage()));
}
