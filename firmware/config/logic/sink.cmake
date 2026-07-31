# Copyright (c) 2025 MTA, Inc.
#
# Compile-time definitions for the Sink component

target_compile_definitions(drpd-firmware PUBLIC
    LOGIC_SINK_MESSAGE_QUEUE_LENGTH=16                           # Queue size for the internal message receiving queue

    LOGIC_SINK_GOODCRC_TIMEOUT_US=10000                          # Timeout for GoodCRC response in microseconds
    LOGIC_SINK_GOODCRC_RETRIES=3                                 # Number of retries for sending messages awaiting GoodCRC

    LOGIC_SINK_WAIT_FOR_CAPABILITIES_TIMEOUT_US=620000           # Timeout for waiting for Source_Capabilities (tTypeCSinkWaitCap 620ms)
    LOGIC_SINK_VSAFE5V_PRESENT_THRESHOLD_VOLTS=4.50f             # Protocol VBUS-present guard below vSafe5V(min), allowing measurement tolerance
    LOGIC_SINK_VSAFE0V_THRESHOLD_VOLTS=0.80f                     # vSafe0V(max) used to confirm Hard Reset discharge
    LOGIC_SINK_VBUS_DEBOUNCE_US=20000                            # Stable VBUS interval before accepting threshold crossings
    LOGIC_SINK_MAX_HARD_RESETS=3                                 # Initial Hard Reset plus nHardResetCount=2 retries
    LOGIC_SINK_NO_RESPONSE_TIMEOUT_US=5500000                    # tNoResponse(max) while waiting for Hard Reset recovery
    LOGIC_SINK_SOFT_RESET_RESPONSE_TIMEOUT_US=33000              # Timeout for waiting for Accept after Soft_Reset (tSenderResponse 33ms)
    LOGIC_SINK_SELECT_CAPABILITY_RESPONSE_TIMEOUT_US=33000       # Timeout for waiting for Accept/Reject after Select_Capability (tSenderResponse 33ms)
    LOGIC_SINK_TRANSITION_SINK_TIMEOUT_SPR_US=550000             # Timeout for Transition_Sink state (tPSTransition - SPR Mode 550ms)
    LOGIC_SINK_TRANSITION_SINK_TIMEOUT_EPR_US=1020000            # Timeout for Transition_Sink state (tPSTransition - EPR Mode 1020ms)
    LOGIC_SINK_GET_PPS_STATUS_RESPONSE_TIMEOUT_US=33000          # Timeout for PPS status response (tSenderResponse 33ms)
    LOGIC_SINK_INQUIRY_RESPONSE_TIMEOUT_US=33000                 # Timeout for host inquiry response (tSenderResponse 33ms)
    LOGIC_SINK_EPR_MODE_ENTRY_SENDER_RESPONSE_TIMEOUT_US=33000   # Timeout waiting for EPR_Mode entry response (tSenderResponse 33ms)
    LOGIC_SINK_EPR_MODE_ENTRY_TIMEOUT_US=500000                  # Timeout for complete EPR mode entry sequence
    LOGIC_SINK_EPR_OPERATIONAL_PDP_W=100                         # EPR Sink Operational PDP advertised in EPR_Mode(Enter), in 1 W units
    LOGIC_SINK_EPR_KEEPALIVE_INTERVAL_US=375000                  # Periodic sink EPR keepalive interval
    LOGIC_SINK_EPR_KEEPALIVE_RESPONSE_TIMEOUT_US=33000           # Timeout waiting for EPR_KeepAlive_Ack (tSenderResponse 33ms)
    LOGIC_SINK_EPR_SOURCE_KEEPALIVE_WATCHDOG_US=2000000          # Watchdog for source keepalive/acknowledgement
    LOGIC_SINK_CHUNKING_NOT_SUPPORTED_TIMEOUT_US=45000           # Delay before Not_Supported for unsupported multi-chunk messages
    LOGIC_SINK_EXTENDED_REASSEMBLY_TIMEOUT_US=500000             # Timeout for abandoning incomplete extended chunks
    LOGIC_SINK_MAX_EXTENDED_PAYLOAD_BYTES=512                    # Static max bytes for tracked extended payload buffers
    LOGIC_SINK_RAW_PD_MESSAGE_MAX_BODY_BYTES=8                   # Static max bytes for sink-generated raw PD payload wrappers
    LOGIC_SINK_READY_SINK_REQUEST_TIMER_US=100000                # Timer for Ready_Sink state to request higher power (tSinkRequest 100ms)
    LOGIC_SINK_READY_PDO_PPS_REFRESH_TIMER_US=9000000            # Timer for PPS/AVS refresh in Ready state (tPPSRequest 9s)
    LOGIC_SINK_COLLISION_AVOIDANCE_RETRY_US=10000                # Poll interval while waiting for Source Rp=SinkTxOK before Sink AMS
)
