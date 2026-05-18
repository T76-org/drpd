/**
 * @file pps_status.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * PPS_Status Message Decoding
 *
 * Reference: USB Power Delivery Specification Rev 3.2, Section 6.5.10.
 */

#pragma once

#include <cstdint>
#include <span>

namespace T76::DRPD::Proto {

    /**
     * @brief Parsed 4-byte PPS Status Data Block (PPSSDB).
     */
    class PPSStatus {
    public:
        /**
         * @brief Present Temperature Flag encoding.
         */
        enum class PresentTemperatureFlag : uint8_t {
            NotSupported = 0,
            Normal = 1,
            Warning = 2,
            OverTemperature = 3
        };

        /**
         * @brief Construct from a PPSSDB byte span.
         * @param payload Four-byte PPS status payload.
         */
        explicit PPSStatus(std::span<const uint8_t> payload);

        /**
         * @brief Return whether the payload had the required 4-byte length.
         */
        [[nodiscard]] bool valid() const;

        /**
         * @brief Return true when source output voltage is reported.
         */
        [[nodiscard]] bool outputVoltageSupported() const;

        /**
         * @brief Return source output voltage in millivolts, or zero if unsupported.
         */
        [[nodiscard]] uint32_t outputVoltageMillivolts() const;

        /**
         * @brief Return true when source output current is reported.
         */
        [[nodiscard]] bool outputCurrentSupported() const;

        /**
         * @brief Return source output current in milliamps, or zero if unsupported.
         */
        [[nodiscard]] uint32_t outputCurrentMilliamps() const;

        /**
         * @brief Return parsed Present Temperature Flag.
         */
        [[nodiscard]] PresentTemperatureFlag presentTemperatureFlag() const;

        /**
         * @brief Return true when Source reports current-limit mode.
         */
        [[nodiscard]] bool operatingModeCurrentLimit() const;

        /**
         * @brief Return raw real-time flags byte.
         */
        [[nodiscard]] uint8_t realTimeFlags() const;

    protected:
        bool _valid = false;
        uint16_t _outputVoltage20mV = 0xFFFF;
        uint8_t _outputCurrent50mA = 0xFF;
        uint8_t _realTimeFlags = 0;
    };

} // namespace T76::DRPD::Proto
