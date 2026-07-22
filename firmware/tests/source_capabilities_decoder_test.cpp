/**
 * @file source_capabilities_decoder_test.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Host-buildable regression tests for Source_Capabilities PDO decoding.
 */

#include "source_capabilities.hpp"

#include <array>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <span>
#include <string>
#include <variant>

using namespace T76::DRPD::Proto;

namespace {

void expect(bool condition, const std::string& message) {
    if (!condition) {
        std::cerr << "FAIL: " << message << '\n';
        std::exit(1);
    }
}

template <typename T>
const T& expectPDOType(const PDOVariant& pdo, const std::string& label) {
    expect(std::holds_alternative<T>(pdo), label + " has unexpected PDO type");
    return std::get<T>(pdo);
}

std::array<uint8_t, 4> toLittleEndianBytes(uint32_t raw) {
    return {
        static_cast<uint8_t>(raw & 0xFF),
        static_cast<uint8_t>((raw >> 8) & 0xFF),
        static_cast<uint8_t>((raw >> 16) & 0xFF),
        static_cast<uint8_t>((raw >> 24) & 0xFF),
    };
}

PDOVariant decodeSinglePDO(uint32_t raw) {
    const std::array<uint8_t, 4> payload = toLittleEndianBytes(raw);
    const SourceCapabilities capabilities(std::span<const uint8_t>(payload.data(), payload.size()), 1);
    expect(capabilities.pdoCount() == 1, "single-PDO payload should decode one PDO");
    expect(!capabilities.isMessageInvalid(), "single-PDO payload should be valid");
    return capabilities.pdo(0);
}

void testCapturedSPRAVSAndSPRPPSPayload() {
    constexpr std::array<uint8_t, 24> payload = {
        0x2C, 0x91, 0x31, 0x08,
        0x2C, 0xD1, 0x32, 0x00,
        0x2C, 0xB1, 0x34, 0x00,
        0xE1, 0x40, 0x36, 0x00,
        0xCA, 0xB0, 0x04, 0xEC,
        0x2D, 0x32, 0x90, 0xC9,
    };

    const SourceCapabilities capabilities(std::span<const uint8_t>(payload.data(), payload.size()), 6);
    expect(capabilities.pdoCount() == 6, "captured payload should decode six PDOs");
    expect(!capabilities.isMessageInvalid(), "captured payload should be valid");

    expectPDOType<FixedSupplyPDO>(capabilities.pdo(0), "PDO 1");
    expectPDOType<FixedSupplyPDO>(capabilities.pdo(1), "PDO 2");
    expectPDOType<FixedSupplyPDO>(capabilities.pdo(2), "PDO 3");
    expectPDOType<FixedSupplyPDO>(capabilities.pdo(3), "PDO 4");

    const auto& sprAvs = expectPDOType<SPRAVSAPDO>(capabilities.pdo(4), "PDO 5");
    expect(sprAvs.raw() == 0xEC04B0CA, "PDO 5 raw value should match captured SPR AVS APDO");
    expect(sprAvs.minVoltageMillivolts() == 9000, "SPR AVS minimum voltage should be 9000 mV");
    expect(sprAvs.maxVoltageMillivolts() == 20000, "SPR AVS maximum voltage should be 20000 mV");
    expect(sprAvs.maxCurrent15VMilliamps() == 3000, "SPR AVS 9-15 V current should be 3000 mA");
    expect(sprAvs.maxCurrent20VMilliamps() == 2020, "SPR AVS 15-20 V current should be 2020 mA");
    expect(sprAvs.maxPowerMilliwatts() == 45000, "SPR AVS maximum power should be 45000 mW");

    const auto& sprPps = expectPDOType<SPRPPSAPDO>(capabilities.pdo(5), "PDO 6");
    expect(sprPps.raw() == 0xC990322D, "PDO 6 raw value should match captured SPR PPS APDO");
    expect(sprPps.minVoltageMillivolts() == 5000, "SPR PPS minimum voltage should be 5000 mV");
    expect(sprPps.maxVoltageMillivolts() == 20000, "SPR PPS maximum voltage should be 20000 mV");
    expect(sprPps.maxCurrentMilliamps() == 2250, "SPR PPS maximum current should be 2250 mA");
}

void testAPDOSubtypeDispatchTable() {
    expectPDOType<SPRPPSAPDO>(decodeSinglePDO(0xC990322D), "APDO subtype 00");
    expectPDOType<EPRAVSAPDO>(decodeSinglePDO(0xD230968C), "APDO subtype 01");
    expectPDOType<SPRAVSAPDO>(decodeSinglePDO(0xEC04B0CA), "APDO subtype 10");
}

} // namespace

int main() {
    testCapturedSPRAVSAndSPRPPSPayload();
    testAPDOSubtypeDispatchTable();
    std::cout << "SourceCapabilities decoder regression tests passed\n";
    return 0;
}
