#pragma once

#include "sink_types.hpp"

#include <cmath>
#include <optional>
#include <string_view>

namespace T76::DRPD::Logic {
    struct CableHeaderIntent {
        uint8_t targetIndex;
        uint8_t cablePlugBit;
        uint8_t reservedDataRoleBit;
    };

    [[nodiscard]] constexpr std::optional<SinkInquirySOPTarget>
    parseCableInquiryTarget(std::string_view token) {
        if (token == "SOP_PRIME") return SinkInquirySOPTarget::SOPPrime;
        if (token == "SOP_DOUBLE_PRIME") return SinkInquirySOPTarget::SOPDoublePrime;
        return std::nullopt;
    }

    [[nodiscard]] constexpr bool cableInquiryTypeSupported(SinkInquiryType type) {
        switch (type) {
            case SinkInquiryType::GetStatus:
            case SinkInquiryType::GetRevision:
            case SinkInquiryType::GetManufacturerInfo:
            case SinkInquiryType::DiscoverIdentity:
            case SinkInquiryType::DiscoverSVIDs:
            case SinkInquiryType::DiscoverModes:
                return true;
            default: return false;
        }
    }

    [[nodiscard]] inline bool cableInquirySyntaxValid(
        SinkInquiryType type, std::string_view target, size_t parameterCount,
        std::optional<double> svid = std::nullopt) {
        if (!parseCableInquiryTarget(target).has_value() ||
            !cableInquiryTypeSupported(type)) return false;
        if (type != SinkInquiryType::DiscoverModes) {
            return parameterCount == 2 && !svid.has_value();
        }
        return parameterCount == 3 && svid.has_value() && std::isfinite(*svid) &&
            *svid >= 1 && *svid <= 65535 && std::floor(*svid) == *svid;
    }

    [[nodiscard]] constexpr CableHeaderIntent cableHeaderIntent(
        SinkInquirySOPTarget target) {
        return target == SinkInquirySOPTarget::SOPDoublePrime
            ? CableHeaderIntent{2, 0, 0}
            : CableHeaderIntent{1, 0, 0};
    }

    template<typename Target>
    [[nodiscard]] constexpr Target preserveInquiryTarget(Target target) { return target; }
}
