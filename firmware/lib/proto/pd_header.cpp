/**
 * @file pd_header.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "pd_header.hpp"
#include "pd_message_types.hpp"


using namespace T76::DRPD::Proto;


void PDHeader::raw(uint16_t raw) {
    _raw = raw;
}

uint16_t PDHeader::raw() const {
    return _raw;
}

void PDHeader::sop(const SOP& sop) {
    _sop = sop;
}

const SOP& PDHeader::sop() const {
    return _sop;
}

PDHeader::MessageClass PDHeader::messageClass() const {
    if (extended()) {
        return MessageClass::Extended;
    }

    return (numDataObjects() == 0) ? MessageClass::Control : MessageClass::Data;
}

std::optional<ControlMessageType> PDHeader::controlMessageType() const {
    if (messageClass() != MessageClass::Control) {
        return std::nullopt;
    }

    return static_cast<ControlMessageType>(_raw & 0x1F);
}

void PDHeader::controlMessageType(ControlMessageType type) {
    _raw = (_raw & 0xFFE0) | (static_cast<uint16_t>(type) & 0x1F);
}

std::optional<DataMessageType> PDHeader::dataMessageType() const {
    if (messageClass() != MessageClass::Data) {
        return std::nullopt;
    }

    return static_cast<DataMessageType>(_raw & 0x1F);
}

void PDHeader::dataMessageType(DataMessageType type) {
    _raw = (_raw & 0xFFE0) | (static_cast<uint16_t>(type) & 0x1F);
}

std::optional<ExtendedMessageType> PDHeader::extendedMessageType() const {
    if (messageClass() != MessageClass::Extended) {
        return std::nullopt;
    }

    return static_cast<ExtendedMessageType>(_raw & 0x1F);
}

void PDHeader::extendedMessageType(ExtendedMessageType type) {
    _raw = (_raw & 0xFFE0) | (static_cast<uint16_t>(type) & 0x1F);
}

bool PDHeader::extended() const {
    return (_raw & 0x8000) != 0;
}

void PDHeader::extended(bool ext) {
    if (ext) {
        _raw |= 0x8000;
    } else {
        _raw &= 0x7FFF;
    }
}

uint32_t PDHeader::numDataObjects() const {
    return (_raw >> 12) & 0x7;
}

void PDHeader::numDataObjects(uint32_t n) {
    _raw = (_raw & 0x8FFF) | ((n & 0x7) << 12);
}

uint32_t PDHeader::messageId() const {
    return (_raw >> 9) & 0x7;
}

void PDHeader::messageId(uint32_t id) {
    _raw = (_raw & 0xF1FF) | ((id & 0x7) << 9);
}

PDHeader::SpecRevision PDHeader::specRevision() const {
    return static_cast<SpecRevision>((_raw >> 6) & 0x3);
}

void PDHeader::specRevision(SpecRevision rev) {
    // Only clear Spec Revision bits (7..6); keep MessageID and Power Role intact
    _raw = (_raw & 0xFF3F) | ((static_cast<uint16_t>(rev) & 0x3) << 6);
}

uint32_t PDHeader::rawMessageType() const {
    return _raw & 0x1F;
}

void PDHeader::rawMessageType(uint32_t type) {
    _raw = (_raw & 0xFFE0) | (type & 0x1F);
}

std::optional<PDHeader::PortPowerRole> PDHeader::portPowerRole() const {
    if (_sop.type() == SOP::SOPType::SOP) {
        return (_raw & 0x0100) != 0 ? PortPowerRole::Source : PortPowerRole::Sink;
    }

    return std::nullopt;
}

void PDHeader::portPowerRole(PortPowerRole role) {
    if (_sop.type() == SOP::SOPType::SOP) {
        if (role == PortPowerRole::Source) {
            _raw |= 0x0100;
        } else {
            _raw &= 0xFEFF;
        }
    }
}

std::optional<PDHeader::PortDataRole> PDHeader::portDataRole() const {
    if (_sop.type() == SOP::SOPType::SOP) {
        return (_raw & 0x0020) != 0 ? PortDataRole::DFP : PortDataRole::UFP;
    }

    return std::nullopt;
}

void PDHeader::portDataRole(PortDataRole role) {
    if (_sop.type() == SOP::SOPType::SOP) {
        if (role == PortDataRole::DFP) {
            _raw |= 0x0020;
        } else {
            _raw &= 0xFFDF;
        }
    }
}

std::string PDHeader::toString() const {
    std::string result = "PDHeader: { ";

    result += "Raw: 0x" + std::to_string(_raw) + ", ";
    result += "SOP: " + _sop.toString() + ", ";
    result += "MessageClass: ";

    switch (messageClass()) {
        case MessageClass::Control:
            result += "Control, ";
            result += "ControlMessageType: ";
            if (auto type = controlMessageType()) {
                result += controlMessageTypeToString(*type) + ", ";
            } else {
                result += "N/A, ";
            }
            break;

        case MessageClass::Data:
            result += "Data, ";
            result += "DataMessageType: ";
            if (auto type = dataMessageType()) {
                result += dataMessageTypeToString(*type) + ", ";
            } else {
                result += "N/A, ";
            }
            break;

        case MessageClass::Extended:
            result += "Extended, ";
            result += "ExtendedMessageType: ";
            if (auto type = extendedMessageType()) {
                result += extendedMessageTypeToString(*type) + ", ";
            } else {
                result += "N/A, ";
            }
            break;
    }

    result += "NumDataObjects: " + std::to_string(numDataObjects()) + ", ";
    result += "MessageID: " + std::to_string(messageId()) + ", ";
    result += "SpecRevision: ";
    switch (specRevision()) {
        case SpecRevision::Rev1_0:
            result += "Rev1.0, ";
            break;
        case SpecRevision::Rev2_0:
            result += "Rev2.0, ";
            break;
        case SpecRevision::Rev3_x:
            result += "Rev3.0, ";
            break;
        case SpecRevision::Reserved:
            result += "Reserved(3), ";
            break;
    }

    if (auto ppr = portPowerRole()) {
        result += "PortPowerRole: " + std::string(*ppr == PortPowerRole::Source ? "Source" : "Sink") + ", ";
    } else {
        result += "PortPowerRole: N/A, ";
    }

    if (auto pdr = portDataRole()) {
        result += "PortDataRole: " + std::string(*pdr == PortDataRole::DFP ? "DFP" : "UFP") + " ";
    } else {
        result += "PortDataRole: N/A ";
    }

    result += "}";

    return result;
}


