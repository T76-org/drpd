/**
 * @file control.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#include "control.hpp"


using namespace T76::DRPD::Proto;

std::span<const uint8_t> ControlMessage::raw() const {
    return {};
}

uint32_t ControlMessage::numDataObjects() const {
    return 0;
}

uint32_t ControlMessage::rawMessageType() const {
    return 0;
}

