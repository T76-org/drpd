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
    VDMNAK,
    VDMBusy,
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
    InquiryWarningUFPDiagnosticDiscoverIdentity = 1u << 2,
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
    BatteryReference,
    DiscoverIdentity,
    DiscoverSVIDs,
    DiscoverModes,
};

struct EncodedInquiryBody {
    std::array<uint8_t, 4> bytes{};
    uint8_t length = 0;
};

struct EncodedExtendedInquiryFrame {
    std::array<uint8_t, 4> bytes{};
    bool valid = false;
};

/** Attach-scoped Structured VDM version negotiated by Discover Identity. */
struct StructuredVDMVersionState {
    uint8_t major = 1; // Structured VDM 2.x encoding.
    uint8_t minor = 1; // Structured VDM 2.1.
    bool attachmentActive = false;

    constexpr void updateAttachment(bool attached) {
        if (!attached) {
            major = 1;
            minor = 1;
            attachmentActive = false;
        } else if (!attachmentActive) {
            major = 1;
            minor = 1;
            attachmentActive = true;
        }
    }

    constexpr bool recordIdentityACK(uint8_t responseMajor, uint8_t responseMinor) {
        if (responseMajor > 1 || (responseMajor == 0 && responseMinor != 0) ||
            (responseMajor == 1 && responseMinor > 1)) return false;
        if (responseMajor > major ||
            (responseMajor == major && responseMinor > minor)) return false;
        major = responseMajor;
        minor = responseMinor;
        return true;
    }
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
        case InquiryParameterKind::BatteryReference:
            return target == 0 && argument <= 7 && selector == 0;
        case InquiryParameterKind::DiscoverIdentity:
        case InquiryParameterKind::DiscoverSVIDs:
            return target == 0 && argument == 0 && selector == 0;
        case InquiryParameterKind::DiscoverModes:
            return target == 0 && argument >= 1 && argument <= 0xffff && selector == 0;
    }
    return false;
}

/** Encode the message-specific logical request body (without Extended Header). */
[[nodiscard]] constexpr EncodedInquiryBody encodeInquiryBody(
    const SinkInquiryDescriptor& descriptor,
    uint32_t target,
    uint32_t argument,
    uint32_t selector,
    uint8_t structuredVDMVersionMajor = 1,
    uint8_t structuredVDMVersionMinor = 1) {
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
    } else if (descriptor.parameterKind == InquiryParameterKind::BatteryReference) {
        result.bytes[0] = static_cast<uint8_t>(argument);
        result.length = 1;
    } else if (descriptor.parameterKind == InquiryParameterKind::DiscoverIdentity ||
               descriptor.parameterKind == InquiryParameterKind::DiscoverSVIDs ||
               descriptor.parameterKind == InquiryParameterKind::DiscoverModes) {
        const uint16_t svid = descriptor.parameterKind == InquiryParameterKind::DiscoverModes
            ? static_cast<uint16_t>(argument) : 0xff00;
        const uint8_t command = descriptor.parameterKind == InquiryParameterKind::DiscoverIdentity
            ? 1 : descriptor.parameterKind == InquiryParameterKind::DiscoverSVIDs ? 2 : 3;
        const uint32_t vdmHeader = (static_cast<uint32_t>(svid) << 16) |
            0x00008000u | (static_cast<uint32_t>(structuredVDMVersionMajor) << 13) |
            (static_cast<uint32_t>(structuredVDMVersionMinor) << 11) | command;
        result.bytes = {static_cast<uint8_t>(vdmHeader & 0xff),
            static_cast<uint8_t>((vdmHeader >> 8) & 0xff),
            static_cast<uint8_t>((vdmHeader >> 16) & 0xff),
            static_cast<uint8_t>((vdmHeader >> 24) & 0xff)};
        result.length = 4;
    }
    return result;
}

