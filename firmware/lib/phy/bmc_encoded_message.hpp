/**
 * @file bmc_encoded_message.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * BMCEncodedMessage represents a USB-PD message that has been encoded
 * and can be transmitted using BMC encoding.
 * 
 * In accordance with the spec, a message is made up of three main parts:
 * 
 * - The Start of Packet (SOP) K-code sequence (4 bytes)
 * - The 16-bit header
 * - The message body (0 or more data objects)
 * 
 * The BMCEncodedMessage class takes a SOP type and a PDMessage object,
 * constructs the appropriate encoded representation, including calculating
 * the CRC32 checksum, and provides a BitPacker that can be used to
 * transmit the message using BMC encoding.
 * 
 */

#pragma once

#include <memory>
#include <vector>
#include <cstdint>

#include "../proto/pd_header.hpp"
#include "../proto/pd_sop.hpp"

#include "../proto/pd_message.hpp"

#include "bitpacker.hpp"
#include "bmc_decoded_message.hpp"


using namespace T76::DRPD;


namespace T76::DRPD::PHY {

    /** 
     * @brief Represents a BMC-encoded USB-PD message ready for transmission.
     * 
     * BMCEncodedMessage represents a USB-PD message that has been encoded
     * and can be transmitted using BMC encoding.
     * 
     * In accordance with the spec, a message is made up of three main parts:
     * 
     * - The Start of Packet (SOP) K-code sequence (4 bytes)
     * - The 16-bit header
     * - The message body (0 or more data objects)
     * 
     * The BMCEncodedMessage class takes a SOP type and a PDMessage object,
     * constructs the appropriate encoded representation, including calculating
     * the CRC32 checksum, and provides a BitPacker that can be used to
     * transmit the message using BMC encoding.
     */
    class BMCEncodedMessage {
    public:
        /** 
         * @brief Construct a new BMC Encoded Message object
         * 
         * @param sopType The SOP type of the message.
         * @param message A PDMessage to encode (polymorphic, passed by reference).
         */
        BMCEncodedMessage(Proto::SOP::SOPType sopType, const Proto::PDMessage &message);

        /** 
         * @brief Create a BMCEncodedMessage representing a GoodCRC response
         *        for the given decoded message.
         * 
         * @param decodedMessage The decoded message to respond to.
         * @return BMCEncodedMessage The GoodCRC response message.
         */
        static BMCEncodedMessage goodCRCMessageForMessage(const BMCDecodedMessage &decodedMessage);

        /** 
         * @brief Create a BMCEncodedMessage representing a Not_Accepted response.
         * 
         * @param portDataRole The port data role to set in the header.
         * @param portPowerRole The port power role to set in the header.
         * @return BMCEncodedMessage The Not_Accepted response message.
         */
        static BMCEncodedMessage notAcceptedMessage(Proto::PDHeader::PortDataRole portDataRole, Proto::PDHeader::PortPowerRole portPowerRole);

        /** 
         * @brief Create a BMCEncodedMessage representing a Soft_Reset message.
         * 
         * @param messageID The message ID to set in the header.
         * @param portDataRole The port data role to set in the header.
         * @param portPowerRole The port power role to set in the header.
         * @return BMCEncodedMessage The Soft_Reset message.
         */
        static BMCEncodedMessage softResetMessage(Proto::PDHeader::PortDataRole portDataRole, Proto::PDHeader::PortPowerRole portPowerRole);

        /** 
         * @brief Create a BMCEncodedMessage representing a Hard_Reset message.
         * 
         * @return BMCEncodedMessage The Hard_Reset message.
         */
        static BMCEncodedMessage hardResetMessage();

        /** 
         * @brief Returns the SOP object of the message.
         * 
         * @return Proto::SOP& The SOP object.
         */
        Proto::PDHeader &header();

        /**
         * @brief Returns an encoded BitPacker for the message.
         * 
         * The resulting BitPacker contains the entire bitstream
         * sequence for the message, including the 64-bit preamble.
         * 
         * @return std::unique_ptr<BitPacker> 
         */
        std::unique_ptr<BitPacker> encoded() const;

    protected:
        Proto::SOP _sop; ///< The SOP object
        Proto::PDHeader _header; ///< The PDHeader object
        std::vector<uint8_t> _rawBody; ///< Serialized message body bytes

        mutable uint32_t _crc32; ///< Scratch space for CRC32 calculation while encoding

        /** 
         * @brief Update the CRC32 checksum with the given byte.
         * 
         * The encoded() method uses this to compute the CRC32
         * while encoding the message.
         * 
         * @param datum The byte to update the CRC with.
         */
        void _updateCRC(const uint8_t datum) const;
    };
    
} // namespace T76::DRPD::PHY
