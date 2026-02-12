/**
 * @file analog_monitor.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 * The Analog Monitor is responsible for reading various analog signals
 * from the hardware using the ADC. These include:
 * 
 * - VBUS voltage and current
 * - CC1 and CC2 voltages for the DUT and USDS ports
 * - ADC reference voltage
 * - Ground reference voltage
 * - Current reference voltage
 * 
 * The ADC reference voltage is used to calibrate the CC line voltage
 * readings, accounting for the tolerances in the voltage divider.
 * 
 * The ground reference voltage is used to account for any ground offset
 * in the system.
 * 
 * The current reference voltage is used to calibrate the VBUS current
 * reading.
 * 
 * Note that the VBUS voltage value is oversampled and decimated to
 * increase resolution, since the ADC is only 12 bits and the voltage
 * range is quite large (maximum of 60V).
 * 
 */

#pragma once

#include <array>
#include <cstdint>

#include <FreeRTOS.h>
#include <semphr.h>

#include "../util/window_averager.hpp"


/**
 * @brief Macro to generate the GPIO pin mask for selecting ADC channels
 * 
 */
#define ADC_CHANNEL_PIN_MASK(SEL_0, SEL_1, SEL_2) \
    (( (SEL_0) << PHY_ANALOG_MONITOR_CC_SENSE_SEL_0_PIN ) | \
     ( (SEL_1) << PHY_ANALOG_MONITOR_CC_SENSE_SEL_1_PIN ) | \
     ( (SEL_2) << PHY_ANALOG_MONITOR_CC_SENSE_SEL_2_PIN ))


namespace T76::DRPD::PHY {

    /**
     * @brief Struct containing all analog monitor readings
     * 
     */
    typedef struct {
        Util::WindowAverager<float, (2 * (1 << PHY_ANALOG_MONITOR_DECIMATION_BITS))> vBusVoltageAverager;
        Util::WindowAverager<float, (2 * (1 << PHY_ANALOG_MONITOR_DECIMATION_BITS))> vBusCurrentAverager;

        float dutCC1Voltage;
        float dutCC2Voltage;
        float usdsCC1Voltage;
        float usdsCC2Voltage;
        float adcVRefVoltage;
        float groundRefVoltage;
        float currentRefVoltage;
        uint64_t captureTimestampUs; ///< Timestamp in microseconds when VBUS values were captured
    } AnalogMonitorReadings;

    /**
     * @brief Class responsible for monitoring all analog signals
     * 
     * This class uses the ADC to read various analog signals from
     * the hardware, including VBUS voltage/current, CC line voltages,
     * and reference voltages.
     * 
     * The periodic read methods update cached readings internally.
     * Individual getter methods are provided to access each reading,
     * as well as a method to get all readings at once.
     * 
     * The class inherits from SafeableComponent to take advantage of
     * the safety system's activation. However, this is only a temporary
     * measure, as there are no safety-critical functions performed by
     * this class at the moment. (TODO: make this a non-safeable component)
     */
    class AnalogMonitor {
    public:
        SemaphoreHandle_t _adcAccessMutex; ///< Mutex to protect access to the ADC

        /**
         * @brief Initialize the Analog Monitor hardware
         * 
         */
        void init();

        /**
         * @brief Read all analog monitor values from the hardware
         * 
         */
        void readVBusValues();

        /**
         * @brief Read CC line voltage values from the hardware
         * 
         */
        void readCCLineValues();

        /**
         * @brief Get the VBUS voltage reading
         * 
         * @return float 
         */
        float vBusVoltage() const;

        /**
         * @brief Get the VBUS current reading
         * 
         * @return float 
         */
        float vBusCurrent() const;

        /**
         * @brief Get the DUT CC1 voltage reading
         * 
         * @return float 
         */
        float dutCC1Voltage() const;

        /**
         * @brief Get the DUT CC2 voltage reading
         * 
         * @return float 
         */
        float dutCC2Voltage() const;

        /**
         * @brief Get the USDS CC1 voltage reading
         * 
         * @return float 
         */
        float usdsCC1Voltage() const;

        /**
         * @brief Get the USDS CC2 voltage reading
         * 
         * @return float 
         */
        float usdsCC2Voltage() const;

        /**
         * @brief Get the ADC reference voltage reading
         * 
         * @return float 
         */
        float adcVRefVoltage() const;

        /**
         * @brief Get the ground reference voltage reading
         * 
         * @return float 
         */
        float groundRefVoltage() const;

        /**
         * @brief Get the current reference voltage reading
         * 
         * @return float 
         */
        float currentRefVoltage() const;

        /**
         * @brief Get all analog monitor readings at once
         * 
         * @return AnalogMonitorReadings 
         */
        AnalogMonitorReadings allReadings() const;

    protected:
        /**
         * @brief Enumeration of ADC channels for CC line voltage sensing
         * 
         */
        enum class ADCChannel : uint32_t {
            DutCC1                  = 0,
            DutCC2                  = 1,
            UsdsCC1                 = 2,
            UsdsCC2                 = 3,
            Vcc3V3                  = 4,
            VRef1V65                = 5,
            GroundReference         = 6,
            ADCVRef                 = 7,
        };

        /**
         * @brief Mapping of CC multiplexer ADC channel enums to their corresponding pin mask
         * 
         */
        const std::array<uint32_t, 8> _CCLinePinMaskMap = {
            ADC_CHANNEL_PIN_MASK(0, 0, 0),  // DutCC1
            ADC_CHANNEL_PIN_MASK(1, 0, 0),  // DutCC2
            ADC_CHANNEL_PIN_MASK(0, 1, 0),  // UsdsCC1
            ADC_CHANNEL_PIN_MASK(1, 1, 0),  // UsdsCC2
            ADC_CHANNEL_PIN_MASK(0, 0, 1),  // Vcc3V3
            ADC_CHANNEL_PIN_MASK(1, 0, 1),  // VRef1V65
            ADC_CHANNEL_PIN_MASK(0, 1, 1),  // GroundReference
            ADC_CHANNEL_PIN_MASK(1, 1, 1)   // ADCVRef
        };

        AnalogMonitorReadings _readings; ///< Struct holding all current readings

        /**
         * @brief Read the voltage from a specific ADC channel
         * 
         * @param channel ADC channel number to read from
         * @return float Voltage reading in volts
         */
        float _readVoltageFromADCChannel(uint channel);

        /**
         * @brief Read the voltage from a specific CC line ADC channel
         * 
         * @param channel 
         * @return float 
         */
        float _readVoltageFromCCLineChannel(ADCChannel channel);

        /**
         * @brief Delay for a specified number of microseconds
         * 
         * @param us 
         */
        void _delay_us(uint32_t us);
    };

} // namespace T76::DRPD::PHY
