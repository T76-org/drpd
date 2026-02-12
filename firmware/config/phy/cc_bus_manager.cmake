# Copyright (c) 2025 MTA, Inc.
#
# Compile-time definitions for the CC Bus Manager component

target_compile_definitions(drpd-firmware PUBLIC
    PHY_CC_BUS_MANAGER_DUT_CC_SEL_PIN=${PIN_DUT_CC_SEL}       # DUT CC Select pin
    PHY_CC_BUS_MANAGER_USDS_CC_SEL_PIN=${PIN_USDS_CC_SEL}     # USDS CC Select pin
    PHY_CC_BUS_MANAGER_USDS_CC_EN_PIN=${PIN_USDS_CC_EN}       # USDS CC Enable pin
)