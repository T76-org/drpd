/**
 * @file sink_alarm_service.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * This header defines the Sink-specific alarm service used by Sink policy
 * timers.
 *
 * The service owns one dedicated Pico SDK alarm pool. That pool is created
 * from Core 1 and then used by Sink timer call sites instead of global alarm
 * APIs. This keeps timer ownership explicit while preserving existing callback
 * behavior.
 */

#pragma once

#include <atomic>
#include <cstdint>

#include <pico/time.h>


namespace T76::DRPD::Logic {

    /**
     * @brief Sink-owned wrapper around a dedicated Pico alarm pool.
     */
    class SinkAlarmService {
    public:
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
         * @return Alarm ID on success, or -1 if service is not initialized.
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

        /**
         * @brief Check whether Core-1 pool initialization is complete.
         * @return True when initialized; otherwise false.
         */
        bool initialized() const;

    protected:
        std::atomic<alarm_pool_t *> _pool = nullptr; ///< Sink-owned alarm pool pointer.
    };

} // namespace T76::DRPD::Logic
