/**
 * @file epr_mode.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 *
 * EPR_Mode Message Encapsulation
 *
 * The EPR_Mode message is a Data Message containing a single 32-bit EPR Mode Data Object
 * (EPRMDO) used to enter, acknowledge, and exit EPR Mode. The Action field describes the
 * action to be taken, and the Data field provides additional context.
 *
 * Message structure:
 *  - Header (16-bit): Contains message type and metadata
 *  - Payload: Single 32-bit EPR Mode Data Object
 *
 * Reference: USB Power Delivery Specification Rev 3.2, Section 6.4.10 - EPR_Mode Message
 *            Table 6.50 - EPR Mode Data Object (EPRMDO)
 */

#pragma once

#include <cstdint>
#include <cstddef>
#include <string>
#include <array>
#include <span>

#include "../pd_message.hpp"


namespace T76::DRPD::Proto {

    /**
     * @brief EPR_Mode message encapsulation
     *
     * Encapsulates a single EPR Mode Data Object (EPRMDO) that communicates EPR mode
     * transition actions and status between source and sink devices.
     *
     * EPR Mode Data Object (EPRMDO) format (Table 6.50):
     *  - Bits 31:24 : Action (0x01=Enter, 0x02=Enter Acknowledged, 0x03=Enter Succeeded,
     *                         0x04=Enter Failed, 0x05=Exit, others=Reserved)
     *  - Bits 23:16 : Data (varies by Action: PDP value, failure reason, or zero)
     *  - Bits 15:0  : Reserved (shall be 0)
     */
    class EPRMode : public PDMessage {
    public:
        /**
         * @brief EPR_Mode Action values
         *
         * Reference: Table 6.50, Bits 31:24
         */
        enum class Action : uint8_t {
            Enter = 0x01,                 ///< Sink initiates EPR Mode entry
            EnterAcknowledged = 0x02,     ///< Source acknowledges Enter request
            EnterSucceeded = 0x03,        ///< Source confirms successful EPR entry
            EnterFailed = 0x04,           ///< Source reports EPR entry failure
            Exit = 0x05                   ///< Exit EPR Mode (Sink or Source)
        };

        /**
         * @brief EPR_Mode Enter Failed reasons
         *
         * Data field values when Action = EnterFailed
         */
        enum class FailureReason : uint8_t {
            UnknownCause = 0x00,          ///< Unknown cause
            CableNotEprCapable = 0x01,    ///< Cable not EPR Capable
            SourceNotVconnSource = 0x02,  ///< Source failed to become VCONN Source
            EprCapableNotInRdo = 0x03,    ///< EPR Capable bit not set in RDO
            SourceCannotEnterEpr = 0x04,  ///< Source unable to enter EPR Mode
            EprCapableNotInPdo = 0x05     ///< EPR Capable bit not set in PDO
        };

        /**
         * @brief Constructor from raw 32-bit EPRMDO value
         *
         * @param raw The raw EPR Mode Data Object value
         */
        explicit EPRMode(uint32_t raw = 0);

        /**
         * @brief Constructor from Action and optional Data
         *
         * @param action The EPR_Mode action
         * @param data Optional data field value (varies by action)
         */
        explicit EPRMode(Action action, uint8_t data = 0);

        virtual ~EPRMode() = default;

        /**
         * @brief Get the raw 32-bit EPRMDO value
         *
         * @return std::span<const uint8_t> The raw EPRMDO bytes in little-endian
         */
        [[nodiscard]] std::span<const uint8_t> raw() const override;

        /**
         * @brief Get the number of Data Objects
         *
         * @return Always 1 for an EPR_Mode message
         */
        [[nodiscard]] uint32_t numDataObjects() const override;

        /**
         * @brief Get the raw Message Type value for this message
         *
         * @return The Data Message Type for EPR_Mode (0x0A)
         */
        [[nodiscard]] uint32_t rawMessageType() const override;

        /**
         * @brief Check if the EPR Mode message is invalid
         *
         * @return true if action is invalid or reserved bits are not zero
         */
        [[nodiscard]] bool isMessageInvalid() const;

        /**
         * @brief Get the Action field (bits 31:24)
         *
         * @return The Action value
         */
        [[nodiscard]] Action action() const;

        /**
         * @brief Set the Action field (bits 31:24)
         *
         * @param value The Action to set
         */
        void action(Action value);

        /**
         * @brief Get the Data field (bits 23:16)
         *
         * Meaning depends on the Action field:
         * - Enter: EPR Sink Operational PDP value
         * - Enter Acknowledged: 0
         * - Enter Succeeded: 0
         * - Enter Failed: FailureReason value
         * - Exit: 0
         *
         * @return The Data field value
         */
        [[nodiscard]] uint8_t data() const;

        /**
         * @brief Set the Data field (bits 23:16)
         *
         * @param value The Data field value
         */
        void data(uint8_t value);

        /**
         * @brief Get human-readable string representation
         *
         * @return std::string A formatted string describing the EPR Mode message
         */
        [[nodiscard]] std::string toString() const;

    protected:
        uint32_t _raw = 0;
        mutable std::array<uint8_t, 4> _rawBytes = {};
        bool _messageInvalid = false;

        /**
         * @brief Validate the EPRMDO
         *
         * Checks that:
         * - Action field contains a valid value
         * - Reserved bits (15:0) are zero
         *
         * @return true if valid, false otherwise
         */
        bool _validate();

        /**
         * @brief Convert Action enum to string
         *
         * @param action The action to convert
         * @return String representation of the action
         */
        [[nodiscard]] static std::string _actionToString(Action action);

        /**
         * @brief Convert FailureReason enum to string
         *
         * @param reason The failure reason to convert
         * @return String representation of the failure reason
         */
        [[nodiscard]] static std::string _failureReasonToString(FailureReason reason);
    };

} // namespace T76::DRPD::Proto
