/**
 * @file source_capabilities.cpp
 * @copyright Copyright (c) 2025 MTA, Inc.
 */

#include "source_capabilities.hpp"
#include <cstdio>


using namespace T76::DRPD::Proto;


SourceCapabilities::SourceCapabilities(std::span<const uint8_t> payload, uint32_t numDataObjects) {
    // Validate payload size
    if (payload.size() % 4 != 0) {
        _messageInvalid = true;
        return;
    }

    size_t payload_pdo_count = payload.size() / 4;

    // Validate PDO count matches expected count from header
    if (payload_pdo_count != numDataObjects) {
        _messageInvalid = true;
        return;
    }

    // Must have between 1 and 7 PDOs
    if (numDataObjects < 1 || numDataObjects > 7) {
        _messageInvalid = true;
        return;
    }

    // Decode each PDO from the payload
    for (size_t i = 0; i < numDataObjects; ++i) {
        // Convert 4 bytes (little-endian) to uint32_t
        uint32_t raw = payload[i * 4] |
                      (static_cast<uint32_t>(payload[i * 4 + 1]) << 8) |
                      (static_cast<uint32_t>(payload[i * 4 + 2]) << 16) |
                      (static_cast<uint32_t>(payload[i * 4 + 3]) << 24);

        // Create the appropriate PDO type and add to container
        PDOVariant pdo_variant = _createPDO(raw);

        // Check if the created PDO is invalid
        bool is_invalid = std::visit(
            [](const auto& pdo) { return pdo.isMessageInvalid(); },
            pdo_variant
        );

        if (is_invalid) {
            _messageInvalid = true;
        }

        _pdos[i] = pdo_variant;
    }
    _pdoCount = numDataObjects;
}


bool SourceCapabilities::isMessageInvalid() const {
    return _messageInvalid;
}


size_t SourceCapabilities::pdoCount() const {
    return _pdoCount;
}


const PDOVariant& SourceCapabilities::pdo(size_t index) const {
    return _pdos[index];
}


int SourceCapabilities::findPDO(const PDObject& targetPDO) const {
    for (size_t i = 0; i < _pdoCount; ++i) {
        // Use std::visit to compare the PDO in the variant with the target
        bool matches = std::visit(
            [&targetPDO](const auto& pdo) { return pdo == targetPDO; },
            _pdos[i]
        );
        
        if (matches) {
            return static_cast<int>(i);
        }
    }
    
    return -1; // Not found
}


PDOVariant SourceCapabilities::_createPDO(uint32_t raw) {
    uint32_t pdo_type = (raw >> 30) & 0x3;

    switch (pdo_type) {
        case 0:
            return FixedSupplyPDO(raw);
        case 1:
            return BatterySupplyPDO(raw);
        case 2:
            return VariableSupplyPDO(raw);
        case 3: {
            // Determine APDO subtype based on bits 29:28
            uint32_t apdo_type = (raw >> 28) & 0x3;
            switch (apdo_type) {
                case 0:
                    return SPRPPSAPDO(raw);
                case 1:
                    return SPRAVSAPDO(raw);
                case 2:
                    return EPRAVSAPDO(raw);
                default:
                    // Invalid APDO type, return a default SPR PPS
                    return SPRPPSAPDO(raw);
            }
        }
        default:
            // This should never happen due to the 2-bit mask, but for completeness
            return FixedSupplyPDO(raw);
    }
}


std::string SourceCapabilities::toString() const {
    std::string out;
    char buffer[160];
    int written = std::snprintf(
        buffer,
        sizeof(buffer),
        "SourceCapabilities \n  PDO Count: %zu\n  Invalid: %s\n  PDOs: \n\n",
        pdoCount(),
        isMessageInvalid() ? "yes" : "no"
    );

    if (written > 0) {
        size_t count = static_cast<size_t>(written);
        if (count >= sizeof(buffer)) {
            count = sizeof(buffer) - 1;
        }
        out.append(buffer, count);
    }

    for (size_t i = 0; i < _pdoCount; ++i) {
        std::visit(
            [&out](const auto& pdo) {
                out += pdo.toString();
                out.push_back('\n');
            },
            _pdos[i]
        );
    }

    out.push_back('\n');
    return out;
}


SourceCapabilities::PDOMatch SourceCapabilities::findBestMatchingPDO(uint32_t targetVoltageMillivolts) const {
    PDOMatch bestMatch = { nullptr, -1, false };
    uint32_t bestVoltage = 0;
    bool bestIsExact = false;

    auto considerCandidate = [&](uint32_t candidateVoltage, bool candidateExact, size_t idx) {
        // Prefer exact matches over inexact. For equal exactness, prefer higher voltage (closer to target without exceeding).
        if (candidateExact && !bestIsExact) {
            bestIsExact = true;
            bestVoltage = candidateVoltage;
            bestMatch.pdo = &_pdos[idx];
            bestMatch.position = static_cast<int>(idx);
            bestMatch.exactMatch = true;
            return;
        }

        if (candidateExact && bestIsExact && candidateVoltage > bestVoltage) {
            bestVoltage = candidateVoltage;
            bestMatch.pdo = &_pdos[idx];
            bestMatch.position = static_cast<int>(idx);
            bestMatch.exactMatch = true;
            return;
        }

        if (!candidateExact && !bestIsExact && candidateVoltage > bestVoltage) {
            bestVoltage = candidateVoltage;
            bestMatch.pdo = &_pdos[idx];
            bestMatch.position = static_cast<int>(idx);
            bestMatch.exactMatch = false;
        }
    };

    for (size_t i = 0; i < _pdoCount; ++i) {
        std::visit(
            [&](const auto& pdo) {
                using T = std::decay_t<decltype(pdo)>;
                
                // Fixed PDO: exact only when it equals target; otherwise still eligible if below target
                if constexpr (std::is_same_v<T, FixedSupplyPDO>) {
                    uint32_t voltage = pdo.voltageMillivolts();
                    if (voltage <= targetVoltageMillivolts) {
                        bool candidateExact = (voltage == targetVoltageMillivolts);
                        considerCandidate(voltage, candidateExact, i);
                    }
                }
                // Variable PDO: any voltage within range can be supplied, treat as exact if target is inside range
                else if constexpr (std::is_same_v<T, VariableSupplyPDO>) {
                    uint32_t minVoltage = pdo.minVoltageMillivolts();
                    uint32_t maxVoltage = pdo.maxVoltageMillivolts();
                    if (targetVoltageMillivolts >= minVoltage && targetVoltageMillivolts <= maxVoltage) {
                        considerCandidate(targetVoltageMillivolts, true, i);
                    }
                }
                // Battery PDO: behaves like variable range for voltage matching
                else if constexpr (std::is_same_v<T, BatterySupplyPDO>) {
                    uint32_t minVoltage = pdo.minVoltageMillivolts();
                    uint32_t maxVoltage = pdo.maxVoltageMillivolts();
                    if (targetVoltageMillivolts >= minVoltage && targetVoltageMillivolts <= maxVoltage) {
                        considerCandidate(targetVoltageMillivolts, true, i);
                    }
                }
                // Augmented PDO (PPS): also supports programmable voltage within range
                else if constexpr (std::is_same_v<T, AugmentedPDO>) {
                    uint32_t minVoltage = pdo.minVoltageMillivolts();
                    uint32_t maxVoltage = pdo.maxVoltageMillivolts();
                    if (targetVoltageMillivolts >= minVoltage && targetVoltageMillivolts <= maxVoltage) {
                        considerCandidate(targetVoltageMillivolts, true, i);
                    }
                }
            },
            _pdos[i]
        );
    }

    return bestMatch;
}
