#pragma once

#include <optional>

namespace T76::DRPD::Logic {
    template<typename Target>
    [[nodiscard]] constexpr bool exactSOPTargetMatch(
        const std::optional<Target>& expected, Target actual) {
        return expected.has_value() && expected.value() == actual;
    }
}
