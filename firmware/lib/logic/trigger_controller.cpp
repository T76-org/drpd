/**
 * @file trigger_controller.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "trigger_controller.hpp"

#include <algorithm>
#include <optional>

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
    }
    
    if (_statusChangedCallback) {
        _statusChangedCallback(_status);
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

bool TriggerController::setMessageTypeFilter(size_t slot, const MessageTypeFilter &filter) {
    if (slot >= _messageTypeFilters.size()) {
        return false;
    }

    if (filter.rawMessageType > 0x1F) {
        return false;
    }

    for (size_t index = 0; index < _messageTypeFilters.size(); ++index) {
        if (index == slot || !_messageTypeFilterEnabled[index]) {
            continue;
        }

        if (_messageTypeFilters[index] == filter) {
            return false;
        }
    }

    _messageTypeFilters[slot] = filter;
    _messageTypeFilterEnabled[slot] = true;
    return true;
}

bool TriggerController::clearMessageTypeFilter(size_t slot) {
    if (slot >= _messageTypeFilters.size()) {
        return false;
    }

    _messageTypeFilters[slot] = MessageTypeFilter{};
    _messageTypeFilterEnabled[slot] = false;
    return true;
}

void TriggerController::clearMessageTypeFilters() {
    std::fill(_messageTypeFilters.begin(), _messageTypeFilters.end(), MessageTypeFilter{});
    std::fill(_messageTypeFilterEnabled.begin(), _messageTypeFilterEnabled.end(), false);
}

std::optional<TriggerController::MessageTypeFilter> TriggerController::messageTypeFilter(size_t slot) const {
    if (slot >= _messageTypeFilters.size() || !_messageTypeFilterEnabled[slot]) {
        return std::nullopt;
    }

    return _messageTypeFilters[slot];
}

size_t TriggerController::messageTypeFilterCapacity() const {
    return _messageTypeFilters.size();
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

        case TriggerControllerMode::HardResetReceived:
            if (event != PHY::BMCDecodedMessageEvent::HardResetReceived) {
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

    if (_hasMessageTypeFiltersConfigured() &&
        _messageHeaderKnownForEvent(event, message) &&
        !_messageMatchesFilters(message)) {
        return;
    }

    _eventCount++;

    if ((_autoRepeat && (_eventCount % _eventThreshold == 0)) || (!_autoRepeat && _eventCount == _eventThreshold)) {
        if (!_autoRepeat) {
            _status = TriggerStatus::Triggered;
        }

        _syncManager.performSync();
    }

    // Notify that the status has changed (since at least the event count has changed, and possibly the status as well)

    if (_statusChangedCallback) {
        _statusChangedCallback(_status);
    }
}

bool TriggerController::_messageHeaderKnownForEvent(const PHY::BMCDecodedMessageEvent& event,
                                                    const PHY::BMCDecodedMessage& message) const {
    // Message-type filtering is only meaningful once the PD header exists.
    // DATA_START is the first event where that is guaranteed; later completion
    // or error events may also carry a decoded header if decode progressed far enough.
    if (event == PHY::BMCDecodedMessageEvent::DataStart) {
        return true;
    }

    if (BMC_DECODED_MESSAGE_EVENT_IS_COMPLETION(event) || BMC_DECODED_MESSAGE_EVENT_IS_ERROR(event)) {
        return message.rawHeader().size() >= 2;
    }

    return false;
}

bool TriggerController::_messageMatchesFilters(const PHY::BMCDecodedMessage& message) const {
    const auto header = message.decodedHeader();
    const MessageTypeFilter candidate{
        .rawMessageType = header.rawMessageType(),
        .hasDataObjects = header.numDataObjects() > 0,
    };

    for (size_t index = 0; index < _messageTypeFilters.size(); ++index) {
        if (!_messageTypeFilterEnabled[index]) {
            continue;
        }

        if (_messageTypeFilters[index] == candidate) {
            return true;
        }
    }

    return false;
}

bool TriggerController::_hasMessageTypeFiltersConfigured() const {
    return std::any_of(
        _messageTypeFilterEnabled.begin(),
        _messageTypeFilterEnabled.end(),
        [](bool enabled) { return enabled; });
}
