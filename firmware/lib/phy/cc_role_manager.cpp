/**
 * @file cc_role_manager.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "cc_role_manager.hpp"


using namespace T76::DRPD::PHY;


bool CCRoleManager::activate() {
    // Set all CC role manager GPIOs low and output

    gpio_set_function(PHY_CC_ROLE_MANAGER_CC1_VCONN_EN_PIN, GPIO_FUNC_SIO);
    gpio_init(PHY_CC_ROLE_MANAGER_CC1_VCONN_EN_PIN);
    gpio_put(PHY_CC_ROLE_MANAGER_CC1_VCONN_EN_PIN, 0);
    gpio_set_dir(PHY_CC_ROLE_MANAGER_CC1_VCONN_EN_PIN, GPIO_OUT);
    
    gpio_set_function(PHY_CC_ROLE_MANAGER_CC1_ROLE_SEL_0_PIN, GPIO_FUNC_SIO);
    gpio_init(PHY_CC_ROLE_MANAGER_CC1_ROLE_SEL_0_PIN);
    gpio_put(PHY_CC_ROLE_MANAGER_CC1_ROLE_SEL_0_PIN, 0);
    gpio_set_dir(PHY_CC_ROLE_MANAGER_CC1_ROLE_SEL_0_PIN, GPIO_OUT);

    gpio_set_function(PHY_CC_ROLE_MANAGER_CC1_ROLE_SEL_1_PIN, GPIO_FUNC_SIO);
    gpio_init(PHY_CC_ROLE_MANAGER_CC1_ROLE_SEL_1_PIN);
    gpio_put(PHY_CC_ROLE_MANAGER_CC1_ROLE_SEL_1_PIN, 0);
    gpio_set_dir(PHY_CC_ROLE_MANAGER_CC1_ROLE_SEL_1_PIN, GPIO_OUT);

    gpio_set_function(PHY_CC_ROLE_MANAGER_CC1_ROLE_SEL_0_PIN, GPIO_FUNC_SIO);
    gpio_init(PHY_CC_ROLE_MANAGER_CC1_ROLE_SEL_2_PIN);
    gpio_put(PHY_CC_ROLE_MANAGER_CC1_ROLE_SEL_2_PIN, 0);
    gpio_set_dir(PHY_CC_ROLE_MANAGER_CC1_ROLE_SEL_2_PIN, GPIO_OUT);

    gpio_set_function(PHY_CC_ROLE_MANAGER_CC2_VCONN_EN_PIN, GPIO_FUNC_SIO);
    gpio_init(PHY_CC_ROLE_MANAGER_CC2_VCONN_EN_PIN);
    gpio_put(PHY_CC_ROLE_MANAGER_CC2_VCONN_EN_PIN, 0);
    gpio_set_dir(PHY_CC_ROLE_MANAGER_CC2_VCONN_EN_PIN, GPIO_OUT);

    gpio_set_function(PHY_CC_ROLE_MANAGER_CC2_ROLE_SEL_0_PIN, GPIO_FUNC_SIO);
    gpio_init(PHY_CC_ROLE_MANAGER_CC2_ROLE_SEL_0_PIN);
    gpio_put(PHY_CC_ROLE_MANAGER_CC2_ROLE_SEL_0_PIN, 0);
    gpio_set_dir(PHY_CC_ROLE_MANAGER_CC2_ROLE_SEL_0_PIN, GPIO_OUT);

    gpio_set_function(PHY_CC_ROLE_MANAGER_CC2_ROLE_SEL_1_PIN, GPIO_FUNC_SIO);
    gpio_init(PHY_CC_ROLE_MANAGER_CC2_ROLE_SEL_1_PIN);
    gpio_put(PHY_CC_ROLE_MANAGER_CC2_ROLE_SEL_1_PIN, 0);
    gpio_set_dir(PHY_CC_ROLE_MANAGER_CC2_ROLE_SEL_1_PIN, GPIO_OUT);

    gpio_set_function(PHY_CC_ROLE_MANAGER_CC2_ROLE_SEL_0_PIN, GPIO_FUNC_SIO);
    gpio_init(PHY_CC_ROLE_MANAGER_CC2_ROLE_SEL_2_PIN);
    gpio_put(PHY_CC_ROLE_MANAGER_CC2_ROLE_SEL_2_PIN, 0);
    gpio_set_dir(PHY_CC_ROLE_MANAGER_CC2_ROLE_SEL_2_PIN, GPIO_OUT);

    return true;
}

void CCRoleManager::makeSafe() {
    // Force all CC roles to Off
    cc1Role(CCRole::Off);
    cc2Role(CCRole::Off);
}

void CCRoleManager::cc1Role(CCRole role) {
    if (_cc1Role == role) {
        return;
    }

    _cc1Role = role;

    _setRolePins(
        role, 
        PHY_CC_ROLE_MANAGER_CC1_VCONN_EN_PIN, 
        PHY_CC_ROLE_MANAGER_CC1_ROLE_SEL_0_PIN, 
        PHY_CC_ROLE_MANAGER_CC1_ROLE_SEL_1_PIN, 
        PHY_CC_ROLE_MANAGER_CC1_ROLE_SEL_2_PIN
    );
}

CCRole CCRoleManager::cc1Role() {
    return _cc1Role;
}

void CCRoleManager::cc2Role(CCRole role) {
    if (_cc2Role == role) {
        return;
    }

    _cc2Role = role;

    _setRolePins(
        role, 
        PHY_CC_ROLE_MANAGER_CC2_VCONN_EN_PIN, 
        PHY_CC_ROLE_MANAGER_CC2_ROLE_SEL_0_PIN, 
        PHY_CC_ROLE_MANAGER_CC2_ROLE_SEL_1_PIN, 
        PHY_CC_ROLE_MANAGER_CC2_ROLE_SEL_2_PIN
    );
}

CCRole CCRoleManager::cc2Role() {
    return _cc2Role;
}

void CCRoleManager::_setRolePins(CCRole role, uint8_t vConnEnPin, uint8_t roleSel0Pin, uint8_t roleSel1Pin, uint8_t roleSel2Pin) {

    // The roles are set according to these tables:
    //
    // Role          | VCONN_EN | ROLE_SEL_0 | ROLE_SEL_1 | ROLE_SEL_2
    // -----------------------------------------------------------------
    // Off           |    0     |      0     |      0     |      0
    // Sink          |    0     |      1     |      0     |      0
    // EMarker       |    0     |      1     |      1     |      0
    // SourceDefault |    0     |      0     |      0     |      1
    // Source1_5A    |    0     |      0     |      1     |      1
    // Source3_0A    |    0     |      1     |      1     |      1
    // VConn         |    1     |      0     |      0     |      0
    //
    // Note that for the VConn role, we first disable VConn_EN before changing the other pins,
    // then re-enable it to ensure break-before-make behaviour.

    switch(role) {
        case CCRole::Off:
            gpio_put(vConnEnPin, 0);
            gpio_put(roleSel0Pin, 0);
            gpio_put(roleSel1Pin, 0);
            gpio_put(roleSel2Pin, 0);
            break;

        case CCRole::Sink:
            gpio_put(vConnEnPin, 0);
            gpio_put(roleSel0Pin, 1);
            gpio_put(roleSel1Pin, 0);
            gpio_put(roleSel2Pin, 0);
            break;

        case CCRole::EMarker:
            gpio_put(vConnEnPin, 0);
            gpio_put(roleSel0Pin, 1);
            gpio_put(roleSel1Pin, 1);
            gpio_put(roleSel2Pin, 0);
            break;

        case CCRole::SourceDefault:
            gpio_put(vConnEnPin, 0);
            gpio_put(roleSel0Pin, 0);
            gpio_put(roleSel1Pin, 0);
            gpio_put(roleSel2Pin, 1);
            break;

        case CCRole::Source1_5A:
            gpio_put(vConnEnPin, 0);
            gpio_put(roleSel0Pin, 0);
            gpio_put(roleSel1Pin, 1);
            gpio_put(roleSel2Pin, 1);
            break;

        case CCRole::Source3_0A:
            gpio_put(vConnEnPin, 0);
            gpio_put(roleSel0Pin, 1);
            gpio_put(roleSel1Pin, 1);
            gpio_put(roleSel2Pin, 1);
            break;

        case CCRole::VConn:
            // Just to be safe, we disable VConn first
            gpio_put(vConnEnPin, 0);
            gpio_put(roleSel0Pin, 0);
            gpio_put(roleSel1Pin, 0);
            gpio_put(roleSel2Pin, 0);
            gpio_put(vConnEnPin, 1);
            break;
    }
}