/**
 * @file request.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * USB Power Delivery Request Data Object (RDO)
 * 
 * The Request Data Object (RDO) is a 32-bit field sent by the Sink to the Source
 * to negotiate power contract. The format of the RDO depends on the type of
 * Power Data Object (PDO) being requested.
 * 
 * Reference: USB Power Delivery Specification Rev 3.2, Section 6.4.2
 */

#pragma once

#include <array>
#include <cstdint>
#include <string>

#include "../pd_message.hpp"

namespace T76::DRPD::Proto {

    /**
     * @brief Base class for Request Data Objects
     */
    class Request : public PDMessage {
    public:
        /**
         * @brief Constructor from raw 32-bit RDO value
         * 
         * @param raw The raw RDO value
         */
        explicit Request(uint32_t raw = 0);

        virtual ~Request() = default;

        /**
         * @brief Get the raw 32-bit RDO value
         * 
         * @return std::span<const uint8_t> The raw RDO bytes
         */
        [[nodiscard]] virtual std::span<const uint8_t> raw() const override;

        /**
         * @brief Get the number of Data Objects
         * 
         * return Always 1 for a Request message
         */
        [[nodiscard]] virtual uint32_t numDataObjects() const override;

        /**
         * @brief Get the Message Class type
         * 
         * return Always Data for a Request message
         */
        [[nodiscard]] virtual uint32_t rawMessageType() const override;

        /**
         * @brief Get the Object Position (1-15) of the PDO being requested
         *
         * Bits 31:28
         */
        [[nodiscard]] uint8_t objectPosition() const;

        /**
         * @brief Set the Object Position (1-15) of the PDO being requested
         *
         * @param position Position (1-15)
         */
        void objectPosition(uint8_t position);

        /**
         * @brief Check if GiveBack flag is set
         * 
         * Bit 27
         */
        [[nodiscard]] bool giveBackFlag() const;

        /**
         * @brief Set the GiveBack flag
         * 
         * @param value true to set, false to clear
         */
        void giveBackFlag(bool value);

        /**
         * @brief Check if Capability Mismatch flag is set
         * 
         * Bit 26
         */
        [[nodiscard]] bool capabilityMismatch() const;

        /**
         * @brief Set the Capability Mismatch flag
         * 
         * @param value true to set, false to clear
         */
        void capabilityMismatch(bool value);

        /**
         * @brief Check if USB Communications Capable flag is set
         * 
         * Bit 25
         */
        [[nodiscard]] bool usbCommunicationsCapable() const;

        /**
         * @brief Set the USB Communications Capable flag
         * 
         * @param value true to set, false to clear
         */
        void usbCommunicationsCapable(bool value);

        /**
         * @brief Check if No USB Suspend flag is set
         * 
         * Bit 24
         */
        [[nodiscard]] bool noUsbSuspend() const;

        /**
         * @brief Set the No USB Suspend flag
         * 
         * @param value true to set, false to clear
         */
        void noUsbSuspend(bool value);

        /**
         * @brief Check if Unchunked Extended Message Supported flag is set
         * 
         * Bit 23
         */
        [[nodiscard]] bool unchunkedExtendedMessageSupported() const;

        /**
         * @brief Set the Unchunked Extended Message Supported flag
         * 
         * @param value true to set, false to clear
         */
        void unchunkedExtendedMessageSupported(bool value);

        /**
         * @brief Check if EPR Mode Capable flag is set
         *
         * Bit 22
         */
        [[nodiscard]] bool eprModeCapable() const;

        /**
         * @brief Set the EPR Mode Capable flag
         *
         * @param value true to set, false to clear
         */
        void eprModeCapable(bool value);

        /**
         * @brief Get human-readable string representation
         */
        [[nodiscard]] virtual std::string toString() const;

    protected:
        uint32_t _raw; ///< The raw 32-bit RDO value
        mutable std::array<uint8_t, 4> _rawBytes; ///< Buffer for raw bytes
    };

    /**
     * @brief Request Data Object for Fixed and Variable Supply PDOs
     * 
     * Reference: Table 6-18 "Fixed and Variable Request Data Object"
     */
    class FixedVariableRequest : public Request {
    public:
        explicit FixedVariableRequest(uint32_t raw);

        /**
         * @brief Get Operating Current in milliamps
         * 
         * Bits 19:10 (10mA units)
         */
        [[nodiscard]] uint32_t operatingCurrentMilliamps() const;

        /**
         * @brief Set Operating Current in milliamps
         * 
         * @param milliamps Current in milliamps (10mA units)
         */
        void operatingCurrentMilliamps(uint32_t milliamps);

        /**
         * @brief Get Maximum Operating Current in milliamps
         * 
         * Bits 9:0 (10mA units)
         * Valid when GiveBack flag is NOT set.
         */
        [[nodiscard]] uint32_t maxOperatingCurrentMilliamps() const;

        /**
         * @brief Set Maximum Operating Current in milliamps
         * 
         * @param milliamps Current in milliamps (10mA units)
         * Valid when GiveBack flag is NOT set.
         */
        void maxOperatingCurrentMilliamps(uint32_t milliamps);

        /**
         * @brief Get Minimum Operating Current in milliamps
         * 
         * Bits 9:0 (10mA units)
         * Valid when GiveBack flag IS set.
         */
        [[nodiscard]] uint32_t minOperatingCurrentMilliamps() const;

        /**
         * @brief Set Minimum Operating Current in milliamps
         * 
         * @param milliamps Current in milliamps (10mA units)
         * Valid when GiveBack flag IS set.
         */
        void minOperatingCurrentMilliamps(uint32_t milliamps);

