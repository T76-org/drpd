/**
 * @file sink_cc_messaging.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "sink.hpp"

#include <algorithm>


using namespace T76::DRPD::Logic;


namespace {
    constexpr uint8_t kMaxExtendedChunkNumber = 9;

    bool allZero(std::span<const uint8_t> bytes) {
        for (const uint8_t byte : bytes) {
            if (byte != 0) {
                return false;
            }
        }

        return true;
    }
}


void Sink::_onMessageReceived(const T76::DRPD::PHY::BMCDecodedMessage *message) {
    if (!_enabled.load()) {
        return;
    }

    if (message->decodedSOP().type() == Proto::SOP::SOPType::HardReset) {
        reset();
        return;
    }

    if (message->decodedSOP().type() != Proto::SOP::SOPType::SOP) {
        return;
    }

    const Proto::PDHeader decodedHeader = message->decodedHeader();

    const auto powerRole = decodedHeader.portPowerRole();
    if (!powerRole.has_value() || powerRole.value() != Proto::PDHeader::PortPowerRole::Source) {
        return;
    }

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Control) {
        const auto controlMessageType = decodedHeader.controlMessageType();

        if (controlMessageType.has_value() &&
            controlMessageType.value() == Proto::ControlMessageType::GoodCRC) {
            _messageSender.handleGoodCRCReceived(decodedHeader.messageId());
            return;
        }
    }

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Control) {
        const auto controlMessageType = decodedHeader.controlMessageType();

        if (controlMessageType.has_value() &&
            controlMessageType.value() == Proto::ControlMessageType::Soft_Reset) {
            _bmcEncoder.sendGoodCRCForDecodedMessage(*message);
            _context.handleReceivedSoftReset();
            return;
        }
    }

    const uint8_t receivedMessageId = static_cast<uint8_t>(decodedHeader.messageId() & 0x7);

    if (_runtimeState.isDuplicateReceivedMessageId(receivedMessageId)) {
        // Retransmission due to missing GoodCRC. Acknowledge but do not process twice.
        _bmcEncoder.sendGoodCRCForDecodedMessage(*message);
        return;
    }

    _runtimeState.storeReceivedMessageId(receivedMessageId);
    _bmcEncoder.sendGoodCRCForDecodedMessage(*message);

    const T76::DRPD::PHY::BMCDecodedMessage* messagePtr = message;

    // Never block the decoder callback path; drop if the queue is full.
    (void)queue_try_add(&_messageQueue, &messagePtr);
}

Sink::ExtendedFragmentResult Sink::_handleExtendedMessageFragment(
    const T76::DRPD::PHY::BMCDecodedMessage *message,
    Proto::ExtendedMessageType &completedType) {

    const auto decodedHeader = message->decodedHeader();
    const auto maybeExtendedType = decodedHeader.extendedMessageType();

    if (!maybeExtendedType.has_value()) {
        return ExtendedFragmentResult::Malformed;
    }

    const auto rawBody = message->rawBody();
    if (rawBody.size() < 2) {
        return ExtendedFragmentResult::Malformed;
    }

    const uint16_t rawExtHeader = static_cast<uint16_t>(rawBody[0]) |
        (static_cast<uint16_t>(rawBody[1]) << 8);

    const Proto::PDExtendedHeader extHeader(rawExtHeader);
    const size_t fragmentPayloadBytes = rawBody.size() - 2;
    const auto extendedType = maybeExtendedType.value();
    const auto typeIndex = SinkRuntimeState::trackedTypeIndex(extendedType);
    const size_t declaredPayloadBytes = decodedHeader.numDataObjects() * 4;

    if (extHeader.chunked() && extHeader.chunkNumber() > kMaxExtendedChunkNumber) {
        return ExtendedFragmentResult::Malformed;
    }

    if (extHeader.chunked() && rawBody.size() != declaredPayloadBytes) {
        return ExtendedFragmentResult::Malformed;
    }

    if (extHeader.requestChunk() &&
        (!extHeader.chunked() || extHeader.dataSizeBytes() != 0)) {
        return ExtendedFragmentResult::Malformed;
    }

    if (extHeader.requestChunk() &&
        (rawBody.size() != 4 || !allZero(rawBody.subspan(2)))) {
        return ExtendedFragmentResult::Malformed;
    }

    if (extHeader.requestChunk() &&
        extendedType == Proto::ExtendedMessageType::EPR_Sink_Capabilities) {
        return ExtendedFragmentResult::Complete;
    }

    if (!typeIndex.has_value()) {
        return extHeader.chunked() && !extHeader.requestChunk()
            ? ExtendedFragmentResult::UnsupportedChunk
            : ExtendedFragmentResult::UnsupportedType;
    }

    if (extHeader.requestChunk()) {
        return ExtendedFragmentResult::UnsupportedType;
    }

    if (extHeader.dataSizeBytes() == 0) {
        return ExtendedFragmentResult::Malformed;
    }

    auto &reassembly = _runtimeState._extendedReassemblyStates[typeIndex.value()];
    const absolute_time_t now = get_absolute_time();

    if (reassembly.active) {
        const int64_t ageUs = absolute_time_diff_us(reassembly.lastChunkTimestamp, now);
        if (ageUs > LOGIC_SINK_EXTENDED_REASSEMBLY_TIMEOUT_US) {
            reassembly = SinkRuntimeState::ExtendedReassemblyState{};
        }
    }

    if (!extHeader.chunked()) {
        if (rawBody.size() != static_cast<size_t>(extHeader.dataSizeBytes()) + 2) {
            return ExtendedFragmentResult::Malformed;
        }

        if (extHeader.dataSizeBytes() > LOGIC_SINK_MAX_EXTENDED_PAYLOAD_BYTES) {
            return ExtendedFragmentResult::Malformed;
        }

        SinkRuntimeState::ExtendedPayloadBuffer payload;
        payload.length = extHeader.dataSizeBytes();
        for (size_t i = 0; i < payload.length; ++i) {
            payload.bytes[i] = rawBody[2 + i];
        }
        _runtimeState._completedExtendedPayloads[typeIndex.value()] = payload;
        reassembly = SinkRuntimeState::ExtendedReassemblyState{};
        completedType = extendedType;
        return ExtendedFragmentResult::Complete;
    }

    if (!reassembly.active) {
        if (extHeader.chunkNumber() != 0) {
            return ExtendedFragmentResult::Malformed;
        }

        reassembly.active = true;
        reassembly.expectedPayloadBytes = extHeader.dataSizeBytes();
        if (reassembly.expectedPayloadBytes > LOGIC_SINK_MAX_EXTENDED_PAYLOAD_BYTES) {
            reassembly = SinkRuntimeState::ExtendedReassemblyState{};
            return ExtendedFragmentResult::Malformed;
        }
        reassembly.contiguousPayloadBytes = 0;
        reassembly.lastAcceptedChunkNumber = 0;
        reassembly.payload.clear();
        reassembly.lastChunkTimestamp = now;
    } else {
        const uint8_t expectedChunkNumber =
            static_cast<uint8_t>(reassembly.lastAcceptedChunkNumber + 1);
        if (extHeader.chunkNumber() != expectedChunkNumber) {
            reassembly = SinkRuntimeState::ExtendedReassemblyState{};
            return ExtendedFragmentResult::Malformed;
        }

        if (extHeader.dataSizeBytes() != reassembly.expectedPayloadBytes) {
            reassembly = SinkRuntimeState::ExtendedReassemblyState{};
            return ExtendedFragmentResult::Malformed;
        }

        reassembly.lastAcceptedChunkNumber = extHeader.chunkNumber();
        reassembly.lastChunkTimestamp = now;
    }

    const size_t remainingBytes =
        reassembly.expectedPayloadBytes - reassembly.contiguousPayloadBytes;
    const size_t bytesToCopy = std::min(remainingBytes, fragmentPayloadBytes);
    const size_t paddingBytes = fragmentPayloadBytes - bytesToCopy;

    if (paddingBytes > 0 &&
        !allZero(rawBody.subspan(2 + bytesToCopy, paddingBytes))) {
        reassembly = SinkRuntimeState::ExtendedReassemblyState{};
        return ExtendedFragmentResult::Malformed;
    }

    for (size_t i = 0; i < bytesToCopy; ++i) {
        reassembly.payload.bytes[reassembly.payload.length + i] = rawBody[2 + i];
    }
    reassembly.payload.length += bytesToCopy;

    reassembly.contiguousPayloadBytes += bytesToCopy;

    if (reassembly.contiguousPayloadBytes < reassembly.expectedPayloadBytes) {
        const uint8_t nextChunkNumber = static_cast<uint8_t>(extHeader.chunkNumber() + 1);
        if (nextChunkNumber > kMaxExtendedChunkNumber) {
            reassembly = SinkRuntimeState::ExtendedReassemblyState{};
            return ExtendedFragmentResult::Malformed;
        }

        _sendExtendedChunkRequest(
            extendedType,
            reassembly.expectedPayloadBytes,
            nextChunkNumber
        );
        return ExtendedFragmentResult::InProgress;
    }

    _runtimeState._completedExtendedPayloads[typeIndex.value()] = reassembly.payload;
    reassembly = SinkRuntimeState::ExtendedReassemblyState{};
    completedType = extendedType;
    return ExtendedFragmentResult::Complete;
}

void Sink::_onMessageSenderStateChanged(SinkMessageSenderState state) {
    if (!_enabled.load()) {
        return;
    }

    if (state == SinkMessageSenderState::GoodCRCTimeout) {
        _enqueueTimeoutEvent(SinkTimeoutEvent{SinkTimeoutEventType::GoodCRCTimeout});
        return;
    }

    _handleMessageSenderStateChangedPolicyContext(state);
}

void Sink::_handleMessageSenderStateChangedPolicyContext(SinkMessageSenderState state) {
    // This method is only called from the core-1 policy loop.
    // Keep GoodCRCTimeout handling here so timer callbacks can enqueue a timeout event
    // without recursively calling back into the state machine from callback context.
    if (state == SinkMessageSenderState::GoodCRCReceived && _runtimeState._currentStateHandler) {
        _runtimeState._currentStateHandler->handleMessageSenderStateChange(_context, state);
        return;
    }

    if (state == SinkMessageSenderState::GoodCRCTimeout &&
        (_runtimeState._state == SinkState::PE_SNK_Send_EPR_Mode_Entry ||
         _runtimeState._state == SinkState::PE_SNK_EPR_Mode_Wait_For_Response ||
         _runtimeState._state == SinkState::PE_SNK_Send_EPR_Mode_Exit ||
         _runtimeState._state == SinkState::PE_SNK_Get_Source_Cap ||
         _runtimeState._state == SinkState::PE_SNK_EPR_Keepalive ||
         _runtimeState._state == SinkState::PE_SNK_Send_Response ||
         _runtimeState._state == SinkState::PE_SNK_Send_Soft_Reset ||
         _runtimeState._state == SinkState::PE_SNK_Get_PPS_Status) &&
        _runtimeState._currentStateHandler) {
        _runtimeState._currentStateHandler->handleMessageSenderStateChange(_context, state);
        return;
    }

    if (state == SinkMessageSenderState::GoodCRCTimeout) {
        reset(SinkResetType::SoftReset);
    }
}
