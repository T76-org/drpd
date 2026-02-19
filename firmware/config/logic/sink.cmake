# Copyright (c) 2025 MTA, Inc.
#
# Compile-time definitions for the Sink component

target_compile_definitions(drpd-firmware PUBLIC
    LOGIC_SINK_MESSAGE_QUEUE_LENGTH=16                           # Queue size for the internal message receiving queue

    LOGIC_SINK_GOODCRC_TIMEOUT_US=10000                          # Timeout for GoodCRC response in microseconds
    LOGIC_SINK_GOODCRC_RETRIES=3                                 # Number of retries for sending messages awaiting GoodCRC

    LOGIC_SINK_WAIT_FOR_CAPABILITIES_TIMEOUT_US=620000           # Timeout for waiting for Source_Capabilities (tTypeCSinkWaitCap 620ms)
    LOGIC_SINK_SELECT_CAPABILITY_RESPONSE_TIMEOUT_US=33000       # Timeout for waiting for Accept/Reject after Select_Capability (tSenderResponse 33ms)
    LOGIC_SINK_TRANSITION_SINK_TIMEOUT_SPR_US=550000             # Timeout for Transition_Sink state (tPSTransition - SPR Mode 550ms)
    LOGIC_SINK_TRANSITION_SINK_TIMEOUT_EPR_US=1020000            # Timeout for Transition_Sink state (tPSTransition - EPR Mode 1020ms)
    LOGIC_SINK_EPR_MODE_ENTRY_RESPONSE_TIMEOUT_US=500000         # Timeout waiting for EPR_Mode entry response sequence
    LOGIC_SINK_EPR_KEEPALIVE_INTERVAL_US=375000                  # Periodic sink EPR keepalive interval
    LOGIC_SINK_EPR_SOURCE_KEEPALIVE_WATCHDOG_US=2000000          # Watchdog for source keepalive/acknowledgement
    LOGIC_SINK_EXTENDED_REASSEMBLY_TIMEOUT_US=500000             # Timeout for abandoning incomplete extended chunks
    LOGIC_SINK_MAX_EXTENDED_PAYLOAD_BYTES=512                    # Static max bytes for tracked extended payload buffers
    LOGIC_SINK_RAW_PD_MESSAGE_MAX_BODY_BYTES=8                   # Static max bytes for sink-generated raw PD payload wrappers
    LOGIC_SINK_READY_SINK_REQUEST_TIMER_US=100000                # Timer for Ready_Sink state to request higher power (tSinkRequest 100ms)
    LOGIC_SINK_READY_PDO_PPS_REFRESH_TIMER_US=9000000            # Timer for PPS/AVS refresh in Ready state (tPPSRequest 9s)
)
