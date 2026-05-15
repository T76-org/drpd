/**
 * @file revision.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Revision Message Encapsulation
 *
 * The Revision message is a Data Message containing one Revision Message Data
 * Object (RMDO) that reports the highest USB-PD revision and version supported.
 *
 * Reference: USB Power Delivery Specification Rev 3.2, Section 6.4.12.
 */

#pragma once

#include <array>
#include <cstdint>
#include <span>

#include "../pd_message.hpp"

namespace T76::DRPD::Proto {

    /**
     * @brief Revision message carrying one RMDO.
     */
    class Revision : public PDMessage {
    public:
        /**
         * @brief Create a Revision message for USB-PD Revision 3.2, Version 1.1.
         */
        [[nodiscard]] static Revision revision3p2Version1p1();

        /**
         * @brief Construct a Revision message from field nibbles.
         * @param revisionMajor USB-PD specification revision major.
         * @param revisionMinor USB-PD specification revision minor.
         * @param versionMajor USB-PD specification version major.
         * @param versionMinor USB-PD specification version minor.
         */
        Revision(
            uint8_t revisionMajor,
            uint8_t revisionMinor,
            uint8_t versionMajor,
            uint8_t versionMinor);

        /**
         * @brief Return the RMDO payload bytes in little-endian order.
         */
        [[nodiscard]] std::span<const uint8_t> raw() const override;

        /**
         * @brief Return the number of data objects in the Revision message.
         */
        [[nodiscard]] uint32_t numDataObjects() const override;

        /**
         * @brief Return the Revision Data Message type.
         */
        [[nodiscard]] uint32_t rawMessageType() const override;

    protected:
        uint32_t _raw = 0;
        mutable std::array<uint8_t, 4> _rawBytes = {};
    };

} // namespace T76::DRPD::Proto
