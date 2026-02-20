/**
 * @file pdo_augmented.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * Augmented Power Data Object (APDO) Classes
 * 
 * APDOs support three distinct types defined in USB-PD 3.2:
 * 1. SPR PPS (Programmable Power Supply) - bits 29:28 = 00
 * 2. EPR AVS (Extended Power Range AVS) - bits 29:28 = 01
 * 3. SPR AVS (Adjustable Voltage Supply) - bits 29:28 = 10
 * 
 * All APDOs share the PDO Type field (bits 31:30 = 11).
 * 
 * Reference: USB Power Delivery Specification Rev 3.2, Section 6.4.1.8
 */

#pragma once

#include <memory>
#include "pdo.hpp"


namespace T76::DRPD::Proto {

    /**
     * @brief Base class for all Augmented Power Data Objects (APDOs)
     * 
     * Provides common functionality and interface for all APDO subtypes:
     * - SPR PPS (Programmable Power Supply)
     * - SPR AVS (Adjustable Voltage Supply)
     * - EPR AVS (Extended Power Range AVS)
     */
    class AugmentedPDO : public PDObject {
    public:
        enum class APDOType : uint32_t {
            SPR_PPS = 0,  // Bits 29:28 = 00
            EPR_AVS = 1,  // Bits 29:28 = 01
            SPR_AVS = 2   // Bits 29:28 = 10
        };

        virtual ~AugmentedPDO() = default;

        /**
         * @brief Get the PDO type
         */
        [[nodiscard]] PDOType type() const final;

        /**
         * @brief Get the APDO subtype (PPS, SPR AVS, or EPR AVS)
         */
        [[nodiscard]] virtual APDOType apdoType() const = 0;

        /**
         * @brief Get human-readable string representation
         */
        [[nodiscard]] std::string toString() const override = 0;

    protected:
        /**
         * @brief Protected constructor for subclasses
         * 
         * @param raw The raw PDO value
         */
        explicit AugmentedPDO(uint32_t raw);

        /**
         * @brief Validates common APDO fields
         * 
         * Checks:
         * - Bits 31:30 are 11 (Augmented type)
         * - Bits 29:28 are valid APDO type
         * 
         * @return true if validation passes, false otherwise
         */
        bool validateCommonFields();

        /**
         * @brief Get the APDO type field (bits 29:28)
         */
        [[nodiscard]] APDOType getAPDOTypeField() const;
    };


    /**
     * @brief SPR PPS (Programmable Power Supply) - bits 29:28 = 00
     * 
     * Format:
     *  - Bits 31:30 : PDO Type = 11
     *  - Bits 29:28 : APDO Type = 00 (PPS)
     *  - Bit 27     : PPS Power Limited
     *  - Bits 26:25 : Reserved (shall be 0)
     *  - Bits 24:17 : Maximum Voltage in 100mV units
     *  - Bit 16     : Reserved (shall be 0)
     *  - Bits 15:8  : Minimum Voltage in 100mV units
     *  - Bit 7      : Reserved (shall be 0)
     *  - Bits 6:0   : Maximum Current in 50mA units
     */
    class SPRPPSAPDO : public AugmentedPDO {
    public:
        explicit SPRPPSAPDO(uint32_t raw);

        [[nodiscard]] APDOType apdoType() const override;

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

        [[nodiscard]] std::string toString() const override;
    };


    /**
     * @brief SPR AVS (Adjustable Voltage Supply) - bits 29:28 = 10
     * 
     * Format:
     *  - Bits 31:30 : PDO Type = 11
     *  - Bits 29:28 : APDO Type = 10 (SPR AVS)
     *  - Bits 27:26 : Peak Current
     *  - Bits 25:20 : Reserved (shall be 0)
     *  - Bits 19:10 : Maximum Current 15V in 10mA units
     *  - Bits 9:0   : Maximum Current 20V in 10mA units
     */
    class SPRAVSAPDO : public AugmentedPDO {
    public:
        explicit SPRAVSAPDO(uint32_t raw);

        [[nodiscard]] APDOType apdoType() const override;

        /**
         * @brief Get peak current capability code (Table 6.10 encoding).
         */
        [[nodiscard]] uint32_t peakCurrentCode() const;

        /**
         * @brief Get maximum supported current in 9-15V band (milliamps).
         */
        [[nodiscard]] uint32_t maxCurrent15VMilliamps() const;

        /**
         * @brief Get maximum supported current in 15-20V band (milliamps).
         *        Zero indicates this band is not supported.
         */
        [[nodiscard]] uint32_t maxCurrent20VMilliamps() const;

        /**
         * @brief Get effective minimum voltage in millivolts (SPR AVS fixed 9V lower bound).
         */
        [[nodiscard]] uint32_t minVoltageMillivolts() const;

        /**
         * @brief Get effective maximum voltage in millivolts (15V or 20V depending on B9:0).
         */
        [[nodiscard]] uint32_t maxVoltageMillivolts() const;

        /**
         * @brief Get maximum deliverable power in milliwatts (derived from band currents).
         */
        [[nodiscard]] uint32_t maxPowerMilliwatts() const;

        [[nodiscard]] std::string toString() const override;
    };


    /**
     * @brief EPR AVS (Extended Power Range AVS) - bits 29:28 = 01
     * 
     * Format:
     *  - Bits 31:30 : PDO Type = 11
     *  - Bits 29:28 : APDO Type = 01 (EPR AVS)
     *  - Bits 27:26 : Peak Current (Source EPR AVS)
     *  - Bits 25:17 : Maximum Voltage in 100mV units
     *  - Bit 16     : Reserved (shall be 0)
     *  - Bits 15:8  : Minimum Voltage in 100mV units
     *  - Bits 7:0   : PDP in 1W units
     */
    class EPRAVSAPDO : public AugmentedPDO {
    public:
        explicit EPRAVSAPDO(uint32_t raw);

        [[nodiscard]] APDOType apdoType() const override;

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

        [[nodiscard]] std::string toString() const override;
    };

} // namespace T76::DRPD::Proto
