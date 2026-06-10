# Copyright (c) 2026 MTA, Inc.
#
# Compile-time definitions for the HardwareRevisionConfig component

target_compile_definitions(drpd-firmware PUBLIC
    LOGIC_HARDWARE_REVISION_DETECT_PIN=${PIN_HW_REVISION_DETECT}    # GPIO pin for hardware revision detect
)

