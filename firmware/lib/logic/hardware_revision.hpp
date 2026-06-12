/**
 * @file hardware_revision.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * The HardwareRevisionConfig class detects which supported PCB revision the
 * firmware is running on. The board straps GPIO24 low on R2605-A; otherwise the
 * firmware enables the internal pull-up and treats the board as R2603-A.
 *
 * Detection is sampled once during app startup and then cached. Future
 * board-specific behavior should depend on this cached value instead of reading
 * the strap repeatedly, so runtime behavior stays stable after initialization.
 */

#pragma once

#include <cstdint>


namespace T76::DRPD::Logic {

    /**
     * @brief Supported DRPD hardware revisions.
     */
    enum class HardwareRevision : uint32_t {
        R2603A = 0,    ///< R2603-A board revision.
        R2605A,        ///< R2605-A board revision.
    };

    /**
     * @brief Detects and exposes the board hardware revision.
     */
    class HardwareRevisionConfig {
    public:
        /**
         * @brief Initialize the detect GPIO and cache the detected hardware revision.
         */
        void init();

        /**
         * @brief Return the cached hardware revision.
         *
         * @return HardwareRevision Cached board hardware revision.
         */
        HardwareRevision revision() const;

        /**
         * @brief Return the cached hardware revision as a host-facing board code.
         *
         * @return const char * Board code string, either `R2603-A` or `R2605-A`.
         */
        const char *revisionString() const;

    };

}

