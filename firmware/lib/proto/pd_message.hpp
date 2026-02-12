/**
 * @file pd_message.hpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 * 
 */

#pragma once

#include <cstdint>
#include <span>
#include <vector>

#include "pd_header.hpp"
#include "pd_message_types.hpp"


namespace T76::DRPD::Proto {

    class PDMessage {
    public:
        virtual ~PDMessage() = default;
        virtual std::span<const uint8_t> raw() const = 0;
        virtual uint32_t numDataObjects() const = 0;
        virtual uint32_t rawMessageType() const = 0;
    };
    
} // namespace T76::DRPD::Proto
