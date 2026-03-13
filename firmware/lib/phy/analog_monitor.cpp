/**
 * @file analog_monitor.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "analog_monitor.hpp"

#include <algorithm>
#include <cassert>
#include <cmath>
#include <limits>

#include <pico/stdlib.h>
#include <hardware/adc.h>


using namespace T76::DRPD::PHY;


#define ANALOG_MONITOR_CC_SEL_PIN_MASK ((1 << PHY_ANALOG_MONITOR_CC_SENSE_SEL_0_PIN) | \
                                        (1 << PHY_ANALOG_MONITOR_CC_SENSE_SEL_1_PIN) | \
                                        (1 << PHY_ANALOG_MONITOR_CC_SENSE_SEL_2_PIN))

#define SELECT_PIN_MASK_FOR_CHANNEL(channel) gpio_put_masked(ANALOG_MONITOR_CC_SEL_PIN_MASK, _CCLinePinMaskMap[static_cast<size_t>(channel)])

namespace {
    constexpr uint64_t ChargeMahDenominator = 360000000ULL;
    constexpr uint64_t EnergyMwhDenominator = 36000000000ULL;
}

void AnalogMonitor::init() {
    adc_init(); // Initialize ADC hardware

    _adcAccessMutex = xSemaphoreCreateMutex();
    _readings.captureTimestampUs = 0;
    _readings.accumulationStartTimestampUs = 0;
    _readings.lastAccumulationTimestampUs = 0;
    _readings.accumulatedChargeMah = 0;
    _readings.accumulatedEnergyMwh = 0;
    _chargeAccumulationResidue = 0;
    _energyAccumulationResidue = 0;

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
    int32_t truncatedVBusVoltageCentiV = static_cast<int32_t>(std::trunc(vbusVoltage * 100.0f));
    float truncatedVBusVoltage = static_cast<float>(truncatedVBusVoltageCentiV) / 100.0f;

    _readings.vBusVoltageAverager.addSample(truncatedVBusVoltage);

    // Read current, scale and accumulate in averager. Note that the current sense reading is relative to both a ground reference and a zero-current reference, so we need to subtract both before scaling.
    float currentZeroReference = _readVoltageFromCCLineChannel(ADCChannel::VRef1V65) - groundReference;

    SELECT_PIN_MASK_FOR_CHANNEL(PHY_ANALOG_MONITOR_VBUS_ISENSE_ADC_CHANNEL);
    float currentSense = _readVoltageFromADCChannel(PHY_ANALOG_MONITOR_VBUS_ISENSE_ADC_CHANNEL) - groundReference - currentZeroReference;
    float vBusCurrent = currentSense * PHY_ANALOG_MONITOR_VBUS_ISENSE_SCALE_FACTOR;
    int32_t truncatedVBusCurrentCentiA = static_cast<int32_t>(std::trunc(vBusCurrent * 100.0f));
    float truncatedVBusCurrent = static_cast<float>(truncatedVBusCurrentCentiA) / 100.0f;

    _readings.vBusCurrentAverager.addSample(truncatedVBusCurrent);

    // Timestamp reflects when the VBUS voltage/current capture completed.
    _readings.captureTimestampUs = time_us_64();
    uint64_t integrationTimestampUs = _readings.captureTimestampUs;

    if (_readings.accumulationStartTimestampUs == 0 || _readings.lastAccumulationTimestampUs == 0) {
        _readings.accumulationStartTimestampUs = integrationTimestampUs;
        _readings.lastAccumulationTimestampUs = integrationTimestampUs;
    } else if (integrationTimestampUs > _readings.lastAccumulationTimestampUs) {
        uint64_t deltaUs = integrationTimestampUs - _readings.lastAccumulationTimestampUs;
        uint64_t absoluteCurrentCentiA = static_cast<uint64_t>(std::abs(truncatedVBusCurrentCentiA));
        uint64_t voltageCentiV = static_cast<uint64_t>(
            std::max(truncatedVBusVoltageCentiV, static_cast<int32_t>(0)));

        if (_readings.accumulatedChargeMah < std::numeric_limits<uint32_t>::max()) {
            _chargeAccumulationResidue += absoluteCurrentCentiA * deltaUs;
            uint64_t additionalChargeMah = _chargeAccumulationResidue / ChargeMahDenominator;
            _chargeAccumulationResidue %= ChargeMahDenominator;

            if (additionalChargeMah > 0) {
                uint64_t remainingChargeMah =
                    std::numeric_limits<uint32_t>::max() - _readings.accumulatedChargeMah;
                if (additionalChargeMah >= remainingChargeMah) {
                    _readings.accumulatedChargeMah = std::numeric_limits<uint32_t>::max();
                    _chargeAccumulationResidue = 0;
                } else {
                    _readings.accumulatedChargeMah += static_cast<uint32_t>(additionalChargeMah);
                }
            }
        }

        if (_readings.accumulatedEnergyMwh < std::numeric_limits<uint32_t>::max()) {
            _energyAccumulationResidue += voltageCentiV * absoluteCurrentCentiA * deltaUs;
            uint64_t additionalEnergyMwh = _energyAccumulationResidue / EnergyMwhDenominator;
            _energyAccumulationResidue %= EnergyMwhDenominator;

            if (additionalEnergyMwh > 0) {
                uint64_t remainingEnergyMwh =
                    std::numeric_limits<uint32_t>::max() - _readings.accumulatedEnergyMwh;
                if (additionalEnergyMwh >= remainingEnergyMwh) {
                    _readings.accumulatedEnergyMwh = std::numeric_limits<uint32_t>::max();
                    _energyAccumulationResidue = 0;
                } else {
                    _readings.accumulatedEnergyMwh += static_cast<uint32_t>(additionalEnergyMwh);
                }
            }
        }

        _readings.lastAccumulationTimestampUs = integrationTimestampUs;
    }

    xSemaphoreGive(_adcAccessMutex);
}

void AnalogMonitor::readCCLineValues() {
    xSemaphoreTake(_adcAccessMutex, portMAX_DELAY);

    _readings.groundRefVoltage = std::trunc(
        _readVoltageFromCCLineChannel(ADCChannel::GroundReference) * 100.0f) / 100.0f;
    _readings.dutCC1Voltage = std::trunc(
        _readVoltageFromCCLineChannel(ADCChannel::DutCC1) * 100.0f) / 100.0f;
    _readings.dutCC2Voltage = std::trunc(
        _readVoltageFromCCLineChannel(ADCChannel::DutCC2) * 100.0f) / 100.0f;
    _readings.usdsCC1Voltage = std::trunc(
        _readVoltageFromCCLineChannel(ADCChannel::UsdsCC1) * 100.0f) / 100.0f;
    _readings.usdsCC2Voltage = std::trunc(
        _readVoltageFromCCLineChannel(ADCChannel::UsdsCC2) * 100.0f) / 100.0f;
    _readings.adcVRefVoltage = std::trunc(
        _readVoltageFromCCLineChannel(ADCChannel::ADCVRef) * 100.0f) / 100.0f;
    _readings.currentRefVoltage = std::trunc(
        _readVoltageFromCCLineChannel(ADCChannel::VRef1V65) * 100.0f) / 100.0f;

    xSemaphoreGive(_adcAccessMutex);
}

void AnalogMonitor::resetAccumulatedMeasurements() {
    xSemaphoreTake(_adcAccessMutex, portMAX_DELAY);

    uint64_t resetTimestampUs = time_us_64();
    _readings.accumulationStartTimestampUs = resetTimestampUs;
    _readings.lastAccumulationTimestampUs = resetTimestampUs;
    _readings.accumulatedChargeMah = 0;
    _readings.accumulatedEnergyMwh = 0;
    _chargeAccumulationResidue = 0;
    _energyAccumulationResidue = 0;

    xSemaphoreGive(_adcAccessMutex);
}

float AnalogMonitor::vBusVoltage() const {
    return std::trunc(_readings.vBusVoltageAverager.average() * 100.0f) / 100.0f;
}

float AnalogMonitor::vBusCurrent() const {
    return std::trunc(_readings.vBusCurrentAverager.average() * 100.0f) / 100.0f;
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

uint32_t AnalogMonitor::accumulatedChargeMah() const {
    return _readings.accumulatedChargeMah;
}

uint32_t AnalogMonitor::accumulatedEnergyMwh() const {
    return _readings.accumulatedEnergyMwh;
}

uint64_t AnalogMonitor::accumulationElapsedTimeUs() const {
    if (_readings.accumulationStartTimestampUs == 0 ||
        _readings.lastAccumulationTimestampUs < _readings.accumulationStartTimestampUs) {
        return 0;
    }

    return _readings.lastAccumulationTimestampUs - _readings.accumulationStartTimestampUs;
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
    assert(channel <= ADCChannel::ADCVRef);
    
    // select the desired channel
    SELECT_PIN_MASK_FOR_CHANNEL(channel);
    return std::max(0.0f, _readVoltageFromADCChannel(PHY_ANALOG_MONITOR_CC_SENSE_ADC_CHANNEL)) * PHY_ANALOG_MONITOR_CC_SENSE_SCALE_FACTOR;
}
