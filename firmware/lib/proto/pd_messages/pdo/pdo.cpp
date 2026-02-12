/**
 * @file pdo.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 */

#include "pdo.hpp"


using namespace T76::DRPD::Proto;


PDObject::PDObject(uint32_t raw) : _raw(raw), _messageInvalid(false) {}


uint32_t PDObject::raw() const {
    return _raw;
}


bool PDObject::isMessageInvalid() const {
    return _messageInvalid;
}


bool PDObject::operator==(const PDObject& other) const {
    return _raw == other._raw;
}
