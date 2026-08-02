#pragma once

#include "sink_types.hpp"

#include <array>
#include <bit>
#include <cstddef>
#include <cstdint>
#include <span>

namespace T76::DRPD::Logic {
    constexpr uint8_t AuthenticationProtocolVersion = 0x10;
    constexpr uint8_t AuthenticationGetDigests = 0x81;
    constexpr uint8_t AuthenticationGetCertificate = 0x82;
    constexpr uint8_t AuthenticationChallenge = 0x83;
    constexpr uint8_t AuthenticationDigests = 0x01;
    constexpr uint8_t AuthenticationCertificate = 0x02;
    constexpr uint8_t AuthenticationChallengeAuth = 0x03;
    constexpr uint8_t AuthenticationError = 0x7f;

    struct EncodedAuthenticationRequest {
        std::array<uint8_t, 36> bytes = {};
        size_t length = 0;
        bool valid = false;
    };
    struct EncodedAuthenticationChunk {
        std::array<uint8_t, 28> bytes = {};
        uint8_t dataObjects = 0;
        bool valid = false;
    };

    [[nodiscard]] constexpr uint16_t authenticationCertificateLength(
        const SinkInquiryParameters& parameters) {
        return static_cast<uint16_t>(parameters.selector[0]) |
            (static_cast<uint16_t>(parameters.selector[1]) << 8);
    }

    [[nodiscard]] constexpr bool authenticationParametersValid(
        SinkInquiryType type, const SinkInquiryParameters& parameters) {
        if (parameters.sopTarget != SinkInquirySOPTarget::SOP) return false;
        const bool selectorZero = parameters.selector == std::array<uint8_t, 4>{};
        const bool payloadZero = parameters.payload == std::array<uint8_t, 32>{};
        if (type == SinkInquiryType::GetDigests)
            return parameters.target == 0 && parameters.argument == 0 &&
                selectorZero && payloadZero;
        if (type == SinkInquiryType::GetCertificate)
            return parameters.target <= 7 && parameters.argument <= 4095 &&
                authenticationCertificateLength(parameters) >= 1 &&
                authenticationCertificateLength(parameters) <= 256 &&
                parameters.selector[2] == 0 && parameters.selector[3] == 0 && payloadZero &&
                parameters.argument + authenticationCertificateLength(parameters) <= 4096;
        if (type == SinkInquiryType::Challenge)
            return parameters.target <= 7 && parameters.argument == 0 && selectorZero;
        return false;
    }

    [[nodiscard]] constexpr EncodedAuthenticationRequest encodeAuthenticationRequest(
        SinkInquiryType type, const SinkInquiryParameters& parameters) {
        EncodedAuthenticationRequest result;
        if (!authenticationParametersValid(type, parameters)) return result;
        result.bytes[0] = AuthenticationProtocolVersion;
        if (type == SinkInquiryType::GetDigests) {
            result.bytes[1] = AuthenticationGetDigests;
            result.length = 4;
        } else if (type == SinkInquiryType::GetCertificate) {
            const uint16_t length = authenticationCertificateLength(parameters);
            result.bytes[1] = AuthenticationGetCertificate;
            result.bytes[2] = static_cast<uint8_t>(parameters.target);
            result.bytes[4] = static_cast<uint8_t>(parameters.argument & 0xff);
            result.bytes[5] = static_cast<uint8_t>((parameters.argument >> 8) & 0xff);
            result.bytes[6] = static_cast<uint8_t>(length & 0xff);
            result.bytes[7] = static_cast<uint8_t>((length >> 8) & 0xff);
            result.length = 8;
        } else {
            result.bytes[1] = AuthenticationChallenge;
            result.bytes[2] = static_cast<uint8_t>(parameters.target);
            for (size_t i = 0; i < parameters.payload.size(); ++i)
                result.bytes[4 + i] = parameters.payload[i];
            result.length = 36;
        }
        result.valid = true;
        return result;
    }

    [[nodiscard]] constexpr uint32_t authenticationResponseTimeoutUs(SinkInquiryType type) {
        return type == SinkInquiryType::Challenge ? 1200000u : 200000u;
    }

