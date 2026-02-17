/**
 * @file bmc_encoded_message.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "bmc_encoded_message.hpp"

#include <algorithm>

#include "../proto/pd_messages/control.hpp"

#include "4b5b.hpp"
#include "bitpacker.hpp"


using namespace T76::DRPD::PHY;
using namespace T76::DRPD;


BMCEncodedMessage::BMCEncodedMessage(Proto::SOP::SOPType sopType, const Proto::PDMessage &message)
    : _sop(),
      _header(),
      _rawBody(),
      _rawBodyLength(0),
      _crc32(0) {
    const auto rawBody = message.raw();
    _rawBodyLength = std::min(rawBody.size(), _rawBody.size());
    for (size_t i = 0; i < _rawBodyLength; ++i) {
        _rawBody[i] = rawBody[i];
    }

    _sop.type(sopType);
    _header.rawMessageType(message.rawMessageType());
    _header.numDataObjects(message.numDataObjects());
}

BMCEncodedMessage BMCEncodedMessage::goodCRCMessageForMessage(const BMCDecodedMessage &decodedMessage) {
    Proto::SOP::SOPType sopType = decodedMessage.decodedSOP().type();

    auto controlMessage = Proto::ControlMessage();
    BMCEncodedMessage encodedMessage(
      sopType,
      controlMessage
    );

    // Set header fields

    Proto::PDHeader decodedHeader = decodedMessage.decodedHeader();
    Proto::PDHeader &header = encodedMessage.header();
    
    header.messageId(decodedHeader.messageId());
    header.rawMessageType(static_cast<uint32_t>(Proto::ControlMessageType::GoodCRC));
    header.numDataObjects(0);
    header.specRevision(decodedHeader.specRevision());
    
    auto portDataRole = decodedHeader.portDataRole();
    
    if (portDataRole.has_value()) {
        header.portDataRole(portDataRole.value() == Proto::PDHeader::PortDataRole::UFP
        ? Proto::PDHeader::PortDataRole::DFP
        : Proto::PDHeader::PortDataRole::UFP);
    }
    
    auto portPowerRole = decodedHeader.portPowerRole();
    
    if (portPowerRole.has_value()) {
        header.portPowerRole(portPowerRole.value() == Proto::PDHeader::PortPowerRole::Sink
        ? Proto::PDHeader::PortPowerRole::Source
        : Proto::PDHeader::PortPowerRole::Sink);
    }
    
    return encodedMessage;
}

BMCEncodedMessage BMCEncodedMessage::notAcceptedMessage(Proto::PDHeader::PortDataRole portDataRole, Proto::PDHeader::PortPowerRole portPowerRole) {
    auto controlMessage = Proto::ControlMessage();
    BMCEncodedMessage encodedMessage(
      Proto::SOP::SOPType::SOP,
      controlMessage
    );

    // Set header fields

    Proto::PDHeader &header = encodedMessage.header();
    
    header.messageId(0); // Message ID is set by the sender
    header.rawMessageType(static_cast<uint32_t>(Proto::ControlMessageType::Not_Supported));
    header.numDataObjects(0);
    header.specRevision(Proto::PDHeader::SpecRevision::Rev3_x); // PD 3.0
    header.portDataRole(portDataRole);
    header.portPowerRole(portPowerRole);
    
    return encodedMessage;
}

BMCEncodedMessage BMCEncodedMessage::softResetMessage(Proto::PDHeader::PortDataRole portDataRole, Proto::PDHeader::PortPowerRole portPowerRole) {
    auto controlMessage = Proto::ControlMessage();
    BMCEncodedMessage encodedMessage(
      Proto::SOP::SOPType::SOP,
      controlMessage
    );

    // Set header fields

    Proto::PDHeader &header = encodedMessage.header();
    
    header.messageId(0); // Message ID is set by the sender
    header.rawMessageType(static_cast<uint32_t>(Proto::ControlMessageType::Soft_Reset));
    header.numDataObjects(0);
    header.specRevision(Proto::PDHeader::SpecRevision::Rev3_x); // PD 3.0
    header.portDataRole(portDataRole);
    header.portPowerRole(portPowerRole);
    
    return encodedMessage;
}

BMCEncodedMessage BMCEncodedMessage::hardResetMessage() {
    auto controlMessage = Proto::ControlMessage();
    BMCEncodedMessage encodedMessage(
      Proto::SOP::SOPType::HardReset,
      controlMessage
    );

    // Set header fields

    Proto::PDHeader &header = encodedMessage.header();
    
    header.messageId(0); // Message ID is set by the sender
    header.rawMessageType(0); // Hard Reset has no message type
    header.numDataObjects(0);
    header.specRevision(Proto::PDHeader::SpecRevision::Rev3_x); // PD 3.0
    
    return encodedMessage;
}

Proto::PDHeader &BMCEncodedMessage::header() {
    return _header;
}

BitPacker BMCEncodedMessage::encoded() const {
    BitPacker bitPacker;

    bitPacker.addBits(0b1010'1010'1010'1010'1010'1010'1010'1010, 32); // 64 bits preamble
    bitPacker.addBits(0b1010'1010'1010'1010'1010'1010'1010'1010, 32); // 64 bits preamble

    // Encode the SOP

    for (const auto& kCode : _sop.bytes()) {
      bitPacker.addBits(kCode, 5);
    }

    // Encode the header

    _crc32 = 0xFFFFFFFF;

    uint16_t rawHeader = _header.raw();

    bitPacker.addBits(_fourToFiveBitLUT[rawHeader & 0x0F], 5);
    bitPacker.addBits(_fourToFiveBitLUT[(rawHeader >> 4) & 0x0F], 5);
    bitPacker.addBits(_fourToFiveBitLUT[(rawHeader >> 8) & 0x0F], 5);
    bitPacker.addBits(_fourToFiveBitLUT[(rawHeader >> 12) & 0x0F], 5);

    _updateCRC(static_cast<uint8_t>(rawHeader & 0xFF));
    _updateCRC(static_cast<uint8_t>((rawHeader >> 8) & 0xFF));

    // Encode the body

    for (size_t i = 0; i < _rawBodyLength; ++i) {
        const uint8_t byte = _rawBody[i];
        bitPacker.addBits(_fourToFiveBitLUT[byte & 0x0F], 5);
        bitPacker.addBits(_fourToFiveBitLUT[(byte >> 4) & 0x0F], 5);
        _updateCRC(byte);
    }

    // Encode CRC32

    uint32_t crcFinal = ~_crc32;

    for (int i = 0; i < 4; ++i) {
      uint8_t byte = (crcFinal >> (i * 8)) & 0xFF;
      bitPacker.addBits(_fourToFiveBitLUT[byte & 0x0F], 5);
      bitPacker.addBits(_fourToFiveBitLUT[(byte >> 4) & 0x0F], 5);
    }

    // Encode EOP K-code

    bitPacker.addBits(EOP_5B_VALUE, 5); // EOP K-code

    // Finalize the bitstream and return it

    bitPacker.flush();

    return bitPacker;
}

void inline BMCEncodedMessage::_updateCRC(const uint8_t datum) const {
    _crc32 ^= static_cast<uint32_t>(datum);

    for (int i = 0; i < 8; ++i) {
        if (_crc32 & 1) {
            _crc32 = (_crc32 >> 1) ^ 0xEDB88320;
        } else {
            _crc32 >>= 1;
        }
    }
}
