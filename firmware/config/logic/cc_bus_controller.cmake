# Copyright (c) 2025 MTA, Inc.
#
# Compile-time definitions for the CC Bus Controller component

target_compile_definitions(drpd-firmware PUBLIC
    LOGIC_CC_BUS_CONTROLLER_ITERATION_PERIOD_MS=10                      # Iteration period in milliseconds
    LOGIC_CC_BUS_CONTROLLER_DEBOUNCE_ITERATIONS=10                      # Number of iterations for debounce
    LOGIC_CC_BUS_CONTROLLER_SOURCE_DETECT_VOLTAGE_THRESHOLD=0.5f        # Minimum voltage threshold to detect source presence
    LOGIC_CC_BUS_CONTROLLER_SINK_DETECT_VOLTAGE_THRESHOLD_LOW=0.5f      # Lower voltage threshold to detect sink presence
    LOGIC_CC_BUS_CONTROLLER_SINK_DETECT_VOLTAGE_THRESHOLD_HIGH=2.0f     # Upper voltage threshold to detect sink presence
)