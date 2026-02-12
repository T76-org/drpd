/**
 * @file 4b5b.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "4b5b.hpp"


const uint8_t T76::DRPD::PHY::_fourToFiveBitLUT[16] = {
    0x1E, // 0 -> 11110
    0x09, // 1 -> 01001
    0x14, // 2 -> 10100
    0x15, // 3 -> 10101
    0x0A, // 4 -> 01010
    0x0B, // 5 -> 01011
    0x0E, // 6 -> 01110
    0x0F, // 7 -> 01111
    0x12, // 8 -> 10010
    0x13, // 9 -> 10011
    0x16, // A -> 10110
    0x17, // B -> 10111
    0x1A, // C -> 11010
    0x1B, // D -> 11011
    0x1C, // E -> 11100
    0x1D  // F -> 11101
};

const uint8_t T76::DRPD::PHY::_fiveToFourBitLUT[32] = {
    INVALID_5B_VALUE, // 00000 - Error
    INVALID_5B_VALUE, // 00001 - Error
    INVALID_5B_VALUE, // 00010 - Error
    INVALID_5B_VALUE, // 00011 - Error
    INVALID_5B_VALUE, // 00100 - Error
    INVALID_5B_VALUE, // 00101 - Error
    INVALID_5B_VALUE, // 00110 - K-code Sync-3
    INVALID_5B_VALUE, // 00111 - K-code RST-1
    INVALID_5B_VALUE, // 01000 - Error
    0x01,             // 01001 - 1
    0x04,             // 01010 - 4
    0x05,             // 01011 - 5
    INVALID_5B_VALUE, // 01100 - Error
    INVALID_5B_VALUE, // 01101 - K-code EOP
    0x06,             // 01110 - 6
    0x07,             // 01111 - 7
    INVALID_5B_VALUE, // 10000 - Error
    INVALID_5B_VALUE, // 10001 - K-code Sync-2
    0x08,             // 10010 - 8
    0x09,             // 10011 - 9
    0x02,             // 10100 - 2
    0x03,             // 10101 - 3
    0x0A,             // 10110 - A
    0x0B,             // 10111 - B
    INVALID_5B_VALUE, // 11000 - K-code Sync-1
    INVALID_5B_VALUE, // 11001 - K-code RST-2
    0x0C,             // 11010 - C
    0x0D,             // 11011 - D
    0x0E,             // 11100 - E
    0x0F,             // 11101 - F
    0x00,             // 11110 - 0
    INVALID_5B_VALUE  // 11111 - Error
};
