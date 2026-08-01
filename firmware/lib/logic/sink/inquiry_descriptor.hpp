/**
 * @file inquiry_descriptor.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Host-testable Sink inquiry protocol descriptors and response matching.
 */

#pragma once

#include <cstdint>
#include <optional>
#include <string_view>

namespace T76::DRPD::Logic {

enum class SinkInquiryType : uint32_t;

enum class InquiryMessageClass : uint8_t {
    Extended = 0,
    Control = 1,
    Data = 2,
};

enum class InquiryMatch : uint8_t {
    Response,
    NotSupported,
    Rejected,
    Wait,
    Unrelated,
    ProtocolError,
};

struct InquiryResponseDescriptor {
    InquiryMessageClass messageClass;
    uint8_t messageType;
    uint8_t minimumDataObjects;
    uint8_t maximumDataObjects;
};

struct SinkInquiryDescriptor {
    SinkInquiryType type;
    const char *token;
    InquiryMessageClass requestClass;
    uint8_t requestMessageType;
    uint8_t requestDataObjects;
    InquiryResponseDescriptor response;
    uint32_t responseTimeoutUs;
    bool requiresExplicitContract;
    bool acceptsParameters;
};

/** Return protocol descriptor for a locally supported inquiry type. */
[[nodiscard]] std::optional<SinkInquiryDescriptor> sinkInquiryDescriptor(
    SinkInquiryType type);

/** Return protocol descriptor matching canonical SCPI token. */
[[nodiscard]] std::optional<SinkInquiryDescriptor> sinkInquiryDescriptor(
    std::string_view token);

/** Match generic decoded header metadata against one inquiry descriptor. */
[[nodiscard]] constexpr InquiryMatch matchInquiryResponse(
    const SinkInquiryDescriptor& descriptor,
    uint32_t messageClass,
    uint32_t messageType,
    uint32_t numDataObjects) {
    constexpr uint32_t controlClass = static_cast<uint32_t>(InquiryMessageClass::Control);
    if (messageClass == controlClass) {
        if (messageType == 0x10) return InquiryMatch::NotSupported;
        if (messageType == 0x04) return InquiryMatch::Rejected;
        if (messageType == 0x0c) return InquiryMatch::Wait;
    }
    const auto& expected = descriptor.response;
    if (messageClass != static_cast<uint32_t>(expected.messageClass) ||
        messageType != expected.messageType) {
        return InquiryMatch::Unrelated;
    }
    return numDataObjects >= expected.minimumDataObjects &&
            numDataObjects <= expected.maximumDataObjects
        ? InquiryMatch::Response : InquiryMatch::ProtocolError;
}

/** Validate fixed POD parameter fields against descriptor contract. */
[[nodiscard]] constexpr bool inquiryParametersApplicable(
    const SinkInquiryDescriptor& descriptor,
    uint32_t target,
    uint32_t argument,
    uint32_t selector) {
    return descriptor.acceptsParameters ||
        (target == 0 && argument == 0 && selector == 0);
}

}
