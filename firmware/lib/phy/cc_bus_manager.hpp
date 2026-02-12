/**
 * @file cc_bus_manager.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * The CCBusManager class manages the CC bus multiplexing between the Device Under Test (DUT)
 * and the Upstream Data Source (USDS). It allows selection of which CC line (CC1 or CC2) is connected
 * to each side and enables or disables the multiplexing, connecting or disconnecting the two
 * sides to each other.
 */

#pragma once

#include <t76/safety.hpp>


namespace T76::DRPD::PHY {

    /**
     * @brief CC bus channel selection
     */
    enum class CCChannel : uint32_t {
        CC1,
        CC2,
        None
    };

    /**
     * @brief Manages the CC bus multiplexing between DUT and USDS
     * 
     * This class controls the multiplexing of the CC lines between the Device Under Test (DUT)
     * and the Upstream Data Source (USDS). It allows selection of which CC line (CC1 or CC2) is connected
     * to each side and enables or disables the multiplexing, connecting or disconnecting the two
     * sides to each other.
     * 
     * The class implements the SafeableComponent interface; in the event of a fault,
     * the makeSafe() method disconnects the DUT and USDS CC lines from each other.
     */
    class CCBusManager : T76::Core::Safety::SafeableComponent {
    public:
        /**
         * @brief Set the state of the CC bus multiplexer
         * 
         * @param active If true, connect DUT and USDS CC lines; if false, disconnect them
         */
        void muxActive(bool active);

        /**
         * @brief Get the state of the CC bus multiplexer
         * 
         * @return true if DUT and USDS CC lines are connected, false if disconnected
         */
        bool muxActive();

        /**
         * @brief Set the DUT channel
         * 
         * @param channel The CC channel to connect to the DUT (CC1 or CC2)
         */
        void dutChannel(CCChannel channel);

        /**
         * @brief Get the DUT channel
         * 
         * @return The CC channel currently connected to the DUT (CC1 or CC2)
         */
        CCChannel dutChannel();

        /**
         * @brief Set the USDS channel
         * 
         * @param channel The CC channel to connect to the USDS (CC1 or CC2)
         */
        void usdsChannel(CCChannel channel);

        /**
         * @brief Get the USDS channel
         * 
         * @return The CC channel currently connected to the USDS (CC1 or CC2)
         */
        CCChannel usdsChannel();
    
    protected:
        // Safety component interface implementations

        virtual bool activate() override;
        virtual void makeSafe() override;
        virtual const char *getComponentName() const override { return "CCBusManager"; }
    };
    
} // namespace T76::PHY
