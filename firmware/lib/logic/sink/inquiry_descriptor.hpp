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
#include <array>
#include <span>
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

enum class InquiryParameterKind : uint8_t {
    None,
    ManufacturerInfo,
    CountryCode,
};

struct EncodedInquiryBody {
    std::array<uint8_t, 4> bytes{};
    uint8_t length = 0;
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
    InquiryParameterKind parameterKind;
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
    switch (descriptor.parameterKind) {
        case InquiryParameterKind::None:
            return target == 0 && argument == 0 && selector == 0;
        case InquiryParameterKind::ManufacturerInfo:
            return (target == 0 && argument == 0 && selector == 0) ||
                (target == 1 && argument <= 7 && selector == 0);
        case InquiryParameterKind::CountryCode: {
            const uint8_t first = static_cast<uint8_t>(selector & 0xff);
            const uint8_t second = static_cast<uint8_t>((selector >> 8) & 0xff);
            return target == 0 && argument == 0 &&
                (selector & 0xffff0000u) == 0 &&
                first >= 'A' && first <= 'Z' && second >= 'A' && second <= 'Z';
        }
    }
    return false;
}

/** Encode the message-specific logical request body (without Extended Header). */
[[nodiscard]] constexpr EncodedInquiryBody encodeInquiryBody(
    const SinkInquiryDescriptor& descriptor,
    uint32_t target,
    uint32_t argument,
    uint32_t selector) {
    EncodedInquiryBody result;
    if (!inquiryParametersApplicable(descriptor, target, argument, selector)) return result;
    if (descriptor.parameterKind == InquiryParameterKind::ManufacturerInfo) {
        result.bytes[0] = static_cast<uint8_t>(target);
        result.bytes[1] = static_cast<uint8_t>(argument);
        result.length = 2;
    } else if (descriptor.parameterKind == InquiryParameterKind::CountryCode) {
        // CCDO B31..24/B23..16; raw PD bodies are little-endian.
        result.bytes[2] = static_cast<uint8_t>((selector >> 8) & 0xff);
        result.bytes[3] = static_cast<uint8_t>(selector & 0xff);
        result.length = 4;
    }
    return result;
}

/** Verify response fields which echo a request selector. */
[[nodiscard]] constexpr bool inquiryResponseCorrelates(
    const SinkInquiryDescriptor& descriptor,
    uint32_t selector,
    std::span<const uint8_t> payload) {
    if (descriptor.parameterKind != InquiryParameterKind::CountryCode) return true;
    return payload.size() >= 2 && payload[0] == static_cast<uint8_t>(selector & 0xff) &&
        payload[1] == static_cast<uint8_t>((selector >> 8) & 0xff);
}

/** Validate message-specific response data-block invariants. */
[[nodiscard]] constexpr bool inquiryResponseStructureValid(
    const SinkInquiryDescriptor& descriptor,
    std::span<const uint8_t> payload) {
    // Country_Codes CCDB: Length, zero reserved byte, then exactly Length codes.
    if (descriptor.response.messageClass == InquiryMessageClass::Extended &&
        descriptor.response.messageType == 0x0e) {
        if (payload.size() < 4 || payload[1] != 0 ||
            payload.size() != 2u + static_cast<size_t>(payload[0]) * 2u) return false;
        for (size_t i = 2; i < payload.size(); ++i) {
            if (payload[i] < 'A' || payload[i] > 'Z') return false;
        }
    }
    // Country_Info CIDB reserved bytes Shall be zero.
    if (descriptor.parameterKind == InquiryParameterKind::CountryCode) {
        return payload.size() >= 4 && payload[2] == 0 && payload[3] == 0;
    }
    return true;
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
