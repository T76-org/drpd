# Copyright (c) 2025 MTA, Inc.
#
# Compile-time definitions for the VBUS Manager component

target_compile_definitions(drpd-firmware PUBLIC
    PHY_CC_ROLE_MANAGER_CC1_ROLE_SEL_0_PIN=${PIN_CC1_ROLE_SEL_0}   # CC1 Role Select Pin 0 
    PHY_CC_ROLE_MANAGER_CC1_ROLE_SEL_1_PIN=${PIN_CC1_ROLE_SEL_1}   # CC1 Role Select Pin 1
    PHY_CC_ROLE_MANAGER_CC1_ROLE_SEL_2_PIN=${PIN_CC1_ROLE_SEL_2}   # CC1 Role Select Pin 2

    PHY_CC_ROLE_MANAGER_CC1_VCONN_EN_PIN=${PIN_CC1_VCONN_EN}       # CC1 VCONN Enable Pin
    
    PHY_CC_ROLE_MANAGER_CC2_ROLE_SEL_0_PIN=${PIN_CC2_ROLE_SEL_0}   # CC2 Role Select Pin 0
    PHY_CC_ROLE_MANAGER_CC2_ROLE_SEL_1_PIN=${PIN_CC2_ROLE_SEL_1}   # CC2 Role Select Pin 1
    PHY_CC_ROLE_MANAGER_CC2_ROLE_SEL_2_PIN=${PIN_CC2_ROLE_SEL_2}   # CC2 Role Select Pin 2

    PHY_CC_ROLE_MANAGER_CC2_VCONN_EN_PIN=${PIN_CC2_VCONN_EN}       # CC2 VCONN Enable Pin
)

