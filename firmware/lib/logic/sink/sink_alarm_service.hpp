/**
 * @file sink_alarm_service.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * This header defines the Sink-specific alarm service used by Sink policy
 * timers.
 *
 * The service is a thin wrapper around a dedicated Pico SDK alarm pool.
 * The pool is created from Core 1 and all Sink timer call sites schedule
 * and cancel alarms through this wrapper instead of global alarm APIs.
 */

#pragma once

#include <cstddef>
#include <cstdint>

#include <pico/time.h>


namespace T76::DRPD::Logic {

    /**
     * @brief Sink-owned wrapper around a dedicated Pico alarm pool.
     */
    class SinkAlarmService {
    public:
        /**
         * @brief Maximum number of timers reserved in the Sink alarm pool.
         */
        static constexpr size_t MaxAlarms = 8;

        /**
         * @brief Create the dedicated alarm pool from Core 1.
         */
        void initCore1();

        /**
         * @brief Add a one-shot alarm to the Sink-owned pool.
         * @param delayUs Relative delay in microseconds.
         * @param callback Pico alarm callback.
         * @param userData Opaque callback user data.
         * @param fireIfPast Fire immediately if target time is already in past.
         * @return Alarm ID returned by the Pico SDK alarm pool.
         */
        alarm_id_t addAlarmInUs(
            int64_t delayUs,
            alarm_callback_t callback,
            void *userData,
            bool fireIfPast);

        /**
         * @brief Cancel an alarm from the Sink-owned pool.
         * @param id Alarm ID to cancel.
         * @return True if canceled; false otherwise.
         */
        bool cancelAlarm(alarm_id_t id);

    protected:
        alarm_pool_t *_alarmPool = nullptr; ///< Dedicated Sink alarm pool (Core 1 owned).
    };

} // namespace T76::DRPD::Logic
