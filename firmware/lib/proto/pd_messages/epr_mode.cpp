/**
 * @file epr_mode.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 */

#include "epr_mode.hpp"
#include "../pd_message_types.hpp"
#include <cstdio>


using namespace T76::DRPD::Proto;


EPRMode::EPRMode(uint32_t raw) : _raw(raw) {
    _messageInvalid = !_validate();
}


EPRMode::EPRMode(Action action, uint8_t data) {
    // Bits 31:24 = Action
    // Bits 23:16 = Data
    // Bits 15:0 = Reserved (0)
    _raw = (static_cast<uint32_t>(action) << 24) | (static_cast<uint32_t>(data) << 16);
    _messageInvalid = !_validate();
}


std::span<const uint8_t> EPRMode::raw() const {
    // Convert 32-bit value to little-endian bytes
    _rawBytes[0] = _raw & 0xFF;
    _rawBytes[1] = (_raw >> 8) & 0xFF;
    _rawBytes[2] = (_raw >> 16) & 0xFF;
    _rawBytes[3] = (_raw >> 24) & 0xFF;

    return _rawBytes;
}


uint32_t EPRMode::numDataObjects() const {
    return 1;
}


uint32_t EPRMode::rawMessageType() const {
    return static_cast<uint32_t>(DataMessageType::EPR_Mode);
}


bool EPRMode::isMessageInvalid() const {
    return _messageInvalid;
}


EPRMode::Action EPRMode::action() const {
    return static_cast<Action>((_raw >> 24) & 0xFF);
}


void EPRMode::action(Action value) {
    _raw = (_raw & 0x00FFFFFF) | (static_cast<uint32_t>(value) << 24);
    _messageInvalid = !_validate();
}


uint8_t EPRMode::data() const {
    return (_raw >> 16) & 0xFF;
}


void EPRMode::data(uint8_t value) {
    _raw = (_raw & 0xFF00FFFF) | (static_cast<uint32_t>(value) << 16);
    _messageInvalid = !_validate();
}


bool EPRMode::_validate() {
    // Validate Action field
    uint8_t action_val = (_raw >> 24) & 0xFF;
    switch (action_val) {
        case 0x01:  // Enter
        case 0x02:  // Enter Acknowledged
        case 0x03:  // Enter Succeeded
        case 0x04:  // Enter Failed
        case 0x05:  // Exit
            break;  // Valid
        default:
            return false;  // Invalid action
    }

    // Validate that reserved bits (15:0) are zero
    if ((_raw & 0x0000FFFF) != 0) {
        return false;
    }

    return true;
}


std::string EPRMode::_actionToString(Action action) {
    switch (action) {
        case Action::Enter:
            return "Enter";
        case Action::EnterAcknowledged:
            return "Enter Acknowledged";
        case Action::EnterSucceeded:
            return "Enter Succeeded";
        case Action::EnterFailed:
            return "Enter Failed";
        case Action::Exit:
            return "Exit";
        default:
            return "Unknown";
    }
}


std::string EPRMode::_failureReasonToString(FailureReason reason) {
    switch (reason) {
        case FailureReason::UnknownCause:
            return "Unknown cause";
        case FailureReason::CableNotEprCapable:
            return "Cable not EPR Capable";
        case FailureReason::SourceNotVconnSource:
            return "Source failed to become VCONN Source";
        case FailureReason::EprCapableNotInRdo:
            return "EPR Capable bit not set in RDO";
        case FailureReason::SourceCannotEnterEpr:
            return "Source unable to enter EPR Mode";
        case FailureReason::EprCapableNotInPdo:
            return "EPR Capable bit not set in PDO";
        default:
            return "Unknown reason";
    }
}


std::string EPRMode::toString() const {
    std::string out;
    char buffer[256];

    Action act = action();
    uint8_t data_val = data();

    std::string data_str;
    if (act == Action::Enter) {
        // Data is EPR Sink Operational PDP
        data_str = "EPR Sink Operational PDP = " + std::to_string(data_val) + " PDP units";
    } else if (act == Action::EnterFailed) {
        // Data is failure reason
        data_str = "Failure Reason: " + _failureReasonToString(static_cast<FailureReason>(data_val));
    } else if (act == Action::EnterAcknowledged || act == Action::EnterSucceeded || act == Action::Exit) {
        // Data should be zero for these
        data_str = "0x" + std::to_string(data_val);
    }

    int written = std::snprintf(
        buffer,
        sizeof(buffer),
        "EPRMode\n"
        "  Raw: 0x%08X\n"
        "  Action: %s\n"
        "  Data: %s\n"
        "  Invalid: %s\n",
        _raw,
        _actionToString(act).c_str(),
        data_str.c_str(),
        isMessageInvalid() ? "yes" : "no"
    );

    if (written > 0) {
        size_t count = static_cast<size_t>(written);
        if (count >= sizeof(buffer)) {
            count = sizeof(buffer) - 1;
        }
        out.append(buffer, count);
    }

    return out;
}
