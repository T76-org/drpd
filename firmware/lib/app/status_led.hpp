/**
 * @file status_led.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Device status LED driver.
 *
 * The GPIO29 LED is active-high by default: logical "on" drives the pin high,
 * logical "off" drives it low. If bench validation shows the circuit is
 * active-low, flip the active level in status_led.cpp only.
 *
 * Pattern priority is selected by App before the LED task sees a mode:
 * OVP/OCP fault > firmware updater pending > USB host not mounted > normal
 * role/state patterns. The LED task adds a one-second startup burst before it
 * begins consuming App-provided modes.
 *
 * Pattern table:
 * - Startup: rapid 50 ms on / 50 ms off burst for the first 1 s after task start.
 * - Fault: 100 ms on / 100 ms off for latched OVP/OCP.
 * - FirmwareUpdaterPending: 250 ms on / 250 ms off before rebooting to updater.
 * - NoHost: 100 ms on / 1900 ms off when USB is not mounted/enumerated.
 * - Disabled: 500 ms on / 1500 ms off when host is present and CC role is disabled.
 * - ObserverNotAttached: 100 on / 100 off / 100 on / 1700 off.
 * - ObserverAttached: 1900 ms on / 100 ms off.
 * - SinkNotConnected: 100 on / 100 off / 100 on / 100 off / 100 on / 1500 off.
 * - SinkNegotiating: 100 on / 100 off / 600 on / 1200 off.
 * - SinkConnected: solid on.
 * - SinkError: SOS-style grouped flashes.
 */

#pragma once

#include <cstddef>
#include <cstdint>

#include <FreeRTOS.h>
#include <task.h>

namespace T76::DRPD {

    enum class StatusLedMode : uint8_t {
        NoHost,
        Disabled,
        ObserverNotAttached,
        ObserverAttached,
        SinkNotConnected,
        SinkNegotiating,
        SinkConnected,
        SinkError,
        FirmwareUpdaterPending,
        Fault,
    };

    class StatusLed {
    public:
        using ModeProvider = StatusLedMode (*)(void *context);

        struct PatternSegment {
            bool on;
            uint16_t durationMs;
        };

        /**
         * @brief Initialize the status LED GPIO and drive it off.
         */
        void init();

        /**
         * @brief Start the low-priority FreeRTOS task that owns LED timing.
         *
         * @param provider Function that returns the current app-selected LED mode.
         * @param context Opaque context passed back to provider.
         */
        void start(ModeProvider provider, void *context);

        /**
         * @brief Drive the LED off for safe shutdown/fault handling.
         */
        void makeSafe();

    private:
        static constexpr TickType_t _taskPeriodTicks = pdMS_TO_TICKS(25);
        static constexpr uint32_t _startupDurationMs = 1000;
        static constexpr uint32_t _taskStackDepth = 512;

        static void _taskEntry(void *param);

        void _task();
        void _write(bool on);

        StatusLedMode _currentMode{StatusLedMode::NoHost};
        const PatternSegment *_currentPattern{nullptr};
        size_t _currentPatternLength{0};
        size_t _currentSegmentIndex{0};
        uint32_t _segmentElapsedMs{0};
        uint32_t _taskElapsedMs{0};
        bool _lastOutput{false};
        bool _started{false};
        ModeProvider _provider{nullptr};
        void *_providerContext{nullptr};
        TaskHandle_t _taskHandle{nullptr};
    };

} // namespace T76::DRPD
