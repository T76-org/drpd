# Copyright (c) 2025 MTA, Inc.
#
# Compile-time definitions for the SyncManager component

target_compile_definitions(drpd-firmware PUBLIC
    PHY_SYNC_MANAGER_SYNC_PIN=${PIN_SYNC}       # GPIO pin for SYNC signal
)

