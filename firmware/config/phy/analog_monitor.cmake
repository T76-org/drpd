# Copyright (c) 2025 MTA, Inc.
#
# Compile-time definitions for the Analog Manager component

target_compile_definitions(drpd-firmware PUBLIC
    PHY_ANALOG_MONITOR_VBUS_SENSE_PIN=${PIN_VBUS_VSENSE}                        # VBUS Voltage Sense Pin
    PHY_ANALOG_MONITOR_VBUS_SENSE_ADC_CHANNEL=${PIN_VBUS_VSENSE_ADC_CHANNEL}    # VBUS Voltage Sense ADC Channel
    PHY_ANALOG_MONITOR_VBUS_ISENSE_PIN=${PIN_VBUS_ISENSE}                       # VBUS Current Sense Pin
    PHY_ANALOG_MONITOR_VBUS_ISENSE_ADC_CHANNEL=${PIN_VBUS_ISENSE_ADC_CHANNEL}   # VBUS Current Sense ADC Channel
    PHY_ANALOG_MONITOR_CC_SENSE_PIN=${PIN_CC_VSENSE}                            # CC Voltage Sense Pin
    PHY_ANALOG_MONITOR_CC_SENSE_ADC_CHANNEL=${PIN_CC_VSENSE_ADC_CHANNEL}        # CC Voltage Sense ADC Channel

    PHY_ANALOG_MONITOR_CC_SENSE_SEL_0_PIN=${PIN_CC_VSENSE_SEL_0}                # CC Sense Select Pin 0
    PHY_ANALOG_MONITOR_CC_SENSE_SEL_1_PIN=${PIN_CC_VSENSE_SEL_1}                # CC Sense Select Pin 1
    PHY_ANALOG_MONITOR_CC_SENSE_SEL_2_PIN=${PIN_CC_VSENSE_SEL_2}                # CC Sense Select Pin 2

    PHY_ANALOG_MONITOR_VBUS_SENSE_SCALE_FACTOR=18.405f                          # VBUS Sense Scale Factor (V per ADC unit)
    PHY_ANALOG_MONITOR_VBUS_ISENSE_SCALE_FACTOR=4.0f                            # VBUS Current Sense Scale Factor (A per ADC unit)
    PHY_ANALOG_MONITOR_CC_SENSE_SCALE_FACTOR=1.51f                              # CC Sense Scale Factor (V per ADC unit)

    PHY_ANALOG_MONITOR_ADC_SETTLING_TIME_US=10                                  # ADC Settling Time in microseconds
    PHY_ANALOG_MONITOR_ADC_POST_SWITCH_SAMPLE_COUNT=4                           # Samples averaged after a post-switch dummy conversion
    PHY_ANALOG_MONITOR_DECIMATION_BITS=4                                        # Number of bits of decimation for filtered readings (2^n samples averaged)
    PHY_ANALOG_MONITOR_ADC_VREF_VOLTAGE=3.30f                                   # ADC Reference Voltage in Volts
)
