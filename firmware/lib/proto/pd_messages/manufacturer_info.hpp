/**
 * @file manufacturer_info.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Manufacturer_Info Message Encapsulation
 *
 * Reference: USB Power Delivery Specification Rev 3.2, Section 6.5.7.
 */

#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "../pd_message.hpp"

namespace T76::DRPD::Proto {

    /**
     * @brief Manufacturer_Info extended message with one MIDB.
     */
    class ManufacturerInfo : public PDMessage {
    public:
        /**
         * @brief Maximum manufacturer string characters before the null terminator.
         */
        static constexpr size_t MaxManufacturerStringChars = 21;

        /**
         * @brief Create a supported port manufacturer response.
         * @param vid USB Vendor ID.
         * @param pid USB Product ID.
         * @param manufacturer Null-terminated ASCII manufacturer string.
         * @return ManufacturerInfo response message.
         */
        [[nodiscard]] static ManufacturerInfo port(
            uint16_t vid,
            uint16_t pid,
            const char *manufacturer);

        /**
         * @brief Create a response for unsupported target/ref requests.
         * @return ManufacturerInfo response message.
         */
        [[nodiscard]] static ManufacturerInfo unsupported();

        /**
         * @brief Construct a Manufacturer_Info message.
         * @param vid USB Vendor ID.
         * @param pid USB Product ID.
         * @param manufacturer Null-terminated ASCII manufacturer string.
         */
        ManufacturerInfo(uint16_t vid, uint16_t pid, const char *manufacturer);

        /**
         * @brief Return extended header, MIDB, and zero padding bytes.
         */
        [[nodiscard]] std::span<const uint8_t> raw() const override;

        /**
         * @brief Return the number of 32-bit data objects used by this extended message.
         */
        [[nodiscard]] uint32_t numDataObjects() const override;

        /**
         * @brief Return the Manufacturer_Info Extended Message type.
         */
        [[nodiscard]] uint32_t rawMessageType() const override;

    protected:
        uint16_t _vid = 0xFFFF;
        uint16_t _pid = 0;
        std::array<char, MaxManufacturerStringChars + 1> _manufacturer = {};
        mutable std::array<uint8_t, 28> _rawBytes = {};

        /**
         * @brief MIDB data size in bytes, excluding the extended header and padding.
         */
        [[nodiscard]] size_t _midbSize() const;

        /**
         * @brief Store little-endian integer fields in the MIDB.
         */
        static void _writeLE16(std::array<uint8_t, 28>& bytes, size_t offset, uint16_t value);
    };

} // namespace T76::DRPD::Proto
