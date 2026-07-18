/**
 * @file vbus_voltage_filter.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#pragma once

#include <cmath>
#include <cstdint>

namespace T76::DRPD::PHY {

/**
 * @brief Clamp calibrated VBUS readings below the configured zero threshold.
 * @param calibratedVoltage Calibrated VBUS voltage in volts.
 * @param zeroThresholdVolts Threshold below which VBUS is treated as zero.
 * @return Zero below the threshold; otherwise the original calibrated voltage.
 */
constexpr float clampVBusVoltageToZero(float calibratedVoltage, float zeroThresholdVolts) {
    return calibratedVoltage < zeroThresholdVolts ? 0.0f : calibratedVoltage;
}

/**
 * @brief Clamp and truncate a calibrated VBUS voltage to centivolts.
 * @param calibratedVoltage Calibrated VBUS voltage in volts.
 * @param zeroThresholdVolts Threshold below which VBUS is treated as zero.
 * @return Clamped voltage truncated to whole centivolts.
 */
inline int32_t truncateVBusVoltageCentiV(float calibratedVoltage, float zeroThresholdVolts) {
    return static_cast<int32_t>(
        std::trunc(clampVBusVoltageToZero(calibratedVoltage, zeroThresholdVolts) * 100.0f));
}

} // namespace T76::DRPD::PHY
