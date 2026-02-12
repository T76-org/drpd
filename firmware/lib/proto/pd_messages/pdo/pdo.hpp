/**
 * @file pdo.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * USB Power Delivery Data Object (PDO) Base Class
 * 
 * PDO structure (32-bit):
 *  - Bits 31:30 : PDO type (00=Fixed, 01=Battery, 10=Variable, 11=Augmented)
 *  - Remaining bits depend on PDO type
 * 
 * Reference: USB Power Delivery Specification Rev 3.2, Section 6.4.1
 */

#pragma once

#include <cstdint>
#include <string>


namespace T76::DRPD::Proto {

    /**
     * @brief Base class for all PDO types
     * 
     * Each PDO is stored as a raw 32-bit value. Subclasses decode specific fields.
     * PDOs are immutable once created; validation occurs during construction.
     */
    class PDObject {
    public:
        enum class PDOType : uint32_t {
            FixedSupply = 0,
            BatterySupply = 1,
            VariableSupply = 2,
            Augmented = 3
        };

        virtual ~PDObject() = default;

        /**
         * @brief Get the raw 32-bit PDO value
         */
        [[nodiscard]] uint32_t raw() const;

        /**
         * @brief Get the PDO type
         */
        [[nodiscard]] virtual PDOType type() const = 0;

        /**
         * @brief Check if the PDO contains invalid data
         * 
         * @return true if validation failed during construction
         */
        [[nodiscard]] bool isMessageInvalid() const;

        /**
         * @brief Get a human-readable string representation of the PDO
         */
        [[nodiscard]] virtual std::string toString() const = 0;

        /**
         * @brief Compare two PDO objects for equality
         * 
         * Two PDOs are considered equal if they have the same raw value.
         * 
         * @param other The PDO object to compare with
         * @return true if both PDOs have the same raw value, false otherwise
         */
        bool operator==(const PDObject& other) const;

    protected:
        uint32_t _raw = 0;
        bool _messageInvalid = false;

        /**
         * @brief Protected constructor for subclasses
         * 
         * @param raw The raw 32-bit PDO value
         */
        explicit PDObject(uint32_t raw);
    };

} // namespace T76::DRPD::Proto
