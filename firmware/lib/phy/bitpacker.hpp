/**
 * @file bitpacker.hpp
 * @brief Class for packing arbitrary bit sequences into 32-bit words.
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#pragma once

#include <stdlib.h>
#include <cstdint>
#include <vector>


namespace T76::DRPD::PHY {
    
    /**
     * @brief Class for packing arbitrary bit sequences into 32-bit words.
     * 
     * The BitPacker class allows you to add bits from a 32-bit integer
     * into a buffer of 32-bit words. It accumulates bits until a full word
     * is formed, at which point it pushes the word into the buffer.
     * 
     * The class supports adding bits in chunks of 1 to 32 bits at a time.
     * It also allows you to flush any remaining bits into the buffer, padding
     * with zeros if necessary.
     * 
     * Example usage:
     * 
     * BitPacker packer;
     * 
     * // Add 5 bits from the integer 0b10101
     * packer.addBits(0b10101, 5);
     * 
     * // Add another 10 bits from the integer 0b1100110011
     * packer.addBits(0b1100110011, 10);
     * 
     * // Flush any remaining bits into the buffer
     * packer.flush();
     * 
     * // Get the packed buffer
     * const auto& buffer = packer.buffer();
     * 
     * // Do something with the packed data
     * 
     */
    class BitPacker {
    public:
        BitPacker();

        /**
         * Add up to 32 bits (lower-order bits of `data`) into the packer.
         * @param data  A 32-bit unsigned integer whose lower `nbits` bits are the payload.
         * @param nbits Number of bits to extract from `data` (1 <= nbits <= 32).
         * @throws std::invalid_argument if nbits == 0 or nbits > 32, or if data doesn't fit in nbits bits.
         */
        void addBits(uint32_t data, unsigned nbits);

        /**
         * Push any partially filled word (zero-padding the high bits) into the buffer.
         */
        void flush();

        /**
         * @return const reference to the internal buffer of packed 32-bit words.
         */
        const std::vector<uint32_t>& buffer() const;

        /**
         * Clear all state: drops existing buffer and resets counters.
         */
        void clear();

        /**
         * @return Total number of bits that have been written so far (including flushed and unflushed).
         */
        uint32_t totalBitsWritten() const;

    protected:
        std::vector<uint32_t> _buffer;           ///< Fully-written 32-bit words
        uint32_t              _currentWord;      ///< Accumulates bits until a full 32‐bit word
        unsigned              _bitsInCurrentWord;///< How many bits are in `_currentWord` currently (0..31)
        uint32_t              _totalBitsWritten; ///< Running total of all bits ever added
    };

}