    [[nodiscard]] constexpr EncodedAuthenticationChunk encodeAuthenticationChunk(
        const EncodedAuthenticationRequest& request, uint8_t chunkNumber) {
        EncodedAuthenticationChunk frame;
        if (!request.valid || chunkNumber > 1 ||
            (chunkNumber == 1 && request.length <= 26)) return frame;
        const size_t offset = static_cast<size_t>(chunkNumber) * 26;
        const size_t count = request.length - offset > 26 ? 26 : request.length - offset;
        const bool chunked = request.length > 26;
        const uint16_t header = static_cast<uint16_t>(request.length) |
            (chunked ? 0x8000u : 0u) |
            (static_cast<uint16_t>(chunkNumber) << 11);
        frame.bytes[0] = static_cast<uint8_t>(header & 0xff);
        frame.bytes[1] = static_cast<uint8_t>((header >> 8) & 0xff);
        for (size_t i = 0; i < count; ++i) frame.bytes[2 + i] = request.bytes[offset + i];
        frame.dataObjects = static_cast<uint8_t>((count + 2 + 3) / 4);
        frame.valid = true;
        return frame;
    }

    enum class AuthenticationResponseKind : uint8_t { Response, Error, Malformed };

    class AuthenticationChunkRequestState {
    public:
        void begin(SinkInquiryType type, uint32_t requestId) {
            _requestId = requestId;
            _expected = type == SinkInquiryType::Challenge;
            _served = false;
        }
        [[nodiscard]] bool accept(uint32_t requestId, uint8_t chunkNumber) {
            if (!_expected || _served || requestId != _requestId || chunkNumber != 1)
                return false;
            _served = true;
            return true;
        }
        void reset() { _requestId = 0; _expected = false; _served = false; }
        [[nodiscard]] bool expected() const { return _expected && !_served; }
    private:
        uint32_t _requestId = 0;
        bool _expected = false;
        bool _served = false;
    };

    [[nodiscard]] constexpr AuthenticationResponseKind validateAuthenticationResponse(
        SinkInquiryType requestType, const SinkInquiryParameters& parameters,
        std::span<const uint8_t> payload) {
        if (payload.size() < 4 || (payload[0] != 0x10 && payload[0] != 0x01))
            return AuthenticationResponseKind::Malformed;
        if (payload[1] == AuthenticationError) {
            if (payload.size() != 4) return AuthenticationResponseKind::Malformed;
            const uint8_t code = payload[2];
            if (code == 0 || (code >= 5 && code < 0xf0))
                return AuthenticationResponseKind::Malformed;
            if ((code == 1 || code == 3 || code == 4) && payload[3] != 0)
                return AuthenticationResponseKind::Malformed;
            return AuthenticationResponseKind::Error;
        }
        if (requestType == SinkInquiryType::GetDigests) {
            if (payload[1] != AuthenticationDigests || payload[2] != 1) return AuthenticationResponseKind::Malformed;
            const size_t digestCount = std::popcount(payload[3]);
            return payload.size() == 4 + 32 * digestCount
                ? AuthenticationResponseKind::Response : AuthenticationResponseKind::Malformed;
        }
        if (requestType == SinkInquiryType::GetCertificate) {
            if (payload[1] != AuthenticationCertificate || payload[2] != parameters.target ||
                payload[3] != 0 || payload.size() < 5 ||
                payload.size() - 4 > authenticationCertificateLength(parameters))
                return AuthenticationResponseKind::Malformed;
            return AuthenticationResponseKind::Response;
        }
        if (requestType == SinkInquiryType::Challenge) {
            if (payload.size() != 168 || parameters.target > 7)
                return AuthenticationResponseKind::Malformed;
            const bool minimumVersionValid = payload[4] == 0x10 || payload[4] == 0x01;
            const bool maximumVersionValid = payload[5] == 0x10 || payload[5] == 0x01;
            bool contextHashZero = true;
            if (payload.size() == 168) {
                for (size_t i = 72; i < 104; ++i) contextHashZero &= payload[i] == 0;
            }
            if (payload[1] != AuthenticationChallengeAuth || payload[2] != parameters.target ||
                (payload[3] & (1u << parameters.target)) == 0 ||
                !minimumVersionValid || !maximumVersionValid || payload[5] < payload[4] ||
                payload[6] != 1 || payload[7] != 0 || !contextHashZero)
                return AuthenticationResponseKind::Malformed;
            return AuthenticationResponseKind::Response;
        }
        return AuthenticationResponseKind::Malformed;
    }
}
