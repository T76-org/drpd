/**
 * @file sink_alarm_service.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "sink_alarm_service.hpp"

#include <pico/platform.h>


using namespace T76::DRPD::Logic;


void SinkAlarmService::initCore1() {
    if (get_core_num() != 1) {
        panic("SinkAlarmService::initCore1 must run on core 1");
    }

    if (_alarmPool != nullptr) {
        panic("SinkAlarmService::initCore1 called more than once");
    }

    _alarmPool = alarm_pool_create_with_unused_hardware_alarm(static_cast<uint>(MaxAlarms));
    if (_alarmPool == nullptr) {
        panic("SinkAlarmService failed to create alarm pool");
    }
}

alarm_id_t SinkAlarmService::addAlarmInUs(
    int64_t delayUs,
    alarm_callback_t callback,
    void *userData,
    bool fireIfPast) {
    if (_alarmPool == nullptr) {
        panic("SinkAlarmService::addAlarmInUs called before initCore1");
    }

    if (callback == nullptr) {
        panic("SinkAlarmService::addAlarmInUs requires a non-null callback");
    }

    const alarm_id_t id = alarm_pool_add_alarm_in_us(
        _alarmPool,
        delayUs,
        callback,
        userData,
        fireIfPast);

    if (id <= 0) {
        panic("SinkAlarmService failed to schedule alarm");
    }

    return id;
}

bool SinkAlarmService::cancelAlarm(alarm_id_t id) {
    if (_alarmPool == nullptr) {
        panic("SinkAlarmService::cancelAlarm called before initCore1");
    }

    if (id <= 0) {
        return false;
    }

    return alarm_pool_cancel_alarm(_alarmPool, id);
}
