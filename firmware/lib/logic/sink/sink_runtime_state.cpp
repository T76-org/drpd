/**
 * @file sink_runtime_state.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "sink_runtime_state.hpp"
#include "sink_types.hpp"

#include <algorithm>


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

void SinkRuntimeState::_lockInquiryResult() const {
    while (_inquiryResultLock.test_and_set(std::memory_order_acquire)) {
        tight_loop_contents();
    }
}

void SinkRuntimeState::_unlockInquiryResult() const {
    _inquiryResultLock.clear(std::memory_order_release);
}

void SinkRuntimeState::reset() {
    _lockInquiryResult();
    const SinkInquiryResult previousInquiry = _inquiryResult;
    _state = SinkState::Unknown;
    _currentStateHandler = nullptr;

    _sourceCapabilities.reset();
    _eprCapabilities.reset();
    _specRevision = Proto::PDHeader::SpecRevision::Rev3_x;
    _ppsStatus.reset();
    _sourceCapabilitiesExtended.reset();
    _sourceStatus.reset();
    _inquiryResult = previousInquiry;
    if (_inquiryResult.status.outcome == SinkInquiryOutcome::Pending) {
        _inquiryResult.status.outcome = SinkInquiryOutcome::Aborted;
        _inquiryResult.status.responseLength = 0;
    }
    _unlockInquiryResult();
    _sourceSupportsEpr = false;

    _hasExplicitContract = false;
    _eprModeActive = false;
    _eprEntryAttempted = false;
    _eprEntryRefusedFallbackActive = false;
    _eprSourceExitRequested = false;

    resetStoredReceivedMessageId();

    _pendingRequestedPDO.reset();
    _pendingPDOIndex = 0;
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
    _completedInquiryExtendedPayload.reset();
    _inquiryRecoveredMalformedPPSStatus = false;
}

SinkInquiryResult SinkRuntimeState::inquiryResult() const {
    _lockInquiryResult();
    const SinkInquiryResult result = _inquiryResult;
    _unlockInquiryResult();
    return result;
}

void SinkRuntimeState::beginInquiry(const SinkInquiryRequest& request) {
    _lockInquiryResult();
    _inquiryResult = SinkInquiryResult{};
    _inquiryResult.status.id = request.id;
    _inquiryResult.status.type = request.type;
    _inquiryResult.parameters = request.parameters;
    _inquiryResult.status.outcome = SinkInquiryOutcome::Pending;
    _completedInquiryExtendedPayload.reset();
    _inquiryRecoveredMalformedPPSStatus = false;
    _unlockInquiryResult();
}

void SinkRuntimeState::finishInquiry(
    SinkInquiryOutcome outcome,
    uint32_t responseClass,
    uint32_t responseType,
    std::span<const uint8_t> response,
    uint32_t warningFlags) {
    _lockInquiryResult();
    const size_t responseLength = std::min(response.size(), _inquiryResult.response.size());
    if (responseLength > 0) {
        std::copy_n(response.begin(), responseLength, _inquiryResult.response.begin());
    }
    _inquiryResult.status.responseClass = responseClass;
    _inquiryResult.status.responseType = responseType;
    _inquiryResult.status.responseLength = responseLength;
    _inquiryResult.status.warningFlags = warningFlags;
    _inquiryResult.status.outcome = outcome;
    _unlockInquiryResult();
}

void SinkRuntimeState::resetStoredReceivedMessageId() {
    _hasStoredReceivedMessageId = false;
    _storedReceivedMessageId = 0;
}

bool SinkRuntimeState::isDuplicateReceivedMessageId(uint8_t messageId) const {
    return _hasStoredReceivedMessageId && _storedReceivedMessageId == messageId;
}

void SinkRuntimeState::storeReceivedMessageId(uint8_t messageId) {
    _hasStoredReceivedMessageId = true;
    _storedReceivedMessageId = messageId;
}

std::optional<size_t> SinkRuntimeState::trackedTypeIndex(Proto::ExtendedMessageType type) {
    switch (type) {
        case Proto::ExtendedMessageType::EPR_Source_Capabilities:
            return static_cast<size_t>(TrackedExtendedType::EPRSourceCapabilities);
        case Proto::ExtendedMessageType::Extended_Control:
            return static_cast<size_t>(TrackedExtendedType::ExtendedControl);
        case Proto::ExtendedMessageType::Get_Manufacturer_Info:
            return static_cast<size_t>(TrackedExtendedType::GetManufacturerInfo);
        case Proto::ExtendedMessageType::Manufacturer_Info:
            return static_cast<size_t>(TrackedExtendedType::ManufacturerInfo);
        case Proto::ExtendedMessageType::PPS_Status:
            return static_cast<size_t>(TrackedExtendedType::PPSStatus);
        default:
            return std::nullopt;
    }
}
