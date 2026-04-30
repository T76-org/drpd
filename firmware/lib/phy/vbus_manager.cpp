/**
 * @file vbus_manager.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "vbus_manager.hpp"


using namespace T76::DRPD::PHY;


void VBusManager::initCore1() {
    // Set up a recurring timer on core 1 to monitor VBUS status

    add_repeating_timer_us(
        -1000000 / PHY_VBUS_MANAGER_VBUS_WATCHDOG_FREQUENCY_HZ,
        VBusManager::_timerCallback, 
        this, 
        &_timer);
}

bool VBusManager::activate() {
    gpio_set_function(PHY_VBUS_MANAGER_VBUS_EN_PIN, GPIO_FUNC_SIO);
    gpio_init(PHY_VBUS_MANAGER_VBUS_EN_PIN);
    gpio_put(PHY_VBUS_MANAGER_VBUS_EN_PIN, false);
    gpio_set_dir(PHY_VBUS_MANAGER_VBUS_EN_PIN, GPIO_OUT);

    gpio_set_function(PHY_VBUS_MANAGER_VBUS_EN_USDS_PIN, GPIO_FUNC_SIO);
    gpio_init(PHY_VBUS_MANAGER_VBUS_EN_USDS_PIN);
    gpio_put(PHY_VBUS_MANAGER_VBUS_EN_USDS_PIN, false);
    gpio_set_dir(PHY_VBUS_MANAGER_VBUS_EN_USDS_PIN, GPIO_OUT);

    enabled(false);

    return true;
}

void VBusManager::makeSafe() {
    gpio_put(PHY_VBUS_MANAGER_VBUS_EN_PIN, false);
    gpio_put(PHY_VBUS_MANAGER_VBUS_EN_USDS_PIN, false);
}

bool VBusManager::enabled() {
    return gpio_get(PHY_VBUS_MANAGER_VBUS_EN_PIN);
}

void VBusManager::enabled(bool value) {
    if (_fault && value) {
        // Refuse to enable if in fault state
        return;
    }

    bool previousState = _enabled;

    if (!_fault) {
        _enabled = value;
        _state = value ? VBusState::Enabled : VBusState::Disabled;
    }

    gpio_put(PHY_VBUS_MANAGER_VBUS_EN_PIN, value);
    gpio_put(PHY_VBUS_MANAGER_VBUS_EN_USDS_PIN, value);

    if (_managerChangedCallback) {
        _managerChangedCallback();
    }
}

VBusState VBusManager::state() {
    return _state;
}

/**
 * @brief Return the most recently latched OVP event timestamp.
 *
 * The timestamp is captured in microseconds using the device monotonic
 * timebase at the moment the OVP watchdog condition is detected. A value
 * of 0 indicates that no OVP event is currently latched.
 *
 * @return uint64_t Latched OVP event timestamp in microseconds, or 0.
 */
uint64_t VBusManager::lastOvpEventTimestampUs() const {
    return _lastOvpEventTimestampUs;
}

/**
 * @brief Return the most recently latched OCP event timestamp.
 *
 * The timestamp is captured in microseconds using the device monotonic
 * timebase at the moment the OCP watchdog condition is detected. A value
 * of 0 indicates that no OCP event is currently latched.
 *
 * @return uint64_t Latched OCP event timestamp in microseconds, or 0.
 */
uint64_t VBusManager::lastOcpEventTimestampUs() const {
    return _lastOcpEventTimestampUs;
}

/**
 * @brief Clear the current VBUS fault state and any latched event timestamps.
 *
 * Reset removes both the active fault latch and the retained OVP/OCP event
 * timestamps so subsequent SCPI status queries report no stored protection
 * event until a new fault is observed. The previously requested enable state
 * is then re-applied through enabled().
 */
void VBusManager::reset() {
    _fault = false;
    _lastOvpEventTimestampUs = 0;
    _lastOcpEventTimestampUs = 0;

    enabled(_enabled); // Re-apply the enabled state (will trigger notification)
}

float VBusManager::ovpThreshold() const {
    return _ovpThreshold;
}

void VBusManager::ovpThreshold(float threshold) {
    _ovpThreshold = threshold;
    if (_managerChangedCallback) {
        _managerChangedCallback();
    }
}

float VBusManager::ocpThreshold() const {
    return _ocpThreshold;
}

void VBusManager::ocpThreshold(float threshold) {
    _ocpThreshold = threshold;
    if (_managerChangedCallback) {
        _managerChangedCallback();
    }
}

void VBusManager::managerChangedCallback(std::function<void()> callback) {
    _managerChangedCallback = std::move(callback);
}

void VBusManager::applyPersistentConfig(const T76::DRPD::VBusPersistentConfig &config) {
    ovpThreshold(config.ovpThresholdVolts);
    ocpThreshold(config.ocpThresholdAmps);
}

T76::DRPD::VBusPersistentConfig VBusManager::exportPersistentConfig() const {
    return T76::DRPD::VBusPersistentConfig{
        .ovpThresholdVolts = _ovpThreshold,
        .ocpThresholdAmps = _ocpThreshold,
    };
}

bool VBusManager::_timerCallback(repeating_timer_t *rt) {
    // Get the VBusManager instance from the timer's user_data
    VBusManager* manager = static_cast<VBusManager*>(rt->user_data);

    if (manager->_fault) {
        // Do not monitor if in fault state
        return true;
    }

    // Read the current VBUS voltage and current

    float voltage = manager->_analogMonitor.vBusVoltage();
    float current = manager->_analogMonitor.vBusCurrent();

    // Check for overvoltage and overcurrent conditions

    if (manager->_enabled) {
        if (voltage > manager->_ovpThreshold) {
            manager->_lastOvpEventTimestampUs = time_us_64();
            manager->_state = VBusState::OverVoltage;
            manager->_fault = true;
            manager->enabled(false); // Disable VBUS on fault (will trigger notification)
        } else if (current > manager->_ocpThreshold) {
            manager->_lastOcpEventTimestampUs = time_us_64();
            manager->_state = VBusState::OverCurrent;
            manager->_fault = true;
            manager->enabled(false); // Disable VBUS on fault (will trigger notification)
        }
    }

    // Return true to continue the timer
    return true;
}
