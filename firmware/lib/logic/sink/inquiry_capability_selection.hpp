#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <span>

namespace T76::DRPD::Logic {

enum class CapabilityRefreshSelectionProvenance : uint8_t {
    MatchedPreviousPDO,
    SafeFirstPDOFallback,
    NoCapabilities,
};

struct CapabilityRefreshSelection {
    CapabilityRefreshSelectionProvenance provenance;
    size_t index;
};

[[nodiscard]] constexpr CapabilityRefreshSelection selectRefreshedCapability(
    std::optional<uint32_t> previousRawPDO,
    std::span<const uint32_t> refreshedRawPDOs) {
    if (refreshedRawPDOs.empty()) {
        return {CapabilityRefreshSelectionProvenance::NoCapabilities, 0};
    }
    if (previousRawPDO.has_value()) {
        for (size_t i = 0; i < refreshedRawPDOs.size(); ++i) {
            if (refreshedRawPDOs[i] == previousRawPDO.value()) {
                return {CapabilityRefreshSelectionProvenance::MatchedPreviousPDO, i};
            }
        }
    }
    return {CapabilityRefreshSelectionProvenance::SafeFirstPDOFallback, 0};
}

}
