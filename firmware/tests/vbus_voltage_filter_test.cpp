/**
 * @file vbus_voltage_filter_test.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Host-buildable regression tests for calibrated VBUS zero clamping.
 */

#include "vbus_voltage_filter.hpp"

#include <cstdlib>
#include <iostream>
#include <string>

using namespace T76::DRPD::PHY;

namespace T76::DRPD::PHY::Test {

void expect(bool condition, const std::string& message) {
    if (!condition) {
        std::cerr << "FAIL: " << message << '\n';
        std::exit(1);
    }
}

void testThresholdBoundaries() {
    constexpr float threshold = 1.0f;

    expect(clampVBusVoltageToZero(0.999f, threshold) == 0.0f,
        "voltage below threshold should clamp to zero");
    expect(clampVBusVoltageToZero(1.0f, threshold) == 1.0f,
        "voltage equal to threshold should be preserved");
    expect(clampVBusVoltageToZero(1.001f, threshold) == 1.001f,
        "voltage above threshold should be preserved");
}

void testClampPrecedesCentiVoltAggregationValue() {
    constexpr float threshold = 1.0f;

    expect(truncateVBusVoltageCentiV(0.999f, threshold) == 0,
        "below-threshold voltage should be zero before centivolt conversion");
    expect(truncateVBusVoltageCentiV(1.0f, threshold) == 100,
        "threshold voltage should remain available to averaging and energy accumulation");
    expect(truncateVBusVoltageCentiV(1.019f, threshold) == 101,
        "above-threshold voltage should retain normal centivolt truncation");
}

} // namespace T76::DRPD::PHY::Test

int main() {
    T76::DRPD::PHY::Test::testThresholdBoundaries();
    T76::DRPD::PHY::Test::testClampPrecedesCentiVoltAggregationValue();
    std::cout << "VBUS voltage filter regression tests passed\n";
    return 0;
}
