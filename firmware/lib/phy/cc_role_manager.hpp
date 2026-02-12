/**
 * @file cc_role_manager.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * The CCRoleManager class manages the configuration of the CC (Configuration Channel)
 * roles for the CC lines. It allows setting and querying the roles for CC1 and CC2,
 * controlling the associated GPIO pins to reflect the desired roles.
 * 
 */

#pragma once

#include <t76/safety.hpp>


namespace T76::DRPD::PHY {
    
    /**
     * @brief Enumeration of the possible CC roles.
     * 
     */
    enum class CCRole : uint32_t {
        Off = 0,
        Sink,
        EMarker,
        SourceDefault,
        Source1_5A,
        Source3_0A,
        VConn
    };

    /**
     * @brief Class to manage CC roles for CC1 and CC2 lines.
     * 
     * This class allows setting and querying the CC roles for both CC1 and CC2 lines.
     * It controls the necessary GPIO pins to configure the hardware according to
     * the selected roles.
     * 
     * The class implements the SafeableComponent interface to ensure safe operation;
     * in the event of a safety shutdown, both CC roles will be set to Off.
     */
    class CCRoleManager : T76::Core::Safety::SafeableComponent {
    public:
        /**
         * @brief Set the CC1 role.
         * 
         * @param role The role to set for CC1.
         */
        void cc1Role(CCRole role);

        /**
         * @brief Get the current CC1 role.
         * 
         * @return The current role of CC1.
         */
        CCRole cc1Role();

        /**
         * @brief Set the CC2 role.
         * 
         * @param role The role to set for CC2.
         */
        void cc2Role(CCRole role);

        /**
         * @brief Get the current CC2 role.
         * 
         * @return The current role of CC2.
         */
        CCRole cc2Role();

    protected:
        CCRole _cc1Role; ///< Current role of CC1
        CCRole _cc2Role; ///< Current role of CC2

        /**
         * @brief Set the GPIO pins for the specified CC role.
         * 
         * @param role The CC role to set.
         * @param vConnEnPin The VCONN_EN pin number.
         * @param roleSel0Pin The ROLE_SEL_0 pin number.
         * @param roleSel1Pin The ROLE_SEL_1 pin number.
         * @param roleSel2Pin The ROLE_SEL_2 pin number.
         */
        void _setRolePins(CCRole role, uint8_t vConnEnPin, uint8_t roleSel0Pin, uint8_t roleSel1Pin, uint8_t roleSel2Pin);

        // Safety component interface implementations

        virtual bool activate() override;
        virtual void makeSafe() override;
        virtual const char *getComponentName() const override { return "CCRoleManager"; }
    };

} // namespace T76::DRPD::PHY
