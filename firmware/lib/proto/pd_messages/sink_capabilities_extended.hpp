/**
 * @file sink_capabilities_extended.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Sink_Capabilities_Extended Message Encapsulation
 *
 * The Sink_Capabilities_Extended message is an Extended Message containing a
 * 24-byte Sink Capabilities Extended Data Block (SKEDB).
 *
 * Reference: USB Power Delivery Specification Rev 3.2, Section 6.5.13.
 */

#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "../pd_message.hpp"

namespace T76::DRPD::Proto {

    /**
     * @brief Sink_Capabilities_Extended message with one unchunked SKEDB.
     */
    class SinkCapabilitiesExtended : public PDMessage {
    public:
        /**
         * @brief Static fields used to populate the 24-byte SKEDB.
         */
        struct Fields {
            uint16_t vid = 0xFFFF;
            uint16_t pid = 0;
            uint32_t xid = 0;
            uint8_t firmwareVersion = 0;
            uint8_t hardwareVersion = 0;
            uint8_t loadStep = 0;
            uint16_t sinkLoadCharacteristics = 0;
            uint8_t compliance = 0;
            uint8_t touchTemp = 0;
            uint8_t batteryInfo = 0;
            uint8_t sinkModes = 0;
            uint8_t sprSinkMinimumPDP = 0;
            uint8_t sprSinkOperationalPDP = 0;
            uint8_t sprSinkMaximumPDP = 0;
            uint8_t eprSinkMinimumPDP = 0;
            uint8_t eprSinkOperationalPDP = 0;
            uint8_t eprSinkMaximumPDP = 0;
        };

        /**
         * @brief Create a minimal product-specific SKEDB.
         * @param vid USB Vendor ID.
         * @param pid USB Product ID.
         * @param sprPDPW SPR PDP value in watts.
         * @return SinkCapabilitiesExtended message.
         */
        [[nodiscard]] static SinkCapabilitiesExtended minimalSPR(
            uint16_t vid,
            uint16_t pid,
            uint8_t sprPDPW);

        /**
         * @brief Construct from SKEDB fields.
         * @param fields SKEDB fields to encode.
         */
        explicit SinkCapabilitiesExtended(const Fields& fields);

        /**
         * @brief Return extended header, SKEDB, and zero padding bytes.
         */
        [[nodiscard]] std::span<const uint8_t> raw() const override;

        /**
         * @brief Return the number of 32-bit data objects used by this extended message.
         */
        [[nodiscard]] uint32_t numDataObjects() const override;

        /**
         * @brief Return the Sink_Capabilities_Extended Extended Message type.
         */
        [[nodiscard]] uint32_t rawMessageType() const override;

    protected:
        Fields _fields;
        mutable std::array<uint8_t, 28> _rawBytes = {};

        /**
         * @brief Store little-endian integer fields in the SKEDB.
         */
        static void _writeLE16(std::array<uint8_t, 28>& bytes, size_t offset, uint16_t value);
        static void _writeLE32(std::array<uint8_t, 28>& bytes, size_t offset, uint32_t value);
    };

} // namespace T76::DRPD::Proto
