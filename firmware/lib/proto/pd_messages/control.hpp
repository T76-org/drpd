/**
 * @file control.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * The ControlMessage class represents a generic USB-PD control
 * message. Since control messages do not have data objects,
 * this class provides basic implementations of the PDMessage
 * interface methods that can be reused for specific control message types.
 * 
 */

#pragma once

#include "../pd_message.hpp"


namespace T76::DRPD::Proto {
    
    /** 
     * @brief Represents a generic USB-PD control message.
     * 
     * The ControlMessage class represents a generic USB-PD control
     * message. Since control messages do not have data objects,
     * this class provides basic implementations of the PDMessage
     * interface methods that can be reused for specific control message types.
     */
    class ControlMessage : public PDMessage {
    public:
        /**
         * @brief Returns the raw byte representation of the control message.
         * 
         * Since control messages do not have data objects, this method
         * returns an empty span.
         * 
         * @return std::span<const uint8_t> The raw byte representation (empty).
         */
        std::span<const uint8_t> raw() const override;

        /** 
         * @brief Returns the number of data objects in the control message.
         * 
         * Control messages do not have data objects, so this method
         * always returns 0.
         * 
         * @return uint32_t The number of data objects (always 0).
         */
        uint32_t numDataObjects() const override;

        /** 
         * @brief Returns the raw Message Type value for the control message.
         * 
         * This method should be overridden by derived classes to return
         * the specific control message type.
         * 
         * @return uint32_t The raw Message Type value.
         */
        uint32_t rawMessageType() const override;
    };

} // namespace T76::DRPD::Proto
