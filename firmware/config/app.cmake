# Copyright (c) 2025 MTA, Inc.
#
# Compile-time definitions for the App

target_compile_definitions(drpd-firmware PUBLIC
    APP_RECEIVED_MESSAGE_QUEUE_LENGTH=30          # Length of the queue for received messages from PHY layer
    APP_CORE1_TIMER_FREQUENCY_HZ=10000            # Frequency of the timer used for core 1 tasks in Hz
)
