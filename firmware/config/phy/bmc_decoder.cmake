# Copyright (c) 2025 MTA, Inc.
#
# Compile-time definitions for the BMCDecoder and BMCDecodedMessage components

target_compile_definitions(drpd-firmware PUBLIC
    PHY_BMC_DECODER_INPUT_PIN=${PIN_CC_IN}                      # Input pin for BMC decoder
    PHY_BMC_DECODER_PIO=pio0                                    # PIO instance for BMC decoder

    PHY_BMC_DECODER_CC_VREF_PWM_PIN=${PIN_CC_VREF_PWM}          # CC_VREF_PWM pin for voltage reference
    PHY_BMC_DECODER_CC_VREF_DEFAULT=0.6f                        # Default CC voltage reference in volts    
    PHY_BMC_DECODER_CC_VREF_PWM_FREQUENCY_HZ=100000             # PWM frequency for CC_VREF_PWM pin           

    PHY_BMC_DECODER_PIO_CLOCK_HZ=200000000.0f                   # PIO clock frequency
    PHY_BMC_DECODER_DECODER_INTERRUPT_FREQUENCY_HZ=10000        # Decoder interrupt frequency in Hz

    PHY_BMC_DECODER_RUNT_PULSE_WIDTH_NS=1000                    # Minimum pulse width in nanoseconds for a valid pulse
    PHY_BMC_DECODER_TIMEOUT_PULSE_WIDTH_NS=10000                # Pulse width in nanoseconds indicating a timeout

    PHY_BMC_DECODER_MAX_MESSAGE_DATA_SIZE=40                    # Maximum data size in bytes for a decoded BMC message
    PHY_BMC_DECODER_MAX_MESSAGE_PULSE_BUFFER_SIZE=700           # Maximum size of pulse buffer in uint16_t words for a decoded message

    PHY_BMC_DECODER_CIRCULAR_BUFFER_SIZE=1000                   # Circular buffer size in uint32_t words for pulse timings
    PHY_BMC_DECODER_MESSAGE_BUFFER_SIZE=100                     # Size of circular buffer for decoded messages

    PHY_BMC_DECODER_QUEUE_LENGTH=100                            # Queue length for decoded messages
)
