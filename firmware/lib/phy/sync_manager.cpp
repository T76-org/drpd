/**
 * @file sync_manager.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "sync_manager.hpp"

#include <hardware/timer.h>


using namespace T76::DRPD::PHY;


void SyncManager::mode(SyncManagerMode mode) {
    if (_mode == mode) {
        return;
    }

    _mode = mode;

    switch(mode) {
        case SyncManagerMode::Off:
            gpio_set_dir(PHY_SYNC_MANAGER_SYNC_PIN, GPIO_IN);
            break;

        case SyncManagerMode::PulseHigh:
            gpio_set_dir(PHY_SYNC_MANAGER_SYNC_PIN, GPIO_OUT);
            gpio_put(PHY_SYNC_MANAGER_SYNC_PIN, 0);
            break;

        case SyncManagerMode::PulseLow:
            gpio_set_dir(PHY_SYNC_MANAGER_SYNC_PIN, GPIO_OUT);
            gpio_put(PHY_SYNC_MANAGER_SYNC_PIN, 1);
            break;

        case SyncManagerMode::Toggle:
            gpio_set_dir(PHY_SYNC_MANAGER_SYNC_PIN, GPIO_OUT);
            break;
    }
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
        case SyncManagerMode::Off:
            // Do nothing
            break;

        case SyncManagerMode::PulseHigh:
            gpio_put(PHY_SYNC_MANAGER_SYNC_PIN, true);

            // Set a one-shot timer for _pulseWidthUs to set it low again
            add_alarm_in_us(
                _pulseWidthUs,
                [](alarm_id_t id, void *user_data) -> int64_t {
                    gpio_put(PHY_SYNC_MANAGER_SYNC_PIN, false);
                    return 0; // Don't reschedule
                },
                nullptr,
                true /* fire_if_past */
            );
            
            break;

        case SyncManagerMode::PulseLow:
            gpio_put(PHY_SYNC_MANAGER_SYNC_PIN, false);

            // Set a one-shot timer for _pulseWidthUs to set it high again
            add_alarm_in_us(
                _pulseWidthUs,
                [](alarm_id_t id, void *user_data) -> int64_t {
                    gpio_put(PHY_SYNC_MANAGER_SYNC_PIN, true);
                    return 0; // Don't reschedule
                },
                nullptr,
                true /* fire_if_past */
            );

            break;

        case SyncManagerMode::Toggle:
            gpio_xor_mask(1u << PHY_SYNC_MANAGER_SYNC_PIN);
            break;
    }
}

bool SyncManager::activate() {
    gpio_set_function(PHY_SYNC_MANAGER_SYNC_PIN, GPIO_FUNC_SIO);
    gpio_init(PHY_SYNC_MANAGER_SYNC_PIN);
    gpio_set_dir(PHY_SYNC_MANAGER_SYNC_PIN, GPIO_IN); // Start as input

    mode(SyncManagerMode::Off);

    return true;
}

void SyncManager::makeSafe() {
    mode(SyncManagerMode::Off);
}