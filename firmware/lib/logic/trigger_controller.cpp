/**
 * @file trigger_controller.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "trigger_controller.hpp"


using namespace T76::DRPD;
using namespace T76::DRPD::Logic;


TriggerController::TriggerController(PHY::BMCDecoder& bmcDecoder, PHY::SyncManager& syncManager)
    : _bmcDecoder(bmcDecoder)
    , _syncManager(syncManager) {
    bmcDecoder.messageEventCallback(std::bind(&TriggerController::_handleTriggerEvent, this, std::placeholders::_1, std::placeholders::_2));
}

void TriggerController::reset() {
    mode(mode());
}

TriggerStatus TriggerController::status() const {
    return _status;
}

void TriggerController::mode(TriggerControllerMode mode) {
    // Set trigger controller mode
    _mode = mode;
    _eventCount = 0;
    TriggerStatus newStatus = (mode == TriggerControllerMode::Off) ? TriggerStatus::Idle : TriggerStatus::Armed;
    if (newStatus != _status) {
        _status = newStatus;
        if (_statusChangedCallback) {
            _statusChangedCallback(_status);
        }
    }
}

TriggerControllerMode TriggerController::mode() const {
    // Get trigger controller mode
    return _mode;
}

void TriggerController::eventThreshold(uint32_t count) {
    // Set repeat count
    _eventThreshold = count;
    mode(mode());
}

uint32_t TriggerController::eventThreshold() const {
    // Get repeat count
    return _eventThreshold;
}

uint32_t TriggerController::eventCount() const {
    // Get current event count
    return _eventCount;
}

void TriggerController::autoRepeat(bool enable) {
    // Set auto-repeat flag
    _autoRepeat = enable;
    mode(mode());
}

bool TriggerController::autoRepeat() const {
    // Get auto-repeat flag
    return _autoRepeat;
}

void TriggerController::syncMode(PHY::SyncManagerMode mode) {
    // Set sync manager mode
    _syncManager.mode(mode);
}

PHY::SyncManagerMode TriggerController::syncMode() const {
    // Get sync manager mode
    return _syncManager.mode();
}

void TriggerController::syncPulseWidth(uint32_t widthUs) {
    // Set sync pulse width
    _syncManager.pulseWidth(widthUs);
}

uint32_t TriggerController::syncPulseWidth() const {
    // Get sync pulse width
    return _syncManager.pulseWidth();
}

void TriggerController::statusChangedCallback(TriggerStatusChangedCallback callback) {
    _statusChangedCallback = callback;
}

void TriggerController::_handleTriggerEvent(const PHY::BMCDecodedMessageEvent& event, PHY::BMCDecodedMessage& message) {
    // Handle trigger events based on the current mode
    if (_mode == TriggerControllerMode::Off) {
        return;
    }

    switch(_mode) {
        case TriggerControllerMode::PreambleStart:
            if (event != PHY::BMCDecodedMessageEvent::PreambleStart) {
                return;
            }
            break;

        case TriggerControllerMode::SOPStart:
            if (event != PHY::BMCDecodedMessageEvent::SOPStart) {
                return;
            }
            break;

        case TriggerControllerMode::HeaderStart:
            if (event != PHY::BMCDecodedMessageEvent::HeaderStart) {
                return;
            }
            break;

        case TriggerControllerMode::DataStart:
            if (event != PHY::BMCDecodedMessageEvent::DataStart) {
                return;
            }
            break;

        case TriggerControllerMode::MessageComplete:
            if (event != PHY::BMCDecodedMessageEvent::MessageComplete) {
                return;
            }
            break;

        case TriggerControllerMode::RuntPulseError:
            if (event != PHY::BMCDecodedMessageEvent::RuntPulseError) {
                return;
            }
            break;

        case TriggerControllerMode::TimeoutError:
            if (event != PHY::BMCDecodedMessageEvent::TimeoutError) {
                return;
            }
            break;

        case TriggerControllerMode::InvalidKCodeError:
            if (event != PHY::BMCDecodedMessageEvent::InvalidKCodeError) {
                return;
            }
            break;

        case TriggerControllerMode::CRCError:
            if (event != PHY::BMCDecodedMessageEvent::CRCError) {
                return;
            }
            break;

        case TriggerControllerMode::AnyError:
            if (!BMC_DECODED_MESSAGE_EVENT_IS_ERROR(event) || event == PHY::BMCDecodedMessageEvent::TimeoutBeforeStartError) {
                return;
            }
            break;

        default:
            return;
    }

    _eventCount++;

    if (_eventCount == _eventThreshold) {
        if (_autoRepeat) {
            _eventCount = 0;
        } else {
            _status = TriggerStatus::Triggered;
            if (_statusChangedCallback) {
                _statusChangedCallback(_status);
            }
        }

        _syncManager.performSync();

        return;
    }
}
