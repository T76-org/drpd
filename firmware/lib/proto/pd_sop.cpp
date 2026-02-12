/**
 * @file pd_sop.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "pd_sop.hpp"


using namespace T76::DRPD::Proto;


// Classify the SOP token based on the K-code sequence
// K-code numeric values are the 5-bit 4b5b symbol values.
// Sync-1 = 0b11000 (24), Sync-2 = 0b10001 (17), Sync-3 = 0b00110 (6)
// RST-1  = 0b00111 (7),  RST-2  = 0b11001 (25)
constexpr uint8_t kSync1 = 0x18;
constexpr uint8_t kSync2 = 0x11;
constexpr uint8_t kSync3 = 0x06;
constexpr uint8_t kRst1  = 0x07;
constexpr uint8_t kRst2  = 0x19;


void SOP::type(SOPType type) {
    _type = type;

    // Store bytes for known types; invalid type gets zeroed bytes
    switch (type) {
        case SOPType::SOP:
            _bytes = {kSync1, kSync1, kSync1, kSync2};
            break;

        case SOPType::SOPPrime:
            _bytes = {kSync1, kSync1, kSync3, kSync3};
            break;

        case SOPType::SOPDoublePrime:
            _bytes = {kSync1, kSync3, kSync1, kSync3};
            break;

        case SOPType::SOPPrimeDebug:
            _bytes = {kSync1, kRst2, kRst2, kSync3};
            break;

        case SOPType::SOPDoublePrimeDebug:
            _bytes = {kSync1, kRst2, kSync3, kSync2};
            break;

        case SOPType::HardReset:
            _bytes = {kRst1, kRst1, kRst1, kRst2};
            break;

        case SOPType::CableReset:
            _bytes = {kRst1, kSync1, kRst1, kSync3};
            break;
            
        case SOPType::Invalid:
        default:
            _bytes = {};
            break;
    }
}

SOP::SOPType SOP::type() const {
    return _type;
}

bool SOP::isValid() const {
    return _type != SOPType::Invalid;
}

bool SOP::hasErrors() const {
    return _hasErrors;
}

void SOP::bytes(std::span<const uint8_t, 4> kcodes) {
    for (size_t i = 0; i < 4; ++i) {
        _bytes[i] = kcodes[i];
    }

    // SOP* ordered sets (USB-PD 3.x PHY):
    //  - SOP            : Sync-1, Sync-1, Sync-1, Sync-2
    //  - SOP'           : Sync-1, Sync-1, Sync-3, Sync-3
    //  - SOP''          : Sync-1, Sync-3, Sync-1, Sync-3
    //  - SOP'_Debug     : Sync-1, RST-2,  RST-2,  Sync-3
    //  - SOP''_Debug    : Sync-1, RST-2,  Sync-3, Sync-2
    //  - Hard Reset     : RST-1,  RST-1,  RST-1,  RST-2
    //  - Cable Reset    : RST-1,  Sync-1, RST-1,  Sync-3

    bool valid;

    if (_isValidSequence(kSync1, kSync1, kSync1, kSync2)) {
        _type = SOPType::SOP;
    } else if (_isValidSequence(kSync1, kSync1, kSync3, kSync3)) {
        _type = SOPType::SOPPrime;
    } else if (_isValidSequence(kSync1, kSync3, kSync1, kSync3)) {
        _type = SOPType::SOPDoublePrime;
    } else if (_isValidSequence(kSync1, kRst2,  kRst2,  kSync3)) {
        _type = SOPType::SOPPrimeDebug;
    } else if (_isValidSequence(kSync1, kRst2,  kSync3, kSync2)) {
        _type = SOPType::SOPDoublePrimeDebug;
    } else if (_isValidSequence(kRst1,  kRst1,  kRst1,  kRst2)) {
        _type = SOPType::HardReset;
    } else if (_isValidSequence(kRst1,  kSync1, kRst1,  kSync3)) {
        _type = SOPType::CableReset;
    } else {
        _type = SOPType::Invalid;
    }
}

const std::array<uint8_t, 4>& SOP::bytes() const {
    return _bytes;
}

inline bool SOP::_isValidSequence(uint8_t a, uint8_t b, uint8_t c, uint8_t d) {
    int matches = 0;

    if (_bytes[0] == a) ++matches;
    if (_bytes[1] == b) ++matches;
    if (_bytes[2] == c) ++matches;
    if (_bytes[3] == d) ++matches;

    _hasErrors = (matches < 4);

    return matches >= 3;
};

std::string SOP::toString() const {
    switch (_type) {
        case SOPType::SOP:
            return "SOP";
        case SOPType::SOPPrime:
            return "SOP'";
        case SOPType::SOPDoublePrime:
            return "SOP''";
        case SOPType::SOPDebug:
            return "SOP_Debug";
        case SOPType::SOPPrimeDebug:
            return "SOP'_Debug";
        case SOPType::SOPDoublePrimeDebug:
            return "SOP''_Debug";
        case SOPType::HardReset:
            return "Hard_Reset";
        case SOPType::CableReset:
            return "Cable_Reset";
        case SOPType::Invalid:
        default:
            return "Invalid_SOP";
    }
}
