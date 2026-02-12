/**
 * @file bitpacker.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "bitpacker.hpp"

using namespace T76::DRPD::PHY;


BitPacker::BitPacker()
    : _currentWord(0),
      _bitsInCurrentWord(0),
      _totalBitsWritten(0)
{}

void BitPacker::addBits(uint32_t data, unsigned nbits) {
    // Update total bits counter
    _totalBitsWritten += nbits;

    // Write bits in chunks until we've consumed all `nbits`
    while (nbits > 0) {
        unsigned available = 32 - _bitsInCurrentWord;            
        unsigned take      = (nbits <= available ? nbits : available);

        // Extract exactly `take` low-order bits from data
        uint32_t chunk = data & ((1u << take) - 1);

        // Place those `take` bits into _currentWord_ at the current offset
        _currentWord |= (chunk << _bitsInCurrentWord);
        _bitsInCurrentWord += take;

        // Remove consumed bits from `data`
        data  >>= take;
        nbits -= take;

        // If we've filled exactly 32 bits, push it to the buffer
        if (_bitsInCurrentWord == 32) {
            _buffer.push_back(_currentWord);
            _currentWord       = 0;
            _bitsInCurrentWord = 0;
        }
    }
}

void BitPacker::flush() {
    if (_bitsInCurrentWord > 0) {
        _buffer.push_back(_currentWord);
        _currentWord       = 0;
        _bitsInCurrentWord = 0;
    }
}

const std::vector<uint32_t>& BitPacker::buffer() const {
    return _buffer;
}

void BitPacker::clear() {
    _buffer.clear();
    _currentWord       = 0;
    _bitsInCurrentWord = 0;
    _totalBitsWritten  = 0;
}

uint32_t BitPacker::totalBitsWritten() const {
    return _totalBitsWritten;
}

