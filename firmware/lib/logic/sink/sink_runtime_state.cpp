/**
 * @file sink_runtime_state.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "sink_runtime_state.hpp"
#include "sink_types.hpp"


using namespace T76::DRPD::Logic;


std::span<const uint8_t> SinkRuntimeState::ExtendedPayloadBuffer::span() const {
    return std::span<const uint8_t>(bytes.data(), length);
}

void SinkRuntimeState::ExtendedPayloadBuffer::clear() {
    length = 0;
}

SinkRuntimeState::SinkRuntimeState() :
    _state(SinkState::Unknown),
    _currentStateHandler(nullptr) {}

void SinkRuntimeState::reset() {
    _state = SinkState::Unknown;
    _currentStateHandler = nullptr;

    _sourceCapabilities.reset();
    _eprCapabilities.reset();
    _sourceSupportsEpr = false;

    _hasExplicitContract = false;
    _eprModeActive = false;
    _eprEntryAttempted = false;

    _hasLastReceivedMessageId = false;
    _lastReceivedMessageId = 0;

    _pendingRequestedPDO.reset();
    _pendingVoltage = 0.0f;
    _pendingCurrent = 0.0f;

    _negotiatedPDO.reset();
    _negotiatedVoltage = 0.0f;
    _negotiatedCurrent = 0.0f;

    for (auto &reassembly : _extendedReassemblyStates) {
        reassembly = ExtendedReassemblyState{};
    }

    for (auto &payload : _completedExtendedPayloads) {
        payload.reset();
    }
}

std::optional<size_t> SinkRuntimeState::trackedTypeIndex(Proto::ExtendedMessageType type) {
    switch (type) {
        case Proto::ExtendedMessageType::EPR_Source_Capabilities:
            return static_cast<size_t>(TrackedExtendedType::EPRSourceCapabilities);
        case Proto::ExtendedMessageType::Extended_Control:
            return static_cast<size_t>(TrackedExtendedType::ExtendedControl);
        default:
            return std::nullopt;
    }
}
