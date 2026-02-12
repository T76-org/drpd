/**
 * @file pdo_battery.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * Battery Supply PDO (bits 31:30 = 01)
 * 
 * Battery Supply PDO format (Table 6.9 "Battery Supply PDO"):
 *  - Bits 31:30 : PDO Type = 01
 *  - Bits 29:20 : Maximum Voltage in 50mV units
 *  - Bits 19:10 : Minimum Voltage in 50mV units
 *  - Bits 9:0   : Maximum Power in 250mW units
 * 
 * Reference: USB Power Delivery Specification Rev 3.2, Section 6.4.1.7
 */

#pragma once

#include "pdo.hpp"


namespace T76::DRPD::Proto {

    /** 
     * @brief Battery Supply PDO
     * 
     * Battery Supply PDO format (Table 6.9 "Battery Supply PDO"):
     *  - Bits 31:30 : PDO Type = 01
     *  - Bits 29:20 : Maximum Voltage in 50mV units
     *  - Bits 19:10 : Minimum Voltage in 50mV units
     *  - Bits 9:0   : Maximum Power in 250mW units
     * 
     */
    class BatterySupplyPDO : public PDObject {
    public:
        /**
         * @brief Constructor from raw 32-bit PDO value
         * 
         * @param raw The raw PDO value
         */
        explicit BatterySupplyPDO(uint32_t raw);

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
         * @brief Get maximum power in milliwatts
         */
        [[nodiscard]] uint32_t maxPowerMilliwatts() const;

        /**
         * @brief Get human-readable string representation
         */
        [[nodiscard]] std::string toString() const override;
    };

} // namespace T76::DRPD::Proto
