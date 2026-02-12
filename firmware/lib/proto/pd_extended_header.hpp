/**
 * @file pd_extended_header.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#pragma once

#include <cstdint>


namespace T76::DRPD::Proto {

    /**
     * @brief USB-PD Extended Message Header (16-bit)
     */
    class PDExtendedHeader {
    public:
        explicit PDExtendedHeader(uint16_t raw = 0);

        [[nodiscard]] uint16_t raw() const;
        void raw(uint16_t value);

        [[nodiscard]] uint16_t dataSizeBytes() const;
        void dataSizeBytes(uint16_t value);

        [[nodiscard]] bool requestChunk() const;
        void requestChunk(bool value);

        [[nodiscard]] bool chunked() const;
        void chunked(bool value);

        [[nodiscard]] uint8_t chunkNumber() const;
        void chunkNumber(uint8_t value);

    protected:
        uint16_t _raw = 0;
    };

} // namespace T76::DRPD::Proto
