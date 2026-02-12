/**
 * @file pd_header.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * The PDHeader class represents the 16-bit header of a USB Power Delivery
 * message. It provides methods to decode and interpret the various fields
 * of the header based on the USB-PD 3.2 specification.
 */

#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>

#include "pd_message_types.hpp"
#include "pd_sop.hpp"


namespace T76::DRPD::Proto {

    /**
     * @brief USB-PD 3.2 Message Header (16-bit)
     *
     * Keeps the header in its binary form and decodes fields dynamically.
     * SOP context is required to interpret Bit 8 and Bit 5.
     *
     * Message Header format (Table 6.1 "Message Header"):
     *  - Bit 15      : Extended
     *  - Bits 14..12 : Number of Data Objects
     *  - Bits 11..9  : MessageID
     *  - Bit 8       : SOP only Port Power Role; SOP'/SOP'' Cable Plug
     *  - Bits 7..6   : Specification Revision
     *  - Bit 5       : SOP only Port Data Role; SOP'/SOP'' Reserved
     *  - Bits 4..0   : Message Type (Control/Data/Extended per context)
     */
    class PDHeader {
    public:
        /**
         * @brief Class of the PD Message
         * 
         */
        enum class MessageClass {
            Extended,
            Control,
            Data
        };

        /**
         * @brief Port Power Role
         * 
         */
        enum class PortPowerRole {
            Sink,
            Source
        };

        /**
         * @brief Port Data Role
         * 
         */
        enum class PortDataRole {
            UFP,  // Upstream Facing Port
            DFP   // Downstream Facing Port
        };

        /**
         * @brief USB-PD Specification Revision encoded in bits 7..6.
         */
        enum class SpecRevision {
            Rev1_0 = 0,
            Rev2_0 = 1,
            Rev3_x = 2,
            Reserved = 3
        };

        /**
         * @brief Set the raw 16-bit header value.
         * 
         * @param raw The raw 16-bit header value.
         */
        void raw(uint16_t raw);

        /** 
         * @brief Returns the raw 16-bit header value.
         * 
         * @return uint16_t The raw 16-bit header value.
         */
        [[nodiscard]] uint16_t raw() const;

        /** 
         * @brief Set the SOP context for interpreting the header.
         * 
         * @param sop The SOP context.
         */
        void sop(const SOP& sop);

        /** 
         * @brief Returns the SOP context for interpreting the header.
         * 
         * @return const SOP& The SOP context.
         */
        [[nodiscard]] const SOP& sop() const;

        /** 
         * @brief Determines the class of the PD Message based on the header.
         * 
         * @return MessageClass The class of the PD Message.
         */
        [[nodiscard]] MessageClass messageClass() const;

        /** 
         * @brief Returns the Control Message Type if applicable.
         * 
         * @return std::optional<ControlMessageType> The Control Message Type, or std::nullopt if not a Control message.
         */
        [[nodiscard]] std::optional<ControlMessageType> controlMessageType() const;
        void controlMessageType(ControlMessageType type);

        /** 
         * @brief Returns the Data Message Type if applicable.
         * 
         * @return std::optional<DataMessageType> The Data Message Type, or std::nullopt if not a Data message.
         */
        [[nodiscard]] std::optional<DataMessageType> dataMessageType() const;

        /** 
         * @brief Set the Data Message Type.
         * 
         * @param type The Data Message Type.
         */
        void dataMessageType(DataMessageType type);

        /** 
         * @brief Returns the Extended Message Type if applicable.
         * 
         * @return std::optional<ExtendedMessageType> The Extended Message Type, or std::nullopt if not an Extended message.
         */
        [[nodiscard]] std::optional<ExtendedMessageType> extendedMessageType() const;

        /** 
         * @brief Set the Extended Message Type.
         * 
         * @param type The Extended Message Type.
         */
        void extendedMessageType(ExtendedMessageType type);

        /** 
         * @brief Returns whether the message is an Extended message.
         * 
         * @return true If the message is an Extended message.
         * @return false Otherwise.
         */
        [[nodiscard]] bool extended() const;

        /** 
         * @brief Set whether the message is an Extended message.
         * 
         * @param ext true to set as Extended message, false otherwise.
         */
        void extended(bool ext);

        /** 
         * @brief Returns the number of data objects in the message.
         * 
         * @return uint32_t The number of data objects.
         */
        [[nodiscard]] uint32_t numDataObjects() const;

        /** 
         * @brief Set the number of data objects in the message.
         * 
         * @param n The number of data objects.
         */
        void numDataObjects(uint32_t n);

        /** 
         * @brief Returns the Message ID.
         * 
         * @return uint32_t The Message ID.
         */
        [[nodiscard]] uint32_t messageId() const;

        /** 
         * @brief Set the Message ID.
         * 
         * @param id The Message ID.
         */
        void messageId(uint32_t id);

        /**
         * @brief Returns the Specification Revision as an enum.
         *
         * @return SpecRevision The Specification Revision.
         */
        [[nodiscard]] SpecRevision specRevision() const;

        /**
         * @brief Set the Specification Revision using the enum.
         *
         * @param rev The Specification Revision.
         */
        void specRevision(SpecRevision rev);

        /** 
         * @brief Returns the raw Message Type value.
         * 
         * @return uint32_t The raw Message Type value.
         */
        [[nodiscard]] uint32_t rawMessageType() const;

        /** 
         * @brief Set the raw Message Type value.
         * 
         * @param type The raw Message Type value.
         */
        void rawMessageType(uint32_t type);

        /** 
         * @brief Returns the Port Power Role for SOP messages.
         * 
         * @return std::optional<PortPowerRole> The Port Power Role, or std::nullopt if not SOP.
         */
        [[nodiscard]] std::optional<PortPowerRole> portPowerRole() const;

        /** 
         * @brief Set the Port Power Role for SOP messages.
         * 
         * @param role The Port Power Role.
         */
        void portPowerRole(PortPowerRole role);

        /** 
         * @brief Returns the Port Data Role for SOP messages.
         * 
         * @return std::optional<PortDataRole> The Port Data Role, or std::nullopt if not SOP.
         */
        [[nodiscard]] std::optional<PortDataRole> portDataRole() const;

        /** 
         * @brief Set the Port Data Role for SOP messages.
         * 
         * @param role The Port Data Role.
         */
        void portDataRole(PortDataRole role);

        /** 
         * @brief Returns a string representation of the PD Header.
         * 
         * @return std::string The string representation.
         */
        [[nodiscard]]
        std::string toString() const;

    protected:
        uint16_t _raw;
        SOP _sop;
    };

} // namespace T76::DRPD::Proto

