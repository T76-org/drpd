/**
 * @file epr_source_capabilities.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "epr_source_capabilities.hpp"

#include <type_traits>


using namespace T76::DRPD::Proto;


EPRSourceCapabilities::EPRSourceCapabilities(std::span<const uint8_t> payload) {
    if (payload.size() < 4 || (payload.size() % 4) != 0) {
        _messageInvalid = true;
        return;
    }

    const size_t pdoWords = payload.size() / 4;
    _objectWordCount = pdoWords;
    if (pdoWords > MaxPDOCount) {
        _messageInvalid = true;
        return;
    }

    for (size_t i = 0; i < pdoWords; ++i) {
        const size_t offset = i * 4;
        const uint32_t raw = static_cast<uint32_t>(payload[offset + 0]) |
            (static_cast<uint32_t>(payload[offset + 1]) << 8) |
            (static_cast<uint32_t>(payload[offset + 2]) << 16) |
            (static_cast<uint32_t>(payload[offset + 3]) << 24);
        _rawObjects[i] = raw;

        if (raw == 0) {
            continue;
        }

        const PDOVariant pdo = _createPDO(raw);
        if (i < 7 && _isEPRPDO(pdo)) {
            _eprPDOInSPRPositions = true;
            _messageInvalid = true;
            return;
        }

        if (_pdoCount >= MaxPDOCount) {
            _messageInvalid = true;
            return;
        }
        _pdos[_pdoCount] = pdo;
        _objectPositions[_pdoCount] = static_cast<uint8_t>(i + 1);
        ++_pdoCount;
    }

    if (_pdoCount == 0) {
        _messageInvalid = true;
        return;
    }

    for (size_t i = 0; i < _pdoCount; ++i) {
        const auto &pdo = _pdos[i];
        if (std::visit([](const auto& typedPDO) { return typedPDO.isMessageInvalid(); }, pdo)) {
            _messageInvalid = true;
            return;
        }
    }
}

bool EPRSourceCapabilities::isMessageInvalid() const {
    return _messageInvalid;
}

bool EPRSourceCapabilities::hasEPRPDOInSPRPositions() const {
    return _eprPDOInSPRPositions;
}

bool EPRSourceCapabilities::matchesSPRSourceCapabilities(
    const SourceCapabilities& sourceCapabilities) const {
    if (sourceCapabilities.isMessageInvalid() ||
        sourceCapabilities.pdoCount() == 0 ||
        sourceCapabilities.pdoCount() > 7 ||
        _objectWordCount < 7) {
        return false;
    }

    for (size_t i = 0; i < sourceCapabilities.pdoCount(); ++i) {
        if (_rawObjects[i] != _rawPDO(sourceCapabilities.pdo(i))) {
            return false;
        }
    }

    for (size_t i = sourceCapabilities.pdoCount(); i < 7; ++i) {
        if (_rawObjects[i] != 0) {
            return false;
        }
    }

    return true;
}

size_t EPRSourceCapabilities::pdoCount() const {
    return _pdoCount;
}

const PDOVariant &EPRSourceCapabilities::pdo(size_t index) const {
    return _pdos[index];
}

uint8_t EPRSourceCapabilities::objectPosition(size_t index) const {
    return _objectPositions[index];
}

PDOVariant EPRSourceCapabilities::_createPDO(uint32_t raw) {
    const uint32_t supplyType = (raw >> 30) & 0x3;

    switch (supplyType) {
        case 0b00:
            return FixedSupplyPDO(raw);

        case 0b01:
            return BatterySupplyPDO(raw);

        case 0b10:
            return VariableSupplyPDO(raw);

        case 0b11: {
            const uint32_t apdoType = (raw >> 28) & 0x3;

            if (apdoType == static_cast<uint32_t>(AugmentedPDO::APDOType::SPR_PPS)) {
                return SPRPPSAPDO(raw);
            }

            if (apdoType == static_cast<uint32_t>(AugmentedPDO::APDOType::SPR_AVS)) {
                return SPRAVSAPDO(raw);
            }

            if (apdoType == static_cast<uint32_t>(AugmentedPDO::APDOType::EPR_AVS)) {
                return EPRAVSAPDO(raw);
            }

            return FixedSupplyPDO(raw);
        }

        default:
            return FixedSupplyPDO(raw);
    }
}

bool EPRSourceCapabilities::_isEPRPDO(const PDOVariant& pdo) {
    return std::visit([](const auto& typedPDO) {
        using T = std::decay_t<decltype(typedPDO)>;

        if constexpr (std::is_same_v<T, FixedSupplyPDO>) {
            return typedPDO.voltageMillivolts() > 20000;
        } else if constexpr (std::is_same_v<T, EPRAVSAPDO>) {
            return true;
        } else {
            return false;
        }
    }, pdo);
}

uint32_t EPRSourceCapabilities::_rawPDO(const PDOVariant& pdo) {
    return std::visit([](const auto& typedPDO) {
        return typedPDO.raw();
    }, pdo);
}
