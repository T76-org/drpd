/**
 * @file 4b5b.hpp
 * @brief 4B/5B encoding and decoding lookup tables and macros.
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#pragma once

#include <cstdint>


#define INVALID_5B_VALUE 0xff // Invalid 5B value used for error handling
#define EOP_5B_VALUE 0x0d // End of Packet (EOP) 5B value


namespace T76::DRPD::PHY {

    extern const uint8_t _fourToFiveBitLUT[16];
    extern const uint8_t _fiveToFourBitLUT[32];
    
} // namespace T76::DRPD::PHY
