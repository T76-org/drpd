/**
 * @file sync_manager.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "sync_manager.hpp"

#include <hardware/gpio.h>
#include <hardware/timer.h>


using namespace T76::DRPD::PHY;

int64_t SyncManager::_restorePulseHigh(alarm_id_t id, void *user_data) {
    (void) id;
    (void) user_data;
    gpio_put(PHY_SYNC_MANAGER_SYNC_PIN, false);
    return 0;
}

int64_t SyncManager::_restorePulseLow(alarm_id_t id, void *user_data) {
    (void) id;
    (void) user_data;
    gpio_put(PHY_SYNC_MANAGER_SYNC_PIN, true);
    return 0;
}

int64_t SyncManager::_restorePullDown(alarm_id_t id, void *user_data) {
    (void) id;
    (void) user_data;
    _enterHighImpedance();
    return 0;
}

void SyncManager::_enterHighImpedance() {
    gpio_disable_pulls(PHY_SYNC_MANAGER_SYNC_PIN);
    gpio_set_input_enabled(PHY_SYNC_MANAGER_SYNC_PIN, false);
    gpio_set_dir(PHY_SYNC_MANAGER_SYNC_PIN, GPIO_IN);
}

void SyncManager::_enterPullDownMode() {
    gpio_set_dir(PHY_SYNC_MANAGER_SYNC_PIN, GPIO_IN);
    gpio_set_input_enabled(PHY_SYNC_MANAGER_SYNC_PIN, false);
    gpio_set_pulls(PHY_SYNC_MANAGER_SYNC_PIN, false, true);
}

void SyncManager::_applyModeIdleState() {
    switch(_mode) {
        case SyncManagerMode::PulseHigh:
            gpio_disable_pulls(PHY_SYNC_MANAGER_SYNC_PIN);
            gpio_set_input_enabled(PHY_SYNC_MANAGER_SYNC_PIN, false);
            gpio_put(PHY_SYNC_MANAGER_SYNC_PIN, 0);
            gpio_set_dir(PHY_SYNC_MANAGER_SYNC_PIN, GPIO_OUT);
            break;

        case SyncManagerMode::PulseLow:
            gpio_disable_pulls(PHY_SYNC_MANAGER_SYNC_PIN);
            gpio_set_input_enabled(PHY_SYNC_MANAGER_SYNC_PIN, false);
            gpio_put(PHY_SYNC_MANAGER_SYNC_PIN, 1);
            gpio_set_dir(PHY_SYNC_MANAGER_SYNC_PIN, GPIO_OUT);
            break;

        case SyncManagerMode::Toggle:
            gpio_disable_pulls(PHY_SYNC_MANAGER_SYNC_PIN);
            gpio_set_input_enabled(PHY_SYNC_MANAGER_SYNC_PIN, false);
            gpio_set_dir(PHY_SYNC_MANAGER_SYNC_PIN, GPIO_OUT);
            break;

        case SyncManagerMode::PullDown:
            _enterHighImpedance();
            break;
    }
}

void SyncManager::mode(SyncManagerMode mode) {
    _mode = mode;

    // Reapply hardware state even when the mode value is unchanged so callers can
    // restore the configured operating mode after makeSafe() forced the pin high-Z.
    _applyModeIdleState();
}

SyncManagerMode SyncManager::mode() const {
    return _mode;
}

uint32_t SyncManager::pulseWidth() const {
    return _pulseWidthUs;
}

void SyncManager::pulseWidth(uint32_t widthUs) {
    _pulseWidthUs = widthUs;
}

void SyncManager::performSync() {
    switch(_mode) {
        case SyncManagerMode::PulseHigh:
            gpio_put(PHY_SYNC_MANAGER_SYNC_PIN, true);

            // Set a one-shot timer for _pulseWidthUs to set it low again
            add_alarm_in_us(
                _pulseWidthUs,
                _restorePulseHigh,
                nullptr,
                true /* fire_if_past */
            );
            
            break;

        case SyncManagerMode::PulseLow:
            gpio_put(PHY_SYNC_MANAGER_SYNC_PIN, false);

            // Set a one-shot timer for _pulseWidthUs to set it high again
            add_alarm_in_us(
                _pulseWidthUs,
                _restorePulseLow,
                nullptr,
                true /* fire_if_past */
            );

            break;

        case SyncManagerMode::Toggle:
            gpio_xor_mask(1u << PHY_SYNC_MANAGER_SYNC_PIN);
            break;

        case SyncManagerMode::PullDown:
            _enterPullDownMode();

            add_alarm_in_us(
                _pulseWidthUs,
                _restorePullDown,
                nullptr,
                true /* fire_if_past */
            );
            break;
    }
}

bool SyncManager::activate() {
    gpio_set_function(PHY_SYNC_MANAGER_SYNC_PIN, GPIO_FUNC_SIO);
    gpio_init(PHY_SYNC_MANAGER_SYNC_PIN);
    _enterHighImpedance();
    _applyModeIdleState();

    return true;
}

void SyncManager::makeSafe() {
    // Failsafe must always leave the pin high-Z regardless of the configured mode.
    _enterHighImpedance();
}
