/**
 * @file pdo_fixed.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * Fixed Supply PDO (bits 31:30 = 00)
 * 
 * Fixed Supply PDO format (Table 6-9 "Fixed Supply PDO - Source"):
 *  - Bits 31:30 : PDO Type = 00
 *  - Bit 29     : Dual-Role Power
 *  - Bit 28     : USB Suspend Supported
 *  - Bit 27     : Unconstrained Power
 *  - Bit 26     : USB Communications Capable
 *  - Bit 25     : Dual-Role Data
 *  - Bit 24     : Unchunked Extended Messages Supported
 *  - Bit 23     : EPR Mode Capable
 *  - Bit 22     : Reserved (shall be 0)
 *  - Bits 21:20 : Peak Current
 *  - Bits 19:10 : Voltage in 50mV units
 *  - Bits 9:0   : Maximum Current in 10mA units
 * 
 * Reference: USB Power Delivery Specification Rev 3.2, Section 6.4.1.2
 */

#pragma once

#include "pdo.hpp"


namespace T76::DRPD::Proto {

    /** 
     * @brief Fixed Supply PDO
     * 
     * Fixed Supply PDO format (Table 6-9 "Fixed Supply PDO - Source"):
     *  - Bits 31:30 : PDO Type = 00
     *  - Bit 29     : Dual-Role Power
     *  - Bit 28     : USB Suspend Supported
     *  - Bit 27     : Unconstrained Power
     *  - Bit 26     : USB Communications Capable
     *  - Bit 25     : Dual-Role Data
     *  - Bit 24     : Unchunked Extended Messages Supported
     *  - Bit 23     : EPR Mode Capable
     *  - Bit 22     : Reserved (shall be 0)
     *  - Bits 21:20 : Peak Current
     *  - Bits 19:10 : Voltage in 50mV units
     *  - Bits 9:0   : Maximum Current in 10mA units
     * 
     */
    class FixedSupplyPDO : public PDObject {
    public:
        /**
         * @brief Peak Current Capability enumeration
         */
        enum class PeakCurrentCapability : uint32_t {
            IOc_Default = 0,
            IOc_Overload_1 = 1,
            IOc_Overload_2 = 2,
            IOc_Overload_3 = 3
        };

        /**
         * @brief Constructor from raw 32-bit PDO value
         * 
         * @param raw The raw PDO value
         */
        explicit FixedSupplyPDO(uint32_t raw);

        /**
         * @brief Get the PDO type
         */
        [[nodiscard]] PDOType type() const override;

        /**
         * @brief Get voltage in millivolts
         */
        [[nodiscard]] uint32_t voltageMillivolts() const;

        /**
         * @brief Get maximum current in milliamps
         */
        [[nodiscard]] uint32_t maxCurrentMilliamps() const;

        /**
         * @brief Get peak current capability
         */
        [[nodiscard]] PeakCurrentCapability peakCurrentCapability() const;

        /**
         * @brief Check if Dual-Role Power is supported
         */
        [[nodiscard]] bool dualRolePower() const;

        /**
         * @brief Check if USB Suspend is supported
         */
        [[nodiscard]] bool usbSuspendSupported() const;

        /**
         * @brief Check if Unconstrained Power is supported
         */
        [[nodiscard]] bool unconstrainedPower() const;

        /**
         * @brief Check if USB Communications is capable
         */
        [[nodiscard]] bool usbCommunicationsCapable() const;

        /**
         * @brief Check if Dual-Role Data is supported
         */
        [[nodiscard]] bool dualRoleData() const;

        /**
         * @brief Check if Unchunked Extended Messages are supported
         */
        [[nodiscard]] bool unchunkedExtendedMessageSupported() const;

        /**
         * @brief Check if EPR Mode is capable
         */
        [[nodiscard]] bool eprModeCapable() const;

        /**
         * @brief Get human-readable string representation
         */
        [[nodiscard]] std::string toString() const override;
    };

} // namespace T76::DRPD::Proto
