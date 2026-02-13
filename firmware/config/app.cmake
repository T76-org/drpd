# Copyright (c) 2025 MTA, Inc.
#
# Compile-time definitions for the App

target_compile_definitions(drpd-firmware PUBLIC
    APP_RECEIVED_MESSAGE_QUEUE_LENGTH=20          # Length of the queue for received messages from PHY layer
)
