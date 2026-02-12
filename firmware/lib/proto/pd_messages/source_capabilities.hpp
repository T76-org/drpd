/**
 * @file source_capabilities.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * Source_Capabilities Message Encapsulation
 * 
 * The Source_Capabilities message is a Data Message containing 1-7 PDOs
 * describing the power supply capabilities of the source.
 * 
 * Message structure:
 *  - Header (16-bit): Contains NumDataObjects field
 *  - Payload: Array of 32-bit PDOs
 * 
 * Each PDO's type (bits 31:30) determines its specific format and interpretation.
 * 
 * Reference: USB Power Delivery Specification Rev 3.2, Section 6.4.1 - Source_Capabilities Message
 */

#pragma once

#include <array>
#include <cstdint>
#include <cstddef>
#include <memory>
#include <span>
#include <string>
#include <variant>

#include "pdo/pdo.hpp"
#include "pdo/pdo_fixed.hpp"
#include "pdo/pdo_variable.hpp"
#include "pdo/pdo_battery.hpp"
#include "pdo/pdo_augmented.hpp"


namespace T76::DRPD::Proto {

    // Type alias for variant holding any PDO type
    using PDOVariant = std::variant<FixedSupplyPDO, VariableSupplyPDO, BatterySupplyPDO, SPRPPSAPDO, SPRAVSAPDO, EPRAVSAPDO>;

    /**
     * @brief Source_Capabilities message encapsulation
     * 
     * Stores multiple PDOs with separate index tracking to maintain positional awareness.
     * Each PDO's position (0-6) is significant in USB-PD protocol negotiation.
     */
    class SourceCapabilities {
    public:
        /**
         * @brief Constructor from raw payload bytes
         * 
         * Decodes the raw payload bytes into typed PDO objects. Validates that the
         * number of PDOs matches the PDHeader.NumDataObjects field.
         * 
         * @param payload Raw payload bytes (multiple of 4 bytes, each 32-bit PDO)
         * @param numDataObjects Expected number of PDOs from PDHeader
         */
        SourceCapabilities(std::span<const uint8_t> payload = {}, uint32_t numDataObjects = 0);

        /**
         * @brief Check if the message contains invalid data
         * 
         * @return true if PDO count mismatch or any PDO validation failed
         */
        [[nodiscard]] bool isMessageInvalid() const;

        /**
         * @brief Get the number of valid PDOs
         */
        [[nodiscard]] size_t pdoCount() const;

        /**
         * @brief Get a PDO by index
         * 
         * @param index PDO index (0-6)
         * @return PDOVariant containing the typed PDO
         * @note Calling this when index is out of bounds results in undefined behavior
         */
        [[nodiscard]] const PDOVariant& pdo(size_t index) const;

        /**
         * @brief Find a PDO that is equal to the provided PDO
         * 
         * Searches through all PDOs in the capabilities to find one that matches
         * the provided PDO using the operator== comparison.
         * 
         * @param targetPDO The PDO to search for
         * @return 0-based index of the matching PDO, or -1 if not found
         */
        [[nodiscard]] int findPDO(const PDObject& targetPDO) const;

        /**
         * @brief Get human-readable string representation
         */
        [[nodiscard]] std::string toString() const;

        /**
         * @brief Find the best matching PDO for a given target voltage
         * 
         * Searches through all PDOs to find the one that best matches the target voltage.
         * - For Fixed Supply PDOs: Exact match when voltage equals target; otherwise eligible if below target
         * - For Variable/Battery/Augmented PDOs: Treat target as exact if it lies within the PDO's voltage range
         * 
         * The "best match" is defined as:
         * - Exact matches are preferred over inexact
         * - Among exact matches, choose the highest voltage not exceeding the target
         * - If no exact fixed PDO exists, a variable-range PDO that contains the target is allowed and considered exact
         * 
         * @param targetVoltageMillivolts Target voltage in millivolts
         * @return Structure containing:
         *   - pdo: Pointer to the best matching PDO (nullptr if no match found)
         *   - position: Position of the PDO in the capabilities list (0-6, or -1 if no match)
         *   - exactMatch: True if voltage exactly matches (Fixed) or is within range (Variable/Battery/Augmented)
         */
        struct PDOMatch {
            const PDOVariant* pdo;
            int position;
            bool exactMatch;
        };
        [[nodiscard]] PDOMatch findBestMatchingPDO(uint32_t targetVoltageMillivolts) const;

    protected:
        // Initialize array with default FixedSupplyPDO(0) for each element
        std::array<PDOVariant, 7> _pdos = {{
            FixedSupplyPDO(0), FixedSupplyPDO(0), FixedSupplyPDO(0), FixedSupplyPDO(0),
            FixedSupplyPDO(0), FixedSupplyPDO(0), FixedSupplyPDO(0)
        }};
        size_t _pdoCount = 0;
        bool _messageInvalid = false;

        /**
         * @brief Create a PDO from raw 32-bit value
         * 
         * @param raw 32-bit PDO value
         * @return PDOVariant containing the appropriate PDO type
         */
        [[nodiscard]] static PDOVariant _createPDO(uint32_t raw);
    };

} // namespace T76::DRPD::Proto
