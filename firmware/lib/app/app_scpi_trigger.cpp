/**
 * @file app_scpi_trigger.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "app.hpp"

#include <algorithm>
#include <cctype>
#include <optional>
#include <string>
#include <vector>


using namespace T76::DRPD;

namespace {

constexpr int TriggerSCPIErrorInvalidParameter = -222;

bool parseMessageTypeFilterToken(
    const std::string &token,
    Logic::TriggerController::MessageTypeFilter &filter) {
    const size_t separatorIndex = token.find(':');
    if (separatorIndex == std::string::npos || separatorIndex == 0 || separatorIndex == token.size() - 1) {
        return false;
    }

    std::string category = token.substr(0, separatorIndex);
    std::transform(category.begin(), category.end(), category.begin(), [](unsigned char ch) {
        return static_cast<char>(std::toupper(ch));
    });

    if (category == "CONTROL") {
        filter.hasDataObjects = false;
    } else if (category == "DATA") {
        filter.hasDataObjects = true;
    } else {
        return false;
    }

    const std::string valueString = token.substr(separatorIndex + 1);
    if (valueString.empty() || !std::all_of(valueString.begin(), valueString.end(), [](unsigned char ch) {
            return std::isdigit(ch) != 0;
        })) {
        return false;
    }

    uint32_t rawMessageType = 0;
    for (char ch : valueString) {
        rawMessageType = rawMessageType * 10u + static_cast<uint32_t>(ch - '0');
        if (rawMessageType > 0x1F) {
            return false;
        }
    }

    filter.rawMessageType = rawMessageType;
    return true;
}

std::string formatMessageTypeFilterToken(const Logic::TriggerController::MessageTypeFilter &filter) {
    return std::string(filter.hasDataObjects ? "DATA:" : "CONTROL:") + std::to_string(filter.rawMessageType);
}

std::optional<Logic::TriggerController::SenderFilter> parseSenderFilterToken(const std::string &token) {
    std::string normalized = token;
    std::transform(normalized.begin(), normalized.end(), normalized.begin(), [](unsigned char ch) {
        return static_cast<char>(std::toupper(ch));
    });

    if (normalized == "ANY") {
        return Logic::TriggerController::SenderFilter::Any;
    }
    if (normalized == "SOURCE") {
        return Logic::TriggerController::SenderFilter::Source;
    }
    if (normalized == "SINK") {
        return Logic::TriggerController::SenderFilter::Sink;
    }
    if (normalized == "CABLE") {
        return Logic::TriggerController::SenderFilter::Cable;
    }

    return std::nullopt;
}

std::string formatSenderFilterToken(Logic::TriggerController::SenderFilter filter) {
    switch (filter) {
        case Logic::TriggerController::SenderFilter::Any:
            return "ANY";
        case Logic::TriggerController::SenderFilter::Source:
            return "SOURCE";
        case Logic::TriggerController::SenderFilter::Sink:
            return "SINK";
        case Logic::TriggerController::SenderFilter::Cable:
            return "CABLE";
    }

    return "ANY";
}

}


void App::_resetTriggerController(const std::vector<T76::SCPI::ParameterValue> &params) {
    _triggerController.reset();
}

void App::_queryTriggerControllerStatus(const std::vector<T76::SCPI::ParameterValue> &params) {
    Logic::TriggerStatus status = _triggerController.status();
    std::string statusStr;

    switch (status) {
        case Logic::TriggerStatus::Idle:
            statusStr = "IDLE";
            break;
        case Logic::TriggerStatus::Armed:
            statusStr = "ARMED";
            break;
        case Logic::TriggerStatus::Triggered:
            statusStr = "TRIGGERED";
            break;
    }

    // Send the status string as a response
    _sendTransportTextResponse(statusStr);
}

void App::_setTriggerEventType(const std::vector<T76::SCPI::ParameterValue> &params) {
    std::string typeStr = params[0].stringValue;
    std::transform(typeStr.begin(), typeStr.end(), typeStr.begin(), ::toupper);

    if (typeStr == "OFF") {
        _triggerController.mode(Logic::TriggerControllerMode::Off);
    } else if (typeStr == "PREAMBLE_START") {
        _triggerController.mode(Logic::TriggerControllerMode::PreambleStart);
    } else if (typeStr == "SOP_START") {
        _triggerController.mode(Logic::TriggerControllerMode::SOPStart);
    } else if (typeStr == "HEADER_START") {
        _triggerController.mode(Logic::TriggerControllerMode::HeaderStart);
    } else if (typeStr == "DATA_START") {
        _triggerController.mode(Logic::TriggerControllerMode::DataStart);
    } else if (typeStr == "MESSAGE_COMPLETE") {
        _triggerController.mode(Logic::TriggerControllerMode::MessageComplete);
    } else if (typeStr == "HARD_RESET_RECEIVED") {
        _triggerController.mode(Logic::TriggerControllerMode::HardResetReceived);
    } else if (typeStr == "RUNT_PULSE_ERROR") {
        _triggerController.mode(Logic::TriggerControllerMode::RuntPulseError);
    } else if (typeStr == "TIMEOUT_ERROR") {
        _triggerController.mode(Logic::TriggerControllerMode::TimeoutError);
    } else if (typeStr == "INVALID_KCODE") {
        _triggerController.mode(Logic::TriggerControllerMode::InvalidKCodeError);
    } else if (typeStr == "CRC_ERROR") {
        _triggerController.mode(Logic::TriggerControllerMode::CRCError);
    } else if (typeStr == "ANY_ERROR") {
        _triggerController.mode(Logic::TriggerControllerMode::AnyError);
    } else {
        // Invalid parameter, handle error as needed
        _interpreter.addError(100, "Invalid trigger event type");
        return;
    }

    _savePersistentConfig();
}

void App::_queryTriggerEventType(const std::vector<T76::SCPI::ParameterValue> &params) {
    Logic::TriggerControllerMode mode = _triggerController.mode();
    std::string modeStr;

    switch (mode) {
        case Logic::TriggerControllerMode::Off:
            modeStr = "OFF";
            break;
        case Logic::TriggerControllerMode::PreambleStart:
            modeStr = "PREAMBLE_START";
            break;
        case Logic::TriggerControllerMode::SOPStart:
            modeStr = "SOP_START";
            break;
        case Logic::TriggerControllerMode::HeaderStart:
            modeStr = "HEADER_START";
            break;
        case Logic::TriggerControllerMode::DataStart:
            modeStr = "DATA_START";
            break;
        case Logic::TriggerControllerMode::MessageComplete:
            modeStr = "MESSAGE_COMPLETE";
            break;
        case Logic::TriggerControllerMode::HardResetReceived:
            modeStr = "HARD_RESET_RECEIVED";
            break;
        case Logic::TriggerControllerMode::RuntPulseError:
            modeStr = "RUNT_PULSE_ERROR";
            break;
        case Logic::TriggerControllerMode::TimeoutError:
            modeStr = "TIMEOUT_ERROR";
            break;
        case Logic::TriggerControllerMode::InvalidKCodeError:
            modeStr = "INVALID_KCODE";
            break;
        case Logic::TriggerControllerMode::CRCError:
            modeStr = "CRC_ERROR";
            break;
        case Logic::TriggerControllerMode::AnyError:
            modeStr = "ANY_ERROR";
            break;
    }

    // Send the mode string as a response

    _sendTransportTextResponse(modeStr);
}

void App::_setTriggerEventThreshold(const std::vector<T76::SCPI::ParameterValue> &params) {
    uint32_t count = static_cast<uint32_t>(params[0].numberValue);
    _triggerController.eventThreshold(count);
    _savePersistentConfig();
}

void App::_queryTriggerEventThreshold(const std::vector<T76::SCPI::ParameterValue> &params) {
    uint32_t count = _triggerController.eventThreshold();
    _sendTransportTextResponse(std::to_string(count));
}

void App::_setTriggerEventSenderFilter(const std::vector<T76::SCPI::ParameterValue> &params) {
    const auto filter = parseSenderFilterToken(params[0].stringValue);
    if (!filter.has_value()) {
        _interpreter.addError(100, "Invalid trigger sender filter");
        return;
    }

    _triggerController.senderFilter(*filter);
    _savePersistentConfig();
}

void App::_queryTriggerEventSenderFilter(const std::vector<T76::SCPI::ParameterValue> &params) {
    _sendTransportTextResponse(formatSenderFilterToken(_triggerController.senderFilter()));
}

void App::_queryTriggerEventCount(const std::vector<T76::SCPI::ParameterValue> &params) {
    uint32_t count = _triggerController.eventCount();
    _sendTransportTextResponse(std::to_string(count));
}

void App::_setTriggerEventMessageTypeFilter(const std::vector<T76::SCPI::ParameterValue> &params) {
    if (params.size() != 2) {
        _interpreter.addError(
            TriggerSCPIErrorInvalidParameter,
            "TRIGger:EVent:MSGType:FILTer requires slot index and filter token parameters");
        return;
    }

    const double slotValue = params[0].numberValue;
    if (slotValue < 0 || static_cast<double>(static_cast<size_t>(slotValue)) != slotValue) {
        _interpreter.addError(
            TriggerSCPIErrorInvalidParameter,
            "Message type filter slot must be a non-negative integer");
        return;
    }
    const size_t slot = static_cast<size_t>(slotValue);

    Logic::TriggerController::MessageTypeFilter filter;
    if (!parseMessageTypeFilterToken(params[1].stringValue, filter)) {
        _interpreter.addError(
            TriggerSCPIErrorInvalidParameter,
            "Invalid message type filter token; use CONTROL:<n> or DATA:<n>");
        return;
    }

    if (!_triggerController.setMessageTypeFilter(slot, filter)) {
        _interpreter.addError(
            TriggerSCPIErrorInvalidParameter,
            "Message type filter slot is out of range, duplicates another slot, or uses an invalid type value");
        return;
    }

    _savePersistentConfig();
}

void App::_queryTriggerEventMessageTypeFilter(const std::vector<T76::SCPI::ParameterValue> &params) {
    std::string response;
    bool first = true;

    for (size_t slot = 0; slot < _triggerController.messageTypeFilterCapacity(); ++slot) {
        const auto filter = _triggerController.messageTypeFilter(slot);
        if (!filter.has_value()) {
            continue;
        }

        if (!first) {
            response += " ";
        }
        response += formatMessageTypeFilterToken(*filter);
        first = false;
    }

    _sendTransportTextResponse(response);
}

void App::_clearTriggerEventMessageTypeFilter(const std::vector<T76::SCPI::ParameterValue> &params) {
    _triggerController.clearMessageTypeFilters();
    _savePersistentConfig();
}

void App::_setTriggerAutoRepeatState(const std::vector<T76::SCPI::ParameterValue> &params) {
    std::string enable = params[0].stringValue;
    std::transform(enable.begin(), enable.end(), enable.begin(), ::toupper);

    _triggerController.autoRepeat(enable == "ON");
    _savePersistentConfig();
}

void App::_queryTriggerAutoRepeatState(const std::vector<T76::SCPI::ParameterValue> &params) {
    bool enable = _triggerController.autoRepeat();
    _sendTransportTextResponse(enable ? "ON" : "OFF");
}

void App::_setSyncOutputMode(const std::vector<T76::SCPI::ParameterValue> &params) {
    std::string modeStr = params[0].stringValue;
    std::transform(modeStr.begin(), modeStr.end(), modeStr.begin(), ::toupper);

    if (modeStr == "PULSE_HIGH") {
        _syncManager.mode(PHY::SyncManagerMode::PulseHigh);
    } else if (modeStr == "PULSE_LOW") {
        _syncManager.mode(PHY::SyncManagerMode::PulseLow);
    } else if (modeStr == "TOGGLE") {
        _syncManager.mode(PHY::SyncManagerMode::Toggle);
    } else if (modeStr == "PULL_DOWN") {
        _syncManager.mode(PHY::SyncManagerMode::PullDown);
    } else {
        // Invalid parameter, handle error as needed
        _interpreter.addError(100, "Invalid sync output mode");
        return;
    }

    _savePersistentConfig();
}

void App::_querySyncOutputMode(const std::vector<T76::SCPI::ParameterValue> &params) {
    PHY::SyncManagerMode mode = _syncManager.mode();
    std::string modeStr;

    switch (mode) {
        case PHY::SyncManagerMode::PulseHigh:
            modeStr = "PULSE_HIGH";
            break;
        case PHY::SyncManagerMode::PulseLow:
            modeStr = "PULSE_LOW";
            break;
        case PHY::SyncManagerMode::Toggle:
            modeStr = "TOGGLE";
            break;
        case PHY::SyncManagerMode::PullDown:
            modeStr = "PULL_DOWN";
            break;
    }

    // Send the mode string as a response

    _sendTransportTextResponse(modeStr);
}


void App::_setSyncPulseWidth(const std::vector<T76::SCPI::ParameterValue> &params) {
    uint32_t widthUs = static_cast<uint32_t>(params[0].numberValue);
    _syncManager.pulseWidth(widthUs);
    _savePersistentConfig();
}


void App::_querySyncPulseWidth(const std::vector<T76::SCPI::ParameterValue> &params) {
    uint32_t widthUs = _syncManager.pulseWidth();
    _sendTransportTextResponse(std::to_string(widthUs));
}   
