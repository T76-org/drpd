/**
 * @file epr_source_capabilities.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#pragma once

#include <cstddef>
#include <cstdint>
#include <span>
#include <vector>

#include "source_capabilities.hpp"


namespace T76::DRPD::Proto {

    class EPRSourceCapabilities {
    public:
        explicit EPRSourceCapabilities(std::span<const uint8_t> payload = {});

        [[nodiscard]] bool isMessageInvalid() const;
        [[nodiscard]] size_t pdoCount() const;
        [[nodiscard]] const PDOVariant &pdo(size_t index) const;
        [[nodiscard]] uint8_t objectPosition(size_t index) const;

    protected:
        std::vector<PDOVariant> _pdos;
        std::vector<uint8_t> _objectPositions;
        bool _messageInvalid = false;

        [[nodiscard]] static PDOVariant _createPDO(uint32_t raw);
    };

} // namespace T76::DRPD::Proto