/** Match and correlate a Structured VDM discovery response. */
[[nodiscard]] constexpr InquiryMatch matchStructuredVDMResponse(
    const SinkInquiryDescriptor& descriptor,
    uint32_t argument,
    std::span<const uint8_t> payload) {
    const bool discovery = descriptor.parameterKind == InquiryParameterKind::DiscoverIdentity ||
        descriptor.parameterKind == InquiryParameterKind::DiscoverSVIDs ||
        descriptor.parameterKind == InquiryParameterKind::DiscoverModes;
    if (!discovery || payload.size() < 4) return InquiryMatch::ProtocolError;
    const uint32_t raw = static_cast<uint32_t>(payload[0]) |
        (static_cast<uint32_t>(payload[1]) << 8) |
        (static_cast<uint32_t>(payload[2]) << 16) |
        (static_cast<uint32_t>(payload[3]) << 24);
    const uint16_t expectedSVID = descriptor.parameterKind == InquiryParameterKind::DiscoverModes
        ? static_cast<uint16_t>(argument) : 0xff00;
    const uint8_t expectedCommand = descriptor.parameterKind == InquiryParameterKind::DiscoverIdentity
        ? 1 : descriptor.parameterKind == InquiryParameterKind::DiscoverSVIDs ? 2 : 3;
    if (static_cast<uint16_t>(raw >> 16) != expectedSVID || (raw & 0x8000u) == 0 ||
        ((raw >> 8) & 0x07u) != 0 || (raw & 0x20u) != 0 ||
        (raw & 0x1fu) != expectedCommand) return InquiryMatch::Unrelated;
    const uint8_t versionMajor = static_cast<uint8_t>((raw >> 13) & 0x03u);
    const uint8_t versionMinor = static_cast<uint8_t>((raw >> 11) & 0x03u);
    if (versionMajor > 1 || (versionMajor == 0 && versionMinor != 0) ||
        (versionMajor == 1 && versionMinor > 1)) return InquiryMatch::ProtocolError;
    const uint8_t commandType = static_cast<uint8_t>((raw >> 6) & 0x03u);
    if (commandType == 1) return inquiryResponsePayloadSizeValid(descriptor, payload.size())
        ? InquiryMatch::Response : InquiryMatch::ProtocolError;
    if (payload.size() != 4) return InquiryMatch::ProtocolError;
    if (commandType == 2) return InquiryMatch::VDMNAK;
    if (commandType == 3) return InquiryMatch::VDMBusy;
    return InquiryMatch::ProtocolError;
}

/** Encode a single-chunk Extended request body including Extended Header. */
[[nodiscard]] constexpr EncodedExtendedInquiryFrame encodeExtendedInquiryFrame(
    const SinkInquiryDescriptor& descriptor,
    uint32_t target,
    uint32_t argument,
    uint32_t selector) {
    EncodedExtendedInquiryFrame frame;
    if (descriptor.requestClass != InquiryMessageClass::Extended) return frame;
    const auto body = encodeInquiryBody(descriptor, target, argument, selector);
    if (body.length == 0 || body.length > 2) return frame;
    // Data Size B8..0 plus Chunked B15. Request Chunk and Chunk Number are zero.
    const uint16_t header = static_cast<uint16_t>(0x8000u | body.length);
    frame.bytes = {static_cast<uint8_t>(header & 0xff),
        static_cast<uint8_t>((header >> 8) & 0xff), body.bytes[0], body.bytes[1]};
    frame.valid = true;
    return frame;
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
    if (descriptor.response.messageClass == InquiryMessageClass::Extended &&
        descriptor.response.messageType == 0x05) {
        return payload.size() == 9 && (payload[8] & 0xfeu) == 0;
    }
    if (descriptor.response.messageClass == InquiryMessageClass::Data &&
        descriptor.response.messageType == 0x05) {
        if (payload.size() != 4 || payload[0] != 0 || (payload[1] & 0xf0u) != 0) return false;
        const bool present = (payload[1] & 0x02u) != 0;
        const uint8_t charging = static_cast<uint8_t>((payload[1] >> 2) & 0x03u);
        return present ? charging != 3 : charging == 0;
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
