# Copyright (c) 2025 MTA, Inc.
#
# Compile-time definitions for the PD Encoder component

# IMPORTANT: CC_OUT_HIGH and CC_OUT_LOW must be defined on sequential GPIO pins, with CC_OUT_HIGH being the higher numbered pin.

target_compile_definitions(drpd-firmware PUBLIC
    PHY_BMC_ENCODER_CC_OUT_HIGH_PIN=${PIN_CC_OUT_HIGH}          # CC_OUT High GPIO Pin
    PHY_BMC_ENCODER_CC_OUT_LOW_PIN=${PIN_CC_OUT_LOW}            # CC_OUT Low GPIO Pin 
    PHY_BMC_ENCODER_PIO=pio0                                    # PIO instance used for PD encoding

    PHY_BMC_ENCODER_PIO_CLOCK_FREQUENCY_HZ=1800000.0f           # PIO clock frequency in Hz
    PHY_BMC_ENCODER_IRQ_PRIORITY=2                              # IRQ priority for the PIO used by the BMC encoder
    PHY_BMC_ENCODER_QUEUE_LENGTH=8                              # Length of the message queue
    PHY_BMC_ENCODER_MAX_ENCODED_WORDS=96                        # Max 32-bit words in encoded transmit bitstream
    PHY_BMC_ENCODED_MESSAGE_MAX_BODY_BYTES=262                  # Max raw body bytes accepted by encoded message wrapper

    PHY_BMC_ENCODER_TIMER_FREQUENCY_HZ=10000                    # Frequency of the transmission timer in Hz
)
