/**
 * @file epr_source_capabilities.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "source_capabilities.hpp"


namespace T76::DRPD::Proto {

    class EPRSourceCapabilities {
    public:
        static constexpr size_t MaxPDOCount = 15; ///< Request object position field is 4 bits (1..15).

        explicit EPRSourceCapabilities(std::span<const uint8_t> payload = {});

        [[nodiscard]] bool isMessageInvalid() const;
        [[nodiscard]] size_t pdoCount() const;
        [[nodiscard]] const PDOVariant &pdo(size_t index) const;
        [[nodiscard]] uint8_t objectPosition(size_t index) const;

    protected:
        std::array<PDOVariant, MaxPDOCount> _pdos = {{
            FixedSupplyPDO(0), FixedSupplyPDO(0), FixedSupplyPDO(0), FixedSupplyPDO(0),
            FixedSupplyPDO(0), FixedSupplyPDO(0), FixedSupplyPDO(0), FixedSupplyPDO(0),
            FixedSupplyPDO(0), FixedSupplyPDO(0), FixedSupplyPDO(0), FixedSupplyPDO(0),
            FixedSupplyPDO(0), FixedSupplyPDO(0), FixedSupplyPDO(0)
        }};
        std::array<uint8_t, MaxPDOCount> _objectPositions = {};
        size_t _pdoCount = 0;
        bool _messageInvalid = false;

        [[nodiscard]] static PDOVariant _createPDO(uint32_t raw);
    };

} // namespace T76::DRPD::Proto
