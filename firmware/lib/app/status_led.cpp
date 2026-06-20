/**
 * @file status_led.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "status_led.hpp"

#include <hardware/gpio.h>

namespace T76::DRPD {

namespace {

constexpr bool kActiveLevel = true;

constexpr StatusLed::PatternSegment kStartup[] = {
    {true, 50},
    {false, 50},
};

constexpr StatusLed::PatternSegment kFault[] = {
    {true, 100},
    {false, 100},
};

constexpr StatusLed::PatternSegment kFirmwareUpdaterPending[] = {
    {true, 250},
    {false, 250},
};

constexpr StatusLed::PatternSegment kNoHost[] = {
    {true, 100},
    {false, 1900},
};

constexpr StatusLed::PatternSegment kDisabled[] = {
    {true, 500},
    {false, 1500},
};

constexpr StatusLed::PatternSegment kObserverNotAttached[] = {
    {true, 100},
    {false, 100},
    {true, 100},
    {false, 1700},
};

constexpr StatusLed::PatternSegment kObserverAttached[] = {
    {true, 1900},
    {false, 100},
};

constexpr StatusLed::PatternSegment kSinkNotConnected[] = {
    {true, 100},
    {false, 100},
    {true, 100},
    {false, 100},
    {true, 100},
    {false, 1500},
};

constexpr StatusLed::PatternSegment kSinkNegotiating[] = {
    {true, 100},
    {false, 100},
    {true, 600},
    {false, 1200},
};

constexpr StatusLed::PatternSegment kSinkConnected[] = {
    {true, 1000},
};

constexpr StatusLed::PatternSegment kSinkError[] = {
    {true, 100},
    {false, 100},
    {true, 100},
    {false, 100},
    {true, 100},
    {false, 300},
    {true, 300},
    {false, 100},
    {true, 300},
    {false, 100},
    {true, 300},
    {false, 300},
    {true, 100},
    {false, 100},
    {true, 100},
    {false, 100},
    {true, 100},
    {false, 1000},
};

template <size_t N>
constexpr size_t patternLength(const StatusLed::PatternSegment (&)[N]) {
    return N;
}

void patternForMode(
    StatusLedMode mode,
    const StatusLed::PatternSegment *&pattern,
    size_t &length
) {
    switch (mode) {
        case StatusLedMode::NoHost:
            pattern = kNoHost;
            length = patternLength(kNoHost);
            break;
        case StatusLedMode::Disabled:
            pattern = kDisabled;
            length = patternLength(kDisabled);
            break;
        case StatusLedMode::ObserverNotAttached:
            pattern = kObserverNotAttached;
            length = patternLength(kObserverNotAttached);
            break;
        case StatusLedMode::ObserverAttached:
            pattern = kObserverAttached;
            length = patternLength(kObserverAttached);
            break;
        case StatusLedMode::SinkNotConnected:
            pattern = kSinkNotConnected;
            length = patternLength(kSinkNotConnected);
            break;
        case StatusLedMode::SinkNegotiating:
            pattern = kSinkNegotiating;
            length = patternLength(kSinkNegotiating);
            break;
        case StatusLedMode::SinkConnected:
            pattern = kSinkConnected;
            length = patternLength(kSinkConnected);
            break;
        case StatusLedMode::SinkError:
            pattern = kSinkError;
            length = patternLength(kSinkError);
            break;
        case StatusLedMode::FirmwareUpdaterPending:
            pattern = kFirmwareUpdaterPending;
            length = patternLength(kFirmwareUpdaterPending);
            break;
        case StatusLedMode::Fault:
            pattern = kFault;
            length = patternLength(kFault);
            break;
    }
}

} // namespace

void StatusLed::init() {
    gpio_set_function(APP_STATUS_LED_PIN, GPIO_FUNC_SIO);
    gpio_init(APP_STATUS_LED_PIN);
    _lastOutput = true;
    _write(false);
    gpio_set_dir(APP_STATUS_LED_PIN, GPIO_OUT);
}

void StatusLed::start(ModeProvider provider, void *context) {
    if (_started) {
        return;
    }

    _provider = provider;
    _providerContext = context;
    _started = true;

    xTaskCreate(
        StatusLed::_taskEntry,
        "StatusLED",
        _taskStackDepth,
        this,
        tskIDLE_PRIORITY + 1,
        &_taskHandle
    );
}

void StatusLed::makeSafe() {
    _write(false);
}

void StatusLed::_taskEntry(void *param) {
    static_cast<StatusLed *>(param)->_task();
}

void StatusLed::_task() {
    TickType_t lastWakeTime = xTaskGetTickCount();

    for (;;) {
        const bool inStartup = _taskElapsedMs < _startupDurationMs;
        const StatusLedMode mode = inStartup
            ? _currentMode
            : (_provider != nullptr ? _provider(_providerContext) : StatusLedMode::NoHost);

        const PatternSegment *pattern = nullptr;
        size_t length = 0;
        if (inStartup) {
            pattern = kStartup;
            length = patternLength(kStartup);
        } else {
            patternForMode(mode, pattern, length);
        }

        if (pattern != _currentPattern || length != _currentPatternLength || mode != _currentMode) {
            _currentMode = mode;
            _currentPattern = pattern;
            _currentPatternLength = length;
            _currentSegmentIndex = 0;
            _segmentElapsedMs = 0;
        }

        if (_currentPattern != nullptr && _currentPatternLength > 0) {
            const PatternSegment &segment = _currentPattern[_currentSegmentIndex];
            _write(segment.on);

            _segmentElapsedMs += 25;
            if (_segmentElapsedMs >= segment.durationMs) {
                _segmentElapsedMs = 0;
                _currentSegmentIndex = (_currentSegmentIndex + 1) % _currentPatternLength;
            }
        }

        _taskElapsedMs += 25;
        vTaskDelayUntil(&lastWakeTime, _taskPeriodTicks);
    }
}

void StatusLed::_write(bool on) {
    if (on == _lastOutput) {
        return;
    }

    gpio_put(APP_STATUS_LED_PIN, on == kActiveLevel);
    _lastOutput = on;
}

} // namespace T76::DRPD
