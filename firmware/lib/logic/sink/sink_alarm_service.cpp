/**
 * @file sink_alarm_service.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "sink_alarm_service.hpp"

#include <pico/multicore.h>


using namespace T76::DRPD::Logic;


void SinkAlarmService::initCore1() {
    if (get_core_num() != 1) {
        return;
    }

    if (_pool.load(std::memory_order_acquire) != nullptr) {
        return;
    }

    // Use an unused hardware alarm for Sink timers and keep the pool private to Sink.
    alarm_pool_t *pool = alarm_pool_create_with_unused_hardware_alarm(16);
    _pool.store(pool, std::memory_order_release);
}

alarm_id_t SinkAlarmService::addAlarmInUs(
    int64_t delayUs,
    alarm_callback_t callback,
    void *userData,
    bool fireIfPast) {
    alarm_pool_t *pool = _pool.load(std::memory_order_acquire);
    if (pool == nullptr) {
        return -1;
    }

    return alarm_pool_add_alarm_in_us(pool, delayUs, callback, userData, fireIfPast);
}

bool SinkAlarmService::cancelAlarm(alarm_id_t id) {
    alarm_pool_t *pool = _pool.load(std::memory_order_acquire);
    if (pool == nullptr || id == -1) {
        return false;
    }

    return alarm_pool_cancel_alarm(pool, id);
}

bool SinkAlarmService::initialized() const {
    return _pool.load(std::memory_order_acquire) != nullptr;
}
