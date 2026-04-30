# Copyright (c) 2025 MTA, Inc.
#
# This maps all the pins used by the system. It makes it easier to 
# ensure that there are no accidental duplicates or overlaps.
#
# Keep the list in numerical order, and use the variables as needed in
# each module.

SET(PIN_CC_VREF_PWM                      1 CACHE STRING "CC_VREF_PWM GPIO")
SET(PIN_CC1_ROLE_SEL_0                   3 CACHE STRING "CC1_ROLE_SEL_0 GPIO")
SET(PIN_CC1_ROLE_SEL_1                   4 CACHE STRING "CC1_ROLE_SEL_1 GPIO")
SET(PIN_CC1_ROLE_SEL_2                   5 CACHE STRING "CC1_ROLE_SEL_2 GPIO")
SET(PIN_CC2_ROLE_SEL_0                   6 CACHE STRING "CC2_ROLE_SEL_0 GPIO")
SET(PIN_CC2_ROLE_SEL_1                   7 CACHE STRING "CC2_ROLE_SEL_1 GPIO")
SET(PIN_CC2_ROLE_SEL_2                   8 CACHE STRING "CC2_ROLE_SEL_2 GPIO")
SET(PIN_CC_IN                            9 CACHE STRING "CC_IN GPIO")
SET(PIN_CC_VSENSE_SEL_0                 10 CACHE STRING "CC_VSENSE_SEL_0 GPIO")
SET(PIN_CC_VSENSE_SEL_1                 11 CACHE STRING "CC_VSENSE_SEL_1 GPIO")
SET(PIN_CC_VSENSE_SEL_2                 12 CACHE STRING "CC_VSENSE_SEL_2 GPIO")
SET(PIN_VBUS_EN                         13 CACHE STRING "VBUS_EN GPIO")
SET(PIN_VBUS_EN_USDS                    21 CACHE STRING "VBUS_EN_USDS GPIO")
SET(PIN_CC1_VCONN_EN                    14 CACHE STRING "CC1_VCONN_EN GPIO")
SET(PIN_CC2_VCONN_EN                    15 CACHE STRING "CC2_VCONN_EN GPIO")
SET(PIN_DUT_CC_SEL                      16 CACHE STRING "DUT_CC_SEL GPIO")
SET(PIN_USDS_CC_EN                      17 CACHE STRING "USDS_CC_EN GPIO")
SET(PIN_USDS_CC_SEL                     18 CACHE STRING "USDS_CC_SEL GPIO")
SET(PIN_CC_OUT_LOW                      19 CACHE STRING "CC_OUT_LOW GPIO")
SET(PIN_CC_OUT_HIGH                     20 CACHE STRING "CC_OUT_HIGH GPIO")
SET(PIN_SYNC                            25 CACHE STRING "SYNC GPIO")
SET(PIN_VBUS_ISENSE                     26 CACHE STRING "VBUS_ISENSE GPIO")
SET(PIN_VBUS_ISENSE_ADC_CHANNEL          0 CACHE STRING "VBUS_ISENSE ADC Channel")
SET(PIN_VBUS_VSENSE                     27 CACHE STRING "VBUS_VSENSE GPIO")
SET(PIN_VBUS_VSENSE_ADC_CHANNEL          1 CACHE STRING "VBUS_VSENSE ADC Channel")
SET(PIN_CC_VSENSE                       28 CACHE STRING "CC_VSENSE GPIO")
SET(PIN_CC_VSENSE_ADC_CHANNEL            2 CACHE STRING "CC_VSENSE ADC Channel")

