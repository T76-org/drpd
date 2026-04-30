# Copyright (c) 2025 MTA, Inc.
#
# Compile-time definitions for the VBUS Manager component

target_compile_definitions(drpd-firmware PUBLIC
    PHY_VBUS_MANAGER_VBUS_EN_PIN=${PIN_VBUS_EN}             # VBUS Enable Pin
    PHY_VBUS_MANAGER_VBUS_EN_USDS_PIN=${PIN_VBUS_EN_USDS}   # VBUS Enable Pin for USDS
    PHY_VBUS_MANAGER_VBUS_WATCHDOG_FREQUENCY_HZ=20000       # VBUS Watchdog Frequency in Hz
)

