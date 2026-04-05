/**
 * @file bmc_decoded_message.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "bmc_decoded_message.hpp"

#include <t76/safety.hpp>

#include "4b5b.hpp"


using namespace T76::DRPD;
using namespace T76::DRPD::PHY;


BMCDecodedMessage::BMCDecodedMessage() {
    reset();
}

void BMCDecodedMessage::reset() {
    _result = BMCDecodedMessageResult::Incomplete;
    _startTimestamp = InvalidTimestamp;
    _endTimestamp = InvalidTimestamp;
    _hasIngressTimestamp = false;

    _carrierPulseLength = 0;
    _carrierPulseHighBitThreshold = 0;

    for (uint32_t i = 0; i < 4; i++) {
        _sop[i] = 0;
    }

    _dataLength = 0;

    _pulseBufferLength = 0;

    _decoderState.state = _DecoderState::ReadingPreamble;

    _decoderState.carrierAccumulator = 0;
    _decoderState.carrierEntryCount = 0;

    _decoderState.kCodeAccumulator = 0;
    _decoderState.kCodeBitCount = 0;

    _decoderState.skipNextPulse = false;

    _decoderState.sopIndex = 0;

    _decoderState.currentByte = 0;
    _decoderState.processingLSNibble = true;
}

BMCDecodedMessageEvent BMCDecodedMessage::feedPulse(uint32_t pulseWidth) {
    // First, invert the pulse width, since the PIO program counts downwards

    pulseWidth = TimeoutPulseWidthPIOCycles - pulseWidth; 

    if (_pulseBufferLength >= PHY_BMC_DECODER_MAX_MESSAGE_PULSE_BUFFER_SIZE) {
        _endTimestamp = time_us_64();
        _result = BMCDecodedMessageResult::InvalidKCode;
        return BMCDecodedMessageEvent::InvalidKCodeError;
    }

    _pulseBuffer[_pulseBufferLength++] = pulseWidth;

    if (pulseWidth >= TimeoutPulseWidthPIOCycles) {
        _endTimestamp = time_us_64();
        _result = BMCDecodedMessageResult::Timeout;

        if (_dataLength == 0) {
            return BMCDecodedMessageEvent::TimeoutBeforeStartError;
        }

        return BMCDecodedMessageEvent::TimeoutError;
    } else if (pulseWidth < RuntPulseWidthPIOCycles) {
        _endTimestamp = time_us_64();
        _result = BMCDecodedMessageResult::RuntPulse;
        return BMCDecodedMessageEvent::RuntPulseError;
    } else {
        switch(_decoderState.state) {
            case _DecoderState::ReadingPreamble:
                return _processEdgeInPreambleState(pulseWidth);

            case _DecoderState::ReadingSOP:
                return _processEdgeInReadingSOPState(pulseWidth);

            case _DecoderState::ReadingData:
                return _processEdgeInReadingDataState(pulseWidth);

            default:
                T76_ASSERT(false, "Invalid decoder state");
        }
    }
}

BMCDecodedMessageResult BMCDecodedMessage::decodingResult() const {
    return _result;
}

void BMCDecodedMessage::ingressTimestamp(uint64_t timestamp) {
    _startTimestamp = timestamp;
    _hasIngressTimestamp = true;
}

bool BMCDecodedMessage::hasIngressTimestamp() const {
    return _hasIngressTimestamp;
}

const uint8_t (&BMCDecodedMessage::sop() const)[4] {
    return _sop;
}

std::span<const uint8_t> BMCDecodedMessage::data() const {
    return std::span<const uint8_t>(_data, _data + _dataLength);
}

std::span<const uint8_t> BMCDecodedMessage::rawHeader() const {
    if (_dataLength < 2) {
        return std::span<const uint8_t>();
    }

    return std::span<const uint8_t>(_data, _data + 2);
}

std::span<const uint8_t> BMCDecodedMessage::rawBody() const {
    if (_dataLength <= 6) {
        return std::span<const uint8_t>();
    }

    return std::span<const uint8_t>(_data + 2, _data + _dataLength - 4);
}

std::span<const uint8_t> BMCDecodedMessage::rawCRC() const {
    if (_dataLength < 6) {
        return std::span<const uint8_t>();
    }

    return std::span<const uint8_t>(_data + _dataLength - 4, _data + _dataLength);
}

std::span<const uint16_t> BMCDecodedMessage::pulseBuffer() const {
    return std::span<const uint16_t>(_pulseBuffer, _pulseBuffer + _pulseBufferLength);
}

const Proto::PDHeader BMCDecodedMessage::decodedHeader() const {
    return _decodedHeader;
}

const Proto::SOP BMCDecodedMessage::decodedSOP() const {
    return _decodedSOP;
}

bool inline BMCDecodedMessage::_processBit(uint32_t edge) {
    // We start by checking whether we have already accumulated 5 bits.
    // That means that we are ready to process a new K-code.

    if (_decoderState.kCodeBitCount >= 5) {
        _decoderState.kCodeBitCount = 0;
        _decoderState.kCodeAccumulator = 0;
    }

    // If we skipped the previous pulse, this pulse is a one.
    // We set the corresponding bit in the K-code accumulator.

    if (_decoderState.skipNextPulse) {
        _decoderState.kCodeAccumulator |= 1 << _decoderState.kCodeBitCount;
        _decoderState.kCodeBitCount++;
        _decoderState.skipNextPulse = false;

        // We are done if we have accumulated 5 bits.

        return _decoderState.kCodeBitCount == 5;
    }

    // If this edge took more than 2/3 of the carrier length, it's a zero.
    // Otherwise, it's a one.

    if (edge < _carrierPulseHighBitThreshold) {
        // If the pulse is a one, we defer setting the bit to the next pulse.
        // This allows us to capture both pulses of the one bit--otherwise, if
        // we are at the end of a message, we'd ignore the second pulse and
        // misalign the stream.
        _decoderState.skipNextPulse = true;
    } else {
        // If the pulse is a one, we do nothing, as the bit is already zero.
        _decoderState.kCodeBitCount++;
    }

    // We are done if we have accumulated 5 bits.

    return _decoderState.kCodeBitCount == 5;
}

BMCDecodedMessageEvent inline BMCDecodedMessage::_processEdgeInPreambleState(uint32_t edge) {
    _decoderState.carrierAccumulator += (_decoderState.carrierEntryCount % 3 == 0) ? edge << 1 : edge;
    _decoderState.carrierEntryCount++;

    if (_decoderState.carrierEntryCount == 96) {
        // Preamble complete, move to ReadingSOP state
        
        _decoderState.state = _DecoderState::ReadingSOP;

        // Compute the carrier pulse length and high bit threshold.
        // The threshold is set to 2/3 of the carrier pulse length because
        // that's guaranteed to separate the high and low bits in a properly
        // formed BMC signal.

        _carrierPulseLength = static_cast<float>(_decoderState.carrierAccumulator) / 96;
        _carrierPulseHighBitThreshold = _carrierPulseLength * 2 / 3;

        return BMCDecodedMessageEvent::SOPStart;
    }

    if (_decoderState.carrierEntryCount == 1) {
        return BMCDecodedMessageEvent::PreambleStart;
    }

    return BMCDecodedMessageEvent::None;
}

BMCDecodedMessageEvent inline BMCDecodedMessage::_processEdgeInReadingSOPState(uint32_t edge) {
    if (_processBit(edge)) {
        _sop[_decoderState.sopIndex] = _decoderState.kCodeAccumulator;
        _decoderState.sopIndex++;

        // If we have accumulated 4 K-codes, we have the full SOP.
        // Move to the ReadingData state.

        if (_decoderState.sopIndex == 4) {
            _decodedSOP.bytes(std::span<const uint8_t, 4>(_sop));

            // Check if we're dealing with a hard reset

            if (_decodedSOP.type() == Proto::SOP::SOPType::HardReset) {
                _endTimestamp = time_us_64();
                _result = BMCDecodedMessageResult::Success;
                return BMCDecodedMessageEvent::HardResetReceived;
            }
            
            // SOP complete, move to ReadingData state
            _decoderState.state = _DecoderState::ReadingData;
            return BMCDecodedMessageEvent::HeaderStart;
        }
    }

    return BMCDecodedMessageEvent::None;
}

 BMCDecodedMessageEvent inline BMCDecodedMessage::_processEdgeInReadingDataState(uint32_t edge) {
    if (_processBit(edge)) {
    
        // If we have accumulated 5 bits, decode the K-code

        if (_decoderState.kCodeAccumulator == EOP_5B_VALUE) {
            // End of Packet detected, finalize message

            _endTimestamp = time_us_64();

            // Check the CRC
            if (!_validateCRC()) {
                _result = BMCDecodedMessageResult::CRCError;
                return BMCDecodedMessageEvent::CRCError;
            }

            _result = BMCDecodedMessageResult::Success;
            return BMCDecodedMessageEvent::MessageComplete;
        }

        uint8_t decodedNibble = _fiveToFourBitLUT[_decoderState.kCodeAccumulator];

        if (decodedNibble == INVALID_5B_VALUE) {
            // Invalid K-code detected
            _endTimestamp = time_us_64();
            _result = BMCDecodedMessageResult::InvalidKCode;

            return BMCDecodedMessageEvent::InvalidKCodeError;
        }

        _decoderState.kCodeAccumulator = 0;
        _decoderState.kCodeBitCount = 0;

        // Store the decoded nibble in the data buffer

        if (_decoderState.processingLSNibble) {
            _decoderState.currentByte = decodedNibble;
            _decoderState.processingLSNibble = false;
        } else {
            if (_dataLength >= PHY_BMC_DECODER_MAX_MESSAGE_DATA_SIZE) {
                _endTimestamp = time_us_64();
                _result = BMCDecodedMessageResult::InvalidKCode;
                return BMCDecodedMessageEvent::InvalidKCodeError;
            }

            _data[_dataLength++] = _decoderState.currentByte | (decodedNibble << 4);
            _decoderState.processingLSNibble = true;

            if (_dataLength == 2) {
                _decodedHeader.raw(static_cast<uint16_t>(_data[0] | (_data[1] << 8)));
                _decodedHeader.sop(_decodedSOP);

                return BMCDecodedMessageEvent::DataStart;
            }
        }
    }

    return BMCDecodedMessageEvent::None;
}

bool BMCDecodedMessage::_validateCRC() const {
    // Ensure that the message is at least 6 bytes long (header + CRC)
    if (_dataLength < 6) {
        return false;
    }

    // Extract the received CRC from the last 4 bytes of the data
    uint32_t receivedCRC = static_cast<uint32_t>(_data[_dataLength - 4]) |
                           (static_cast<uint32_t>(_data[_dataLength - 3]) << 8) |
                           (static_cast<uint32_t>(_data[_dataLength - 2]) << 16) |
                           (static_cast<uint32_t>(_data[_dataLength - 1]) << 24);

    // Compute the CRC over the data excluding the last 4 bytes (the CRC itself)
    uint32_t crc = 0xffffffff; // Initial CRC value

    for (size_t i = 0; i < _dataLength - 4; i++) {
        crc ^= _data[i];

        for (uint8_t bit = 0; bit < 8; ++bit) {
            if (crc & 1)
                crc = (crc >> 1) ^ 0xEDB88320U; // Reflected polynomial of 0x04C11DB7, as per USB-PD spec
            else
                crc >>= 1;
        }
    }

    return (crc ^ 0xffffffff) == receivedCRC;
}