        [[nodiscard]] std::string toString() const override;
    };

    /**
     * @brief Request Data Object for Battery Supply PDOs
     * 
     * Reference: Table 6-19 "Battery Request Data Object"
     */
    class BatteryRequest : public Request {
    public:
        explicit BatteryRequest(uint32_t raw);

        /**
         * @brief Get Operating Power in milliwatts
         * 
         * Bits 19:10 (250mW units)
         */
        [[nodiscard]] uint32_t operatingPowerMilliwatts() const;

        /**
         * @brief Set Operating Power in milliwatts
         * 
         * @param milliwatts Power in milliwatts (250mW units)
         */
        void operatingPowerMilliwatts(uint32_t milliwatts);

        /**
         * @brief Get Maximum Operating Power in milliwatts
         * 
         * Bits 9:0 (250mW units)
         * Valid when GiveBack flag is NOT set.
         */
        [[nodiscard]] uint32_t maxOperatingPowerMilliwatts() const;

        /**
         * @brief Set Maximum Operating Power in milliwatts
         * 
         * @param milliwatts Power in milliwatts (250mW units)
         * Valid when GiveBack flag is NOT set.
         */
        void maxOperatingPowerMilliwatts(uint32_t milliwatts);

        /**
         * @brief Get Minimum Operating Power in milliwatts
         * 
         * Bits 9:0 (250mW units)
         * Valid when GiveBack flag IS set.
         */
        [[nodiscard]] uint32_t minOperatingPowerMilliwatts() const;

        /**
         * @brief Set Minimum Operating Power in milliwatts
         * 
         * @param milliwatts Power in milliwatts (250mW units)
         * Valid when GiveBack flag IS set.
         */
        void minOperatingPowerMilliwatts(uint32_t milliwatts);

        [[nodiscard]] std::string toString() const override;
    };

    /**
     * @brief Common base for Augmented Request Data Objects
     * 
     * Holds flags shared by PPS and AVS and provides a common toString().
     * Derived classes implement voltage/current field encoding.
     * 
     * Reference: USB PD 3.2, Table 6-20 "Augmented Request Data Object"
     */
    class AugmentedRequestBase : public Request {
    public:
        explicit AugmentedRequestBase(uint32_t raw = 0);

        /**
         * @brief Check if EPR Mode Capable flag is set
         * 
         * Bit 22
         */
        [[nodiscard]] bool eprModeCapable() const;

        /**
         * @brief Set the EPR Mode Capable flag
         * 
         * @param value true to set, false to clear
         */
        void eprModeCapable(bool value);

        // Derived classes provide voltage/current accessors
        [[nodiscard]] virtual uint32_t outputVoltageMillivolts() const = 0;
        virtual void outputVoltageMillivolts(uint32_t millivolts) = 0;
        [[nodiscard]] virtual uint32_t operatingCurrentMilliamps() const = 0;
        virtual void operatingCurrentMilliamps(uint32_t milliamps) = 0;

        [[nodiscard]] std::string toString() const override;

    protected:
        [[nodiscard]] virtual const char* label() const = 0; ///< Label for toString()
    };

    /**
     * @brief Augmented PPS Request (SPR - PPS)
     * 
     * Voltage: 20mV units at bits 20:9 (12 bits)
     * Current: 50mA units at bits 6:0 (7 bits)
     */
    class AugmentedPPSRequest : public AugmentedRequestBase {
    public:
        explicit AugmentedPPSRequest(uint32_t raw = 0);

        [[nodiscard]] uint32_t outputVoltageMillivolts() const override;
        void outputVoltageMillivolts(uint32_t millivolts) override;

        [[nodiscard]] uint32_t operatingCurrentMilliamps() const override;
        void operatingCurrentMilliamps(uint32_t milliamps) override;

    protected:
        [[nodiscard]] const char* label() const override;
    };

    /**
     * @brief Augmented AVS Request (SPR/EPR - AVS)
     * 
     * Voltage: 25mV units at bits 20:9 (12 bits),
     *          with least-significant two bits set to zero (100mV effective step)
     * Current: 50mA units at bits 6:0 (7 bits)
     */
    class AugmentedAVSRequest : public AugmentedRequestBase {
    public:
        explicit AugmentedAVSRequest(uint32_t raw = 0);

        [[nodiscard]] uint32_t outputVoltageMillivolts() const override;
        void outputVoltageMillivolts(uint32_t millivolts) override;

        [[nodiscard]] uint32_t operatingCurrentMilliamps() const override;
        void operatingCurrentMilliamps(uint32_t milliamps) override;

    protected:
        [[nodiscard]] const char* label() const override;
    };

    /**
     * @brief EPR Request message payload (2 Data Objects)
     *
     * Per USB-PD 3.2 Section 6.4.9, EPR_Request carries:
     * - DO1: Request Data Object
     * - DO2: A copy of the selected Source PDO
     */
    class EPRRequest : public Request {
    public:
        explicit EPRRequest(uint32_t requestRaw = 0, uint32_t sourcePdoRaw = 0);

        [[nodiscard]] std::span<const uint8_t> raw() const override;
        [[nodiscard]] uint32_t numDataObjects() const override;
        [[nodiscard]] uint32_t rawMessageType() const override;

        [[nodiscard]] uint32_t sourcePdoRaw() const;
        void sourcePdoRaw(uint32_t raw);

        [[nodiscard]] std::string toString() const override;

    protected:
        uint32_t _sourcePdoRaw = 0;
        mutable std::array<uint8_t, 8> _eprRawBytes{};
    };

} // namespace T76::DRPD::Proto
