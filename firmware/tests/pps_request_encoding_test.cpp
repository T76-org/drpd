/**
 * @file pps_request_encoding_test.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Host-buildable regression test for PPS Request Data Object encoding.
 */

#include "request.hpp"

#include <array>
#include <cstdlib>
#include <iostream>
#include <string>

using namespace T76::DRPD::Proto;

namespace {

void expect(bool condition, const std::string& message) {
    if (!condition) {
        std::cerr << "FAIL: " << message << '\n';
        std::exit(1);
    }
}

void testCapturedPPSRequestEncoding() {
    AugmentedPPSRequest request;
    request.objectPosition(6);
    request.noUsbSuspend(true);
    request.outputVoltageMillivolts(5500);
    request.operatingCurrentMilliamps(1200);

    constexpr std::array<uint8_t, 4> expectedBytes = {0x18, 0x26, 0x02, 0x61};
    const auto raw = request.raw();
    expect(
        raw.size() == expectedBytes.size() && std::equal(raw.begin(), raw.end(), expectedBytes.begin()),
        "5.5 V, 1.2 A, PDO 6 should encode as 0x61022618"
    );
    expect(request.objectPosition() == 6, "captured request should select PDO 6");
    expect(request.outputVoltageMillivolts() == 5500, "captured request should decode 5500 mV");
    expect(request.operatingCurrentMilliamps() == 1200, "captured request should decode 1200 mA");
}

void testCapturedFixedRequestEncoding() {
    FixedVariableRequest request(0);
    request.objectPosition(1);
    request.noUsbSuspend(true);
    request.operatingCurrentMilliamps(1000);
    request.maxOperatingCurrentMilliamps(1000);

    constexpr std::array<uint8_t, 4> expectedBytes = {0x64, 0x90, 0x01, 0x11};
    const auto raw = request.raw();
    expect(
        raw.size() == expectedBytes.size() && std::equal(raw.begin(), raw.end(), expectedBytes.begin()),
        "5 V fixed, 1 A, PDO 1 should encode as 0x11019064"
    );
    expect(request.objectPosition() == 1, "captured fixed request should select PDO 1");
    expect(request.operatingCurrentMilliamps() == 1000, "captured fixed request should decode 1000 mA");
    expect(request.maxOperatingCurrentMilliamps() == 1000, "captured fixed request maximum should decode 1000 mA");
}

} // namespace

int main() {
    testCapturedPPSRequestEncoding();
    testCapturedFixedRequestEncoding();
    std::cout << "PPS Request encoding regression tests passed\n";
    return 0;
}
