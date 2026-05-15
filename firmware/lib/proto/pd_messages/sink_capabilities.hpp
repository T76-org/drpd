/**
 * @file sink_capabilities.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Sink_Capabilities Message Encapsulation
 *
 * The Sink_Capabilities message is a Data Message containing one or more PDOs
 * that describe the power levels at which the Sink can operate.
 *
 * Reference: USB Power Delivery Specification Rev 3.2, Section 6.4.1.6.
 */

#pragma once

#include <array>
#include <cstdint>
#include <span>

#include "../pd_message.hpp"

namespace T76::DRPD::Proto {

    /**
     * @brief Sink_Capabilities message used to advertise local Sink requirements.
     */
    class SinkCapabilities : public PDMessage {
    public:
        /**
         * @brief Create a one-PDO fixed-supply Sink_Capabilities message.
         * @param voltageMillivolts Fixed operating voltage in millivolts.
         * @param operationalCurrentMilliamps Operational current in milliamps.
         * @return SinkCapabilities message containing the encoded fixed PDO.
         */
        [[nodiscard]] static SinkCapabilities fixedSupply(
            uint32_t voltageMillivolts,
            uint32_t operationalCurrentMilliamps);

        /**
         * @brief Construct from a single raw Sink PDO.
         * @param rawPDO Encoded 32-bit Sink PDO.
         */
        explicit SinkCapabilities(uint32_t rawPDO = 0);

        /**
         * @brief Construct from raw Sink PDOs.
         * @param rawPDOs Encoded 32-bit Sink PDOs, limited to 1..7 entries.
         */
        explicit SinkCapabilities(std::span<const uint32_t> rawPDOs);

        /**
         * @brief Return raw PDO payload bytes in little-endian order.
         */
        [[nodiscard]] std::span<const uint8_t> raw() const override;

        /**
         * @brief Return the number of PDOs in the message.
         */
        [[nodiscard]] uint32_t numDataObjects() const override;

        /**
         * @brief Return the Sink_Capabilities Data Message type.
         */
        [[nodiscard]] uint32_t rawMessageType() const override;

        /**
         * @brief True if the PDO count is outside the valid SPR range.
         */
        [[nodiscard]] bool isMessageInvalid() const;

    protected:
        std::array<uint32_t, 7> _rawPDOs = {};
        mutable std::array<uint8_t, 28> _rawBytes = {};
        uint32_t _pdoCount = 0;
        bool _messageInvalid = false;

        /**
         * @brief Encode a fixed-supply Sink PDO.
         */
        [[nodiscard]] static uint32_t _fixedSupplyPDO(
            uint32_t voltageMillivolts,
            uint32_t operationalCurrentMilliamps);
    };

} // namespace T76::DRPD::Proto
