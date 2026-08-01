/**
 * @file inquiry_descriptor.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Host-testable Sink inquiry protocol descriptors and response matching.
 */

#pragma once

#include <cstdint>
#include <cstddef>
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

enum class InquiryCacheKind : uint8_t {
    None,
    SourceCapabilities,
    SourceCapabilitiesExtended,
    Status,
    PPSStatus,
};

enum InquiryWarningFlags : uint32_t {
    InquiryWarningNone = 0,
    InquiryWarningStatusReadClearsEvents = 1u << 0,
    InquiryWarningRecoveredMalformedPPSStatus = 1u << 1,
};

enum class InquiryApplicability : uint8_t {
    Applicable,
    RequiresExplicitContract,
    RequiresSpecRevision,
    RequiresPPSContract,
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
    uint16_t minimumResponseBytes;
    uint16_t maximumResponseBytes;
    bool requiresExplicitContract;
    uint8_t minimumSpecRevision;
    bool requiresPPSContract;
    bool acceptsParameters;
    InquiryCacheKind cacheKind;
    uint32_t warningFlags;
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

[[nodiscard]] constexpr bool inquiryResponsePayloadSizeValid(
    const SinkInquiryDescriptor& descriptor,
    size_t payloadBytes) {
    return payloadBytes >= descriptor.minimumResponseBytes &&
        payloadBytes <= descriptor.maximumResponseBytes;
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

[[nodiscard]] constexpr InquiryApplicability inquiryStateApplicability(
    const SinkInquiryDescriptor& descriptor,
    bool hasExplicitContract,
    uint8_t negotiatedSpecRevision,
    bool hasPPSContract) {
    if (descriptor.requiresExplicitContract && !hasExplicitContract) {
        return InquiryApplicability::RequiresExplicitContract;
    }
    if (negotiatedSpecRevision < descriptor.minimumSpecRevision) {
        return InquiryApplicability::RequiresSpecRevision;
    }
    if (descriptor.requiresPPSContract && !hasPPSContract) {
        return InquiryApplicability::RequiresPPSContract;
    }
    return InquiryApplicability::Applicable;
}

}
