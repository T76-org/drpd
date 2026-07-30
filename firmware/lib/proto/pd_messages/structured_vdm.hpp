/**
 * @file structured_vdm.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#pragma once

#include <array>
#include <cstdint>
#include <optional>
#include <span>

#include "../pd_message.hpp"

namespace T76::DRPD::Proto {

    class StructuredVDM : public PDMessage {
    public:
        enum class CommandType : uint8_t {
            Request = 0,
            ACK = 1,
            NAK = 2,
            BUSY = 3,
        };

        enum class Command : uint8_t {
            DiscoverIdentity = 1,
            DiscoverSVIDs = 2,
            DiscoverModes = 3,
        };

        static constexpr uint16_t PDSID = 0xFF00;

        explicit StructuredVDM(uint32_t rawHeader);

        [[nodiscard]] static std::optional<StructuredVDM> decode(std::span<const uint8_t> body);
        [[nodiscard]] static StructuredVDM discoverIdentityNak(const StructuredVDM& request);

        [[nodiscard]] uint16_t svid() const;
        [[nodiscard]] bool structured() const;
        [[nodiscard]] uint8_t versionMajor() const;
        [[nodiscard]] uint8_t versionMinor() const;
        [[nodiscard]] uint8_t objectPosition() const;
        [[nodiscard]] CommandType commandType() const;
        [[nodiscard]] uint8_t command() const;
        [[nodiscard]] bool reservedBitSet() const;
        [[nodiscard]] bool isDiscoverIdentityRequest() const;
        [[nodiscard]] uint32_t rawHeader() const;

        std::span<const uint8_t> raw() const override;
        uint32_t numDataObjects() const override;
        uint32_t rawMessageType() const override;

    private:
        uint32_t _rawHeader;
        std::array<uint8_t, 4> _raw;
    };

} // namespace T76::DRPD::Proto
