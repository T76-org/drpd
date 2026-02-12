/**
 * @file analog_monitor.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "analog_monitor.hpp"

#include <algorithm>

#include <pico/stdlib.h>
#include <hardware/adc.h>


using namespace T76::DRPD::PHY;


#define ANALOG_MONITOR_CC_SEL_PIN_MASK ((1 << PHY_ANALOG_MONITOR_CC_SENSE_SEL_0_PIN) | \
                                        (1 << PHY_ANALOG_MONITOR_CC_SENSE_SEL_1_PIN) | \
                                        (1 << PHY_ANALOG_MONITOR_CC_SENSE_SEL_2_PIN))

#define SELECT_PIN_MASK_FOR_CHANNEL(channel) gpio_put_masked(ANALOG_MONITOR_CC_SEL_PIN_MASK, _CCLinePinMaskMap[static_cast<size_t>(channel)])

void AnalogMonitor::init() {
    adc_init(); // Initialize ADC hardware

    _adcAccessMutex = xSemaphoreCreateMutex();
    _readings.captureTimestampUs = 0;

    adc_gpio_init(PHY_ANALOG_MONITOR_VBUS_SENSE_PIN);
    adc_gpio_init(PHY_ANALOG_MONITOR_VBUS_ISENSE_PIN);
    adc_gpio_init(PHY_ANALOG_MONITOR_CC_SENSE_PIN);

    gpio_set_function(PHY_ANALOG_MONITOR_CC_SENSE_SEL_0_PIN, GPIO_FUNC_SIO);
    gpio_init(PHY_ANALOG_MONITOR_CC_SENSE_SEL_0_PIN);
    gpio_put(PHY_ANALOG_MONITOR_CC_SENSE_SEL_0_PIN, 0);
    gpio_set_dir(PHY_ANALOG_MONITOR_CC_SENSE_SEL_0_PIN, GPIO_OUT);

    gpio_set_function(PHY_ANALOG_MONITOR_CC_SENSE_SEL_1_PIN, GPIO_FUNC_SIO);
    gpio_init(PHY_ANALOG_MONITOR_CC_SENSE_SEL_1_PIN);
    gpio_put(PHY_ANALOG_MONITOR_CC_SENSE_SEL_1_PIN, 0);
    gpio_set_dir(PHY_ANALOG_MONITOR_CC_SENSE_SEL_1_PIN, GPIO_OUT);

    gpio_set_function(PHY_ANALOG_MONITOR_CC_SENSE_SEL_2_PIN, GPIO_FUNC_SIO);
    gpio_init(PHY_ANALOG_MONITOR_CC_SENSE_SEL_2_PIN);
    gpio_put(PHY_ANALOG_MONITOR_CC_SENSE_SEL_2_PIN, 0);
    gpio_set_dir(PHY_ANALOG_MONITOR_CC_SENSE_SEL_2_PIN, GPIO_OUT);
}

void AnalogMonitor::readVBusValues() {
    // Prevent other tasks from accessing the ADC while we read VBus values
    xSemaphoreTake(_adcAccessMutex, portMAX_DELAY);

    // Get a ground ref

    float groundReference = _readVoltageFromCCLineChannel(ADCChannel::GroundReference);

    // Read voltage, scale and accumulate in averager
    SELECT_PIN_MASK_FOR_CHANNEL(PHY_ANALOG_MONITOR_VBUS_SENSE_ADC_CHANNEL);
    float vbusVoltage = std::max(
        0.0f, 
        _readVoltageFromADCChannel(PHY_ANALOG_MONITOR_VBUS_SENSE_ADC_CHANNEL) - groundReference) * 
        PHY_ANALOG_MONITOR_VBUS_SENSE_SCALE_FACTOR;

    _readings.vBusVoltageAverager.addSample(vbusVoltage);

    // Read current, scale and accumulate in averager. Note that the current sense reading is relative to both a ground reference and a zero-current reference, so we need to subtract both before scaling.
    float currentZeroReference = _readVoltageFromCCLineChannel(ADCChannel::VRef1V65) - groundReference;

    SELECT_PIN_MASK_FOR_CHANNEL(PHY_ANALOG_MONITOR_VBUS_ISENSE_ADC_CHANNEL);
    float currentSense = _readVoltageFromADCChannel(PHY_ANALOG_MONITOR_VBUS_ISENSE_ADC_CHANNEL) - groundReference - currentZeroReference;

    _readings.vBusCurrentAverager.addSample(currentSense * PHY_ANALOG_MONITOR_VBUS_ISENSE_SCALE_FACTOR);

    // Timestamp reflects when the VBUS voltage/current capture completed.
    _readings.captureTimestampUs = time_us_64();

    xSemaphoreGive(_adcAccessMutex);
}

void AnalogMonitor::readCCLineValues() {
    xSemaphoreTake(_adcAccessMutex, portMAX_DELAY);

    _readings.groundRefVoltage = _readVoltageFromCCLineChannel(ADCChannel::GroundReference);
    _readings.dutCC1Voltage = _readVoltageFromCCLineChannel(ADCChannel::DutCC1);
    _readings.dutCC2Voltage = _readVoltageFromCCLineChannel(ADCChannel::DutCC2);
    _readings.usdsCC1Voltage = _readVoltageFromCCLineChannel(ADCChannel::UsdsCC1);
    _readings.usdsCC2Voltage = _readVoltageFromCCLineChannel(ADCChannel::UsdsCC2);
    _readings.adcVRefVoltage = _readVoltageFromCCLineChannel(ADCChannel::ADCVRef);
    _readings.currentRefVoltage = _readVoltageFromCCLineChannel(ADCChannel::VRef1V65);

    xSemaphoreGive(_adcAccessMutex);
}

float AnalogMonitor::vBusVoltage() const {
    return _readings.vBusVoltageAverager.average();
}

float AnalogMonitor::vBusCurrent() const {
    return _readings.vBusCurrentAverager.average();
}

float AnalogMonitor::dutCC1Voltage() const {
    return _readings.dutCC1Voltage;
}

float AnalogMonitor::dutCC2Voltage() const {
    return _readings.dutCC2Voltage;
}

float AnalogMonitor::usdsCC1Voltage() const {
    return _readings.usdsCC1Voltage;
}

float AnalogMonitor::usdsCC2Voltage() const {
    return _readings.usdsCC2Voltage;
}

float AnalogMonitor::adcVRefVoltage() const {
    return _readings.adcVRefVoltage;
}

float AnalogMonitor::groundRefVoltage() const {
    return _readings.groundRefVoltage;
}

float AnalogMonitor::currentRefVoltage() const {
    return _readings.currentRefVoltage;
}

AnalogMonitorReadings AnalogMonitor::allReadings() const {
    return _readings;
}

void inline AnalogMonitor::_delay_us(uint32_t us) {
    absolute_time_t start = get_absolute_time();
    while (absolute_time_diff_us(start, get_absolute_time()) < static_cast<int64_t>(us)) {
        portYIELD();
    }
}

float inline AnalogMonitor::_readVoltageFromADCChannel(uint channel) {
    adc_select_input(channel);
    _delay_us(PHY_ANALOG_MONITOR_ADC_SETTLING_TIME_US); // Allow time to settle after switching

    return adc_read() / 4096.0f * PHY_ANALOG_MONITOR_ADC_VREF_VOLTAGE;
}

float inline AnalogMonitor::_readVoltageFromCCLineChannel(ADCChannel channel) {
    assert(channel <= ADCChannel::CurrentReference);
    
    // select the desired channel
    SELECT_PIN_MASK_FOR_CHANNEL(channel);
    return std::max(0.0f, _readVoltageFromADCChannel(PHY_ANALOG_MONITOR_CC_SENSE_ADC_CHANNEL)) * PHY_ANALOG_MONITOR_CC_SENSE_SCALE_FACTOR;
}
