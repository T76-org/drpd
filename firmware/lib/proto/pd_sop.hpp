/**
 * @file pd_sop.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * The SOP class represents the Start of Packet (SOP) token 
 * used in USB Power Delivery communication. It encapsulates
 * the 4-byte K-code sequence and provides methods to classify
 * and validate the SOP type.
 */

#pragma once


#include <array>
#include <cstdint>
#include <span>
#include <string>


namespace T76::DRPD::Proto {

    /**
     * @brief USB-PD SOP decoder (4-byte K-code sequence on the wire).
     *
     * Stores the 4 received K-code bytes and classifies the SOP dynamically.
     */
    class SOP {
    public:

        /** 
         * @brief Types of SOPs.
         * 
         */
        enum class SOPType : uint32_t {
            SOP,                    ///< SOP, used for communication between DFP and UFP
            SOPPrime,               ///< SOP', used for communication with cable plug
            SOPDoublePrime,         ///< SOP'', used for communication with electronically marked cables
            SOPDebug,               ///< SOP Debug, used for debugging between DFP and UFP
            SOPPrimeDebug,          ///< SOP' Debug, used for debugging with cable plug
            SOPDoublePrimeDebug,    ///< SOP'' Debug, used for debugging with electronically marked cables
            HardReset,              ///< Hard Reset, used to indicate a power cycle
            CableReset,             ///< Cable Reset, used to reset the cable
            Invalid,                ///< Invalid SOP
        };

        /** 
         * @brief Set the SOP token type.
         * 
         * @param type The SOP token type.
         */
        void type(SOPType type);

        /** 
         * @brief Returns the SOP token type.
         * 
         * @return SOPType The SOP token type.
         */
        [[nodiscard]] SOPType type() const;

        /** 
         * @brief Returns whether the SOP token is valid.
         * 
         * @return bool true if valid, false otherwise.
         */
        [[nodiscard]] bool isValid() const;

        /** 
         * @brief Returns whether the SOP token has errors.
         * 
         * @return bool true if has errors, false otherwise.
         */
        [[nodiscard]] bool hasErrors() const;

        /** 
         * @brief Set the 4-byte K-code sequence.
         * 
         * @param kcodes The 4-byte K-code sequence.
         */
        void bytes(std::span<const uint8_t, 4> kcodes);

        /** 
         * @brief Returns the 4-byte K-code sequence.
         * 
         * @return const std::array<uint8_t, 4>& The 4-byte K-code sequence.
         */
        [[nodiscard]] const std::array<uint8_t, 4>& bytes() const;

        /** 
         * @brief Returns a string representation of the SOP token.
         * 
         * @return std::string The string representation.
         */
        [[nodiscard]]
        std::string toString() const;

    protected:
        std::array<uint8_t, 4> _bytes = {0, 0, 0, 0};  ///< The 4-byte K-code sequence
        SOPType _type = SOPType::Invalid;              ///< The SOP token type
        bool _hasErrors = false;                       ///< Whether the token has errors

        /** 
         * @brief Validates the 4-byte K-code sequence.
         * 
         * @param a First byte.
         * @param b Second byte.
         * @param c Third byte.
         * @param d Fourth byte.
         * 
         * @return true If the sequence is valid. In this case, sets _hasErrors
         *         true if there are correctable errors.
         * @return false Otherwise.
         */
        bool _isValidSequence(uint8_t a, uint8_t b, uint8_t c, uint8_t d);
    };

} // namespace T76::DRPD::Proto

