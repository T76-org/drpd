/**
 * @file pdo_variable.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * Variable Supply (non-battery) PDO (bits 31:30 = 10)
 * 
 * Variable Supply PDO format (Table 6.8 "Variable Supply (non-battery) PDO"):
 *  - Bits 31:30 : PDO Type = 10
 *  - Bits 29:20 : Maximum Voltage in 50mV units
 *  - Bits 19:10 : Minimum Voltage in 50mV units
 *  - Bits 9:0   : Maximum Current in 10mA units
 * 
 * Reference: USB Power Delivery Specification Rev 3.2, Section 6.4.1.6
 */

#pragma once

#include "pdo.hpp"


namespace T76::DRPD::Proto {

    /** 
     * @brief Variable Supply PDO
     * 
     * Variable Supply PDO format (Table 6.8 "Variable Supply (non-battery) PDO"):
     *  - Bits 31:30 : PDO Type = 10
     *  - Bits 29:20 : Maximum Voltage in 50mV units
     *  - Bits 19:10 : Minimum Voltage in 50mV units
     *  - Bits 9:0   : Maximum Current in 10mA units
     * 
     */
    class VariableSupplyPDO : public PDObject {
    public:
        /**
         * @brief Constructor from raw 32-bit PDO value
         * 
         * @param raw The raw PDO value
         */
        explicit VariableSupplyPDO(uint32_t raw);

        /**
         * @brief Get the PDO type
         */
        [[nodiscard]] PDOType type() const override;

        /**
         * @brief Get maximum voltage in millivolts
         */
        [[nodiscard]] uint32_t maxVoltageMillivolts() const;

        /**
         * @brief Get minimum voltage in millivolts
         */
        [[nodiscard]] uint32_t minVoltageMillivolts() const;

        /**
         * @brief Get maximum current in milliamps
         */
        [[nodiscard]] uint32_t maxCurrentMilliamps() const;

        /**
         * @brief Get human-readable string representation
         */
        [[nodiscard]] std::string toString() const override;
    };

} // namespace T76::DRPD::Proto
