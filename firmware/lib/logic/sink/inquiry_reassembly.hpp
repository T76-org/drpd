/**
 * @file inquiry_reassembly.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Bounded, host-testable extended inquiry payload reassembly primitive.
 */

#pragma once

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

namespace T76::DRPD::Logic {

enum class InquiryReassemblyResult : uint8_t {
    InProgress,
    Complete,
    Malformed,
    TooLarge,
    RequestChunk,
    Duplicate,
};

template <size_t MaxBytes>
class InquiryExtendedReassembly {
public:
    InquiryReassemblyResult accept(
        bool chunked,
        bool requestChunk,
        uint16_t dataSize,
        uint8_t chunkNumber,
        std::span<const uint8_t> fragment) {
        if (requestChunk) {
            reset();
            return InquiryReassemblyResult::RequestChunk;
        }
        if (dataSize == 0) {
            reset();
            return InquiryReassemblyResult::Malformed;
        }
        if (dataSize > MaxBytes) {
            reset();
            return InquiryReassemblyResult::TooLarge;
        }
        if (!chunked) {
            if (chunkNumber != 0 || fragment.size() != dataSize) {
                reset();
                return InquiryReassemblyResult::Malformed;
            }
            std::copy(fragment.begin(), fragment.end(), _bytes.begin());
            _length = fragment.size();
            _active = false;
            return InquiryReassemblyResult::Complete;
        }
        if (!_active) {
            if (chunkNumber != 0) return InquiryReassemblyResult::Malformed;
            _active = true;
            _expected = dataSize;
            _nextChunk = 0;
            _length = 0;
        }
        if (dataSize != _expected) {
            reset();
            return InquiryReassemblyResult::Malformed;
        }
        if (_nextChunk > 0 && chunkNumber == static_cast<uint8_t>(_nextChunk - 1)) {
            if (fragment.size() != _lastFragmentLength) {
                reset();
                return InquiryReassemblyResult::Malformed;
            }
            for (size_t i = 0; i < _lastCopiedLength; ++i) {
                if (fragment[i] != _bytes[_lastStart + i]) {
                    reset();
                    return InquiryReassemblyResult::Malformed;
                }
            }
            for (size_t i = _lastCopiedLength; i < fragment.size(); ++i) {
                if (fragment[i] != 0) {
                    reset();
                    return InquiryReassemblyResult::Malformed;
                }
            }
            return InquiryReassemblyResult::Duplicate;
        }
        if (chunkNumber != _nextChunk) {
            reset();
            return InquiryReassemblyResult::Malformed;
        }
        const size_t copyLength = std::min(fragment.size(), _expected - _length);
        for (size_t i = copyLength; i < fragment.size(); ++i) {
            if (fragment[i] != 0) {
                reset();
                return InquiryReassemblyResult::Malformed;
            }
        }
        _lastStart = _length;
        _lastCopiedLength = copyLength;
        _lastFragmentLength = fragment.size();
        std::copy_n(fragment.begin(), copyLength, _bytes.begin() + _length);
        _length += copyLength;
        ++_nextChunk;
        if (_length == _expected) {
            _active = false;
            return InquiryReassemblyResult::Complete;
        }
        if (copyLength == 0) {
            reset();
            return InquiryReassemblyResult::Malformed;
        }
        return InquiryReassemblyResult::InProgress;
    }

    [[nodiscard]] std::span<const uint8_t> payload() const {
        return {_bytes.data(), _length};
    }

    void reset() {
        _active = false;
        _expected = 0;
        _nextChunk = 0;
        _length = 0;
        _lastStart = 0;
        _lastCopiedLength = 0;
        _lastFragmentLength = 0;
    }

private:
    std::array<uint8_t, MaxBytes> _bytes = {};
    size_t _length = 0;
    uint16_t _expected = 0;
    uint8_t _nextChunk = 0;
    size_t _lastStart = 0;
    size_t _lastCopiedLength = 0;
    size_t _lastFragmentLength = 0;
    bool _active = false;
};

}
