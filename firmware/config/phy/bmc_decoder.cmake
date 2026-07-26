# Copyright (c) 2025 MTA, Inc.
#
# Compile-time definitions for the BMCDecoder and BMCDecodedMessage components

set(PHY_BMC_DECODER_CC_VREF_DEFAULT "0.7" CACHE STRING
    "Default BMC decoder CC reference voltage in volts")
set(PHY_BMC_DECODER_CC_VREF_MIN "0.2" CACHE STRING
    "Minimum configurable CC reference voltage in volts")
set(PHY_BMC_DECODER_CC_VREF_MAX "2.5" CACHE STRING
    "Maximum configurable CC reference voltage in volts")
set(PHY_BMC_DECODER_CC_VREF_STEP "0.05" CACHE STRING
    "Configurable CC reference voltage increment in volts")
set(PHY_BMC_DECODER_CC_VREF_PWM_FREQUENCY_HZ "100000" CACHE STRING
    "Default CC reference PWM frequency in hertz")
set(PHY_BMC_DECODER_CC_VREF_PWM_FREQUENCY_MIN_HZ "10000" CACHE STRING
    "Minimum configurable CC reference PWM frequency in hertz")
set(PHY_BMC_DECODER_CC_VREF_PWM_FREQUENCY_MAX_HZ "500000" CACHE STRING
    "Maximum configurable CC reference PWM frequency in hertz")
set(PHY_BMC_DECODER_CC_VREF_PWM_FREQUENCY_STEP_HZ "1000" CACHE STRING
    "Configurable CC reference PWM frequency increment in hertz")

target_compile_definitions(drpd-firmware PUBLIC
    PHY_BMC_DECODER_INPUT_PIN=${PIN_CC_IN}                      # Input pin for BMC decoder
    PHY_BMC_DECODER_PIO=pio1                                    # PIO instance for BMC decoder

    PHY_BMC_DECODER_CC_VREF_PWM_PIN=${PIN_CC_VREF_PWM}          # CC_VREF_PWM pin for voltage reference
    PHY_BMC_DECODER_CC_VREF_DEFAULT=${PHY_BMC_DECODER_CC_VREF_DEFAULT}f
    PHY_BMC_DECODER_CC_VREF_MIN=${PHY_BMC_DECODER_CC_VREF_MIN}f
    PHY_BMC_DECODER_CC_VREF_MAX=${PHY_BMC_DECODER_CC_VREF_MAX}f
    PHY_BMC_DECODER_CC_VREF_STEP=${PHY_BMC_DECODER_CC_VREF_STEP}f
    PHY_BMC_DECODER_CC_VREF_PWM_FREQUENCY_HZ=${PHY_BMC_DECODER_CC_VREF_PWM_FREQUENCY_HZ}
    PHY_BMC_DECODER_CC_VREF_PWM_FREQUENCY_MIN_HZ=${PHY_BMC_DECODER_CC_VREF_PWM_FREQUENCY_MIN_HZ}
    PHY_BMC_DECODER_CC_VREF_PWM_FREQUENCY_MAX_HZ=${PHY_BMC_DECODER_CC_VREF_PWM_FREQUENCY_MAX_HZ}
    PHY_BMC_DECODER_CC_VREF_PWM_FREQUENCY_STEP_HZ=${PHY_BMC_DECODER_CC_VREF_PWM_FREQUENCY_STEP_HZ}

    PHY_BMC_DECODER_PIO_CLOCK_HZ=200000000.0f                   # PIO clock frequency

    PHY_BMC_DECODER_CORE0_TASK_STACK_SIZE=4096                  # Stack size for the decoder task on core 0
    PHY_BMC_DECODER_CORE0_TASK_PRIORITY=tskIDLE_PRIORITY+1      # Priority for the decoder task

    PHY_BMC_DECODER_RUNT_PULSE_WIDTH_NS=1000                    # Minimum pulse width in nanoseconds for a valid pulse
    PHY_BMC_DECODER_TIMEOUT_PULSE_WIDTH_NS=10000                # Pulse width in nanoseconds indicating a timeout
    PHY_BMC_DECODER_PREAMBLE_START_MIN_PULSES=4                 # Minimum preamble pulse entries before emitting PreambleStart

    PHY_BMC_DECODER_MAX_MESSAGE_DATA_SIZE=262                   # Maximum data size in bytes for a decoded BMC message
    PHY_BMC_DECODER_MAX_MESSAGE_PULSE_BUFFER_SIZE=5600          # Maximum size of pulse buffer in uint16_t words for a decoded message

    PHY_BMC_DECODER_CIRCULAR_BUFFER_SIZE=2000UL                 # Circular buffer size in uint32_t words for pulse timings
    PHY_BMC_DECODER_MESSAGE_BUFFER_SIZE=10                      # Size of circular buffer for decoded messages

    PHY_BMC_DECODER_QUEUE_LENGTH=10                             # Queue length for decoded messages
)
