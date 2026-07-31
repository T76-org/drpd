#pragma once

#include <cstdint>

namespace T76::DRPD::Logic {

enum class InquiryMatch : uint8_t {
    Response,
    NotSupported,
    Rejected,
    Wait,
    ProtocolError,
};

/** Classify a GET_REVISION response from decoded numeric header fields. */
constexpr InquiryMatch classifyGetRevisionResponse(
    uint32_t messageClass, uint32_t messageType, uint32_t numDataObjects) {
    constexpr uint32_t controlClass = 1;
    constexpr uint32_t dataClass = 2;
    if (messageClass == controlClass) {
        if (messageType == 0x10) return InquiryMatch::NotSupported;
        if (messageType == 0x04) return InquiryMatch::Rejected;
        if (messageType == 0x0c) return InquiryMatch::Wait;
        return InquiryMatch::ProtocolError;
    }
    return messageClass == dataClass && messageType == 0x0c && numDataObjects == 1
        ? InquiryMatch::Response
        : InquiryMatch::ProtocolError;
}

}
