# Copyright (c) 2025 MTA, Inc.
#
# Compile-time definitions for the App

target_compile_definitions(drpd-firmware PUBLIC
    APP_RECEIVED_MESSAGE_QUEUE_LENGTH=250          # Length of the queue for received messages from PHY layer
    APP_STATUS_LED_PIN=${PIN_STATUS_LED}           # GPIO pin for device status LED
)
