/**
 * @file cc_bus_controller.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "cc_bus_controller.hpp"

#include <algorithm>
#include <FreeRTOS.h>
#include <timers.h>


using namespace T76::DRPD::Logic;

namespace {
    class SpinLockGuard {
    public:
        explicit SpinLockGuard(std::atomic_flag &lock) : _lock(lock) {
            while (_lock.test_and_set(std::memory_order_acquire)) {
            }
        }

        ~SpinLockGuard() {
            _lock.clear(std::memory_order_release);
        }

    private:
        std::atomic_flag &_lock;
    };
} // namespace


void CCBusController::init() {
    // Turn off the mux

    _ccBusManager.muxActive(false);

    // Add a FreeRTOS timer to call _loop() periodically

    TimerHandle_t loopTimer = xTimerCreate(
        "CCBusControllerLoopTimer",
        pdMS_TO_TICKS(LOGIC_CC_BUS_CONTROLLER_ITERATION_PERIOD_MS), // 10 ms period
        pdTRUE,            // Auto-reload
        this,              // Timer ID
        [](TimerHandle_t xTimer) {
            CCBusController *controller = static_cast<CCBusController *>(pvTimerGetTimerID(xTimer));
            controller->_loop();
        }
    );

    xTimerStart(loopTimer, 0);
}

void CCBusController::initCore1() {
    _sink.initCore1();
}

void CCBusController::loopCore1() {
    _sink.loopCore1();
}

void CCBusController::role(CCBusRole role) {
    _updateRole(role);

    switch(_role) {
        case CCBusRole::Observer:
            _sink.disable();

            _ccRoleManager.cc1Role(PHY::CCRole::Off);
            _ccRoleManager.cc2Role(PHY::CCRole::Off);

            _vbusManager.enabled(true);
            break;

        case CCBusRole::Sink:
            _sink.enable();

            _ccRoleManager.cc1Role(PHY::CCRole::Sink);
            _ccRoleManager.cc2Role(PHY::CCRole::Sink);

            _vbusManager.enabled(true);
            break;

        default:
            _sink.disable();

            _ccRoleManager.cc1Role(PHY::CCRole::Off);
            _ccRoleManager.cc2Role(PHY::CCRole::Off);
            
            _vbusManager.enabled(false);
    }
}

CCBusRole CCBusController::role() const {
    return _role;
}

CCBusState CCBusController::state() const {
    return _state;
}

CCBusPort CCBusController::sourcePort() const {
    return _sourcePort;
}

T76::DRPD::PHY::CCChannel CCBusController::sourceChannel() const {
    return _sourceChannel;
}

CCBusPort CCBusController::sinkPort() const {
    return _sinkPort;
}

T76::DRPD::PHY::CCChannel CCBusController::sinkChannel() const {
    return _sinkChannel;
}

Sink* CCBusController::sink() {
    if (_sink.enabled()) {
        return &_sink;
    }

    return nullptr;
}

uint32_t CCBusController::addStateChangedCallback(StateChangedCallback callback) {
    if (!callback) {
        return 0;
    }

    SpinLockGuard lock(_callbacksLock);
    uint32_t callbackId = _nextStateChangedCallbackId++;
    _stateChangedCallbacks.push_back({callbackId, std::move(callback)});
    return callbackId;
}

void CCBusController::removeStateChangedCallback(uint32_t callbackId) {
    if (callbackId == 0) {
        return;
    }

    SpinLockGuard lock(_callbacksLock);
    _stateChangedCallbacks.erase(
        std::remove_if(
            _stateChangedCallbacks.begin(),
            _stateChangedCallbacks.end(),
            [callbackId](const auto &entry) {
                return entry.first == callbackId;
            }
        ),
        _stateChangedCallbacks.end()
    );
}

uint32_t CCBusController::addRoleChangedCallback(RoleChangedCallback callback) {
    if (!callback) {
        return 0;
    }

    SpinLockGuard lock(_callbacksLock);
    uint32_t callbackId = _nextRoleChangedCallbackId++;
    _roleChangedCallbacks.push_back({callbackId, std::move(callback)});
    return callbackId;
}

void CCBusController::removeRoleChangedCallback(uint32_t callbackId) {
    if (callbackId == 0) {
        return;
    }

    SpinLockGuard lock(_callbacksLock);
    _roleChangedCallbacks.erase(
        std::remove_if(
            _roleChangedCallbacks.begin(),
            _roleChangedCallbacks.end(),
            [callbackId](const auto &entry) {
                return entry.first == callbackId;
            }
        ),
        _roleChangedCallbacks.end()
    );
}

void CCBusController::sinkInfoChanged(SinkInfoChangedCallback callback) {
    SpinLockGuard lock(_callbacksLock);
    _sinkInfoChangedCallback = std::move(callback);
}

void CCBusController::_repeatSinkInfoChanged(SinkInfoChange change) {
    SinkInfoChangedCallback callback = nullptr;
    {
        SpinLockGuard lock(_callbacksLock);
        callback = _sinkInfoChangedCallback;
    }

    if (callback) {
        callback(change);
    }
}

bool inline CCBusController::_isSourcePresent(float voltage) {
    return voltage > LOGIC_CC_BUS_CONTROLLER_SOURCE_DETECT_VOLTAGE_THRESHOLD;
}

bool inline CCBusController::_isSinkPresent(float voltage) {
    return voltage > LOGIC_CC_BUS_CONTROLLER_SINK_DETECT_VOLTAGE_THRESHOLD_LOW &&
        voltage < LOGIC_CC_BUS_CONTROLLER_SINK_DETECT_VOLTAGE_THRESHOLD_HIGH;
}

float CCBusController::_channelVoltage(CCBusPort port, PHY::CCChannel channel) {
    switch(port) {
        case CCBusPort::DUT:
            switch(channel) {
                case PHY::CCChannel::CC1:
                    return _analogMonitor.dutCC1Voltage();
                case PHY::CCChannel::CC2:
                    return _analogMonitor.dutCC2Voltage();
                default:
                    return 0.0f;
            }
        case CCBusPort::USDS:
            switch(channel) {
                case PHY::CCChannel::CC1:
                    return _analogMonitor.usdsCC1Voltage();
                case PHY::CCChannel::CC2:
                    return _analogMonitor.usdsCC2Voltage();
                default:
                    return 0.0f;
            }
        default:
            return 0.0f;
    }
}

void CCBusController::_loop() {
    _analogMonitor.readCCLineValues();

    switch(_role) {
        case CCBusRole::Observer:
            _loopObserverMode();
            break;

        case CCBusRole::Sink:
            _loopSinkMode();
            break;

        default:
            // If disabled or in other mode, ensure mux is off and state is unattached
            _ccBusManager.muxActive(false);
            _updateState(CCBusState::Unattached);
            _sourceDebounceCounter = 0;
            _sinkDebounceCounter = 0;
            break;
    }
}

void CCBusController::_loopObserverMode() {
    static const std::array<std::pair<CCBusPort, PHY::CCChannel>, 4> channelChecks = {{
        {CCBusPort::DUT, PHY::CCChannel::CC1},
        {CCBusPort::DUT, PHY::CCChannel::CC2},
        {CCBusPort::USDS, PHY::CCChannel::CC1},
        {CCBusPort::USDS, PHY::CCChannel::CC2}
    }};

    switch(_state) {
        case CCBusState::Unattached:

            // In the unattached state, we look for the presence of a source on any channel.
            // If we find one, we debounce and then move to the SourceFound state.

            for (const auto& [port, channel] : channelChecks) {
                float voltage = _channelVoltage(port, channel);

                if (_isSourcePresent(voltage)) {
                    _sourcePort = port;
                    _sourceChannel = channel;

                    if (_sourceDebounceCounter++ == LOGIC_CC_BUS_CONTROLLER_DEBOUNCE_ITERATIONS) {
                        _updateState(CCBusState::SourceFound);
                        _sinkPort = (_sourcePort == CCBusPort::DUT) ? CCBusPort::USDS : CCBusPort::DUT;
                        _sinkChannel = PHY::CCChannel::CC1; // Default to CC1
                        _sinkDebounceCounter = 0;

                        // Turn on the mux, set the source and sink channels

                        _ccBusManager.muxActive(true);

                        if (_sourcePort == CCBusPort::DUT) {
                            _ccBusManager.dutChannel(_sourceChannel);
                            _ccBusManager.usdsChannel(_sinkChannel);
                        } else {
                            _ccBusManager.usdsChannel(_sourceChannel);
                            _ccBusManager.dutChannel(_sinkChannel);
                        }
                    };

                    return;
                }
            }

            _sourceDebounceCounter = 0;

            break;

        case CCBusState::SourceFound:

            // In the SourceFound state, we look for the presence of a sink on the
            // opposite port and either CC1 or CC2. If we find one, we debounce
            // and then move to the Attached state.

            if (_isSinkPresent(_channelVoltage(_sinkPort, _sinkChannel))) {
                if (_sinkDebounceCounter++ == LOGIC_CC_BUS_CONTROLLER_DEBOUNCE_ITERATIONS) {
                    _updateState(CCBusState::Attached);
                    _sinkDebounceCounter = 0;

                    return;
                }
            }

            // Try the other sink channel next time around

            _sinkChannel = (_sinkChannel == PHY::CCChannel::CC1) ?
                PHY::CCChannel::CC2 : PHY::CCChannel::CC1;

            if (_sinkPort == CCBusPort::DUT) {
                _ccBusManager.dutChannel(_sinkChannel);
            } else {
                _ccBusManager.usdsChannel(_sinkChannel);
            }

            // Check that the source is still present

            if (!_isSourcePresent(_channelVoltage(_sourcePort, _sourceChannel))) {
                if (_sourceDebounceCounter++ == LOGIC_CC_BUS_CONTROLLER_DEBOUNCE_ITERATIONS) {
                    // Source lost, go back to unattached state
                    _updateState(CCBusState::Unattached);
                    _ccBusManager.muxActive(false);
                    _sourceDebounceCounter = 0;
                }
            } else {
                _sourceDebounceCounter = 0;
            }

            break;

        case CCBusState::Attached:
            // In the Attached state, we monitor for loss of source or sink. If either
            // is lost, we debounce and go back to the Unattached state.

            if (!_isSinkPresent(_channelVoltage(_sinkPort, _sinkChannel))) {
                if (_sinkDebounceCounter++ == LOGIC_CC_BUS_CONTROLLER_DEBOUNCE_ITERATIONS) {
                    // Connection lost, go back to unattached state

                    _updateState(CCBusState::Unattached);
                    _ccBusManager.muxActive(false);
                    _sourceDebounceCounter = 0;
                }
            } else {
                _sinkDebounceCounter = 0;
            }

            break;
    }
}

void CCBusController::_loopSinkMode() {
    // In Sink mode, we have pull-down resistors active on the DUT port
    // and alternate between CC1 and CC2 to find a connection with a source

    // Keep the mux off in Sink mode
    _ccBusManager.muxActive(false);

    // We always monitor the DUT port (where we act as sink)
    _sourcePort = CCBusPort::DUT;

    switch(_state) {
        case CCBusState::Unattached:
            // Start with CC1
            _sinkChannel = PHY::CCChannel::CC1;
            _sinkDebounceCounter = 0;

            // Check if source is present on CC1 (using sink detection since we have pull-downs)
            if (_isSinkPresent(_channelVoltage(_sourcePort, PHY::CCChannel::CC1))) {
                _sourceChannel = PHY::CCChannel::CC1;
                if (_sourceDebounceCounter++ >= LOGIC_CC_BUS_CONTROLLER_DEBOUNCE_ITERATIONS) {
                    _updateState(CCBusState::Attached);
                    _sourceDebounceCounter = 0;
                    return;
                }
            } else if (_isSinkPresent(_channelVoltage(_sourcePort, PHY::CCChannel::CC2))) {
                // Try CC2
                _sourceChannel = PHY::CCChannel::CC2;
                _ccBusManager.dutChannel(_sourceChannel);

                if (_sourceDebounceCounter++ >= LOGIC_CC_BUS_CONTROLLER_DEBOUNCE_ITERATIONS) {
                    _updateState(CCBusState::Attached);
                    _sourceDebounceCounter = 0;
                    return;
                }
            } else {
                _sourceDebounceCounter = 0;
            }
            break;

        case CCBusState::Attached:
            // Monitor the connection - if source is lost, return to Unattached
            if (!_isSinkPresent(_channelVoltage(_sourcePort, _sourceChannel))) {
                if (_sourceDebounceCounter++ >= LOGIC_CC_BUS_CONTROLLER_DEBOUNCE_ITERATIONS) {
                    _updateState(CCBusState::Unattached);
                    _sourceDebounceCounter = 0;
                }
            } else {
                _ccBusManager.dutChannel(_sourceChannel);
                _sourceDebounceCounter = 0;
            }
            break;

        case CCBusState::SourceFound:
            // In Sink mode, we skip SourceFound and go straight to Attached
            // So if we end up here, just transition to Attached
            _updateState(CCBusState::Attached);
            break;
    }
}

void CCBusController::_updateState(CCBusState newState) {
    if (_state == newState) {
        return;
    }

    _state = newState;

    std::vector<std::pair<uint32_t, StateChangedCallback>> callbacks;
    {
        SpinLockGuard lock(_callbacksLock);
        callbacks = _stateChangedCallbacks;
    }

    for (const auto &callbackEntry : callbacks) {
        if (callbackEntry.second) {
            callbackEntry.second(newState);
        }
    }
}

void CCBusController::_updateRole(CCBusRole newRole) {
    if (_role == newRole) {
        return;
    }

    _role = newRole;

    std::vector<std::pair<uint32_t, RoleChangedCallback>> callbacks;
    {
        SpinLockGuard lock(_callbacksLock);
        callbacks = _roleChangedCallbacks;
    }

    for (const auto &callbackEntry : callbacks) {
        if (callbackEntry.second) {
            callbackEntry.second(newRole);
        }
    }
}
