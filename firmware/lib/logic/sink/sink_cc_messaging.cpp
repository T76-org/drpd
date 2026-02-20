/**
 * @file sink_cc_messaging.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "sink.hpp"

#include <algorithm>


using namespace T76::DRPD::Logic;


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
            reset();
            return;
        }
    }

    const uint8_t receivedMessageId = static_cast<uint8_t>(decodedHeader.messageId() & 0x7);

    if (_runtimeState._hasLastReceivedMessageId && receivedMessageId == _runtimeState._lastReceivedMessageId) {
        // Retransmission due to missing GoodCRC. Acknowledge but do not process twice.
        _bmcEncoder.sendGoodCRCForDecodedMessage(*message);
        return;
    }

    _runtimeState._hasLastReceivedMessageId = true;
    _runtimeState._lastReceivedMessageId = receivedMessageId;
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

    const auto extendedType = maybeExtendedType.value();
    const auto typeIndex = SinkRuntimeState::trackedTypeIndex(extendedType);
    if (!typeIndex.has_value()) {
        return ExtendedFragmentResult::UnsupportedType;
    }

    const auto rawBody = message->rawBody();
    if (rawBody.size() < 2) {
        return ExtendedFragmentResult::Malformed;
    }

    const uint16_t rawExtHeader = static_cast<uint16_t>(rawBody[0]) |
        (static_cast<uint16_t>(rawBody[1]) << 8);

    const Proto::PDExtendedHeader extHeader(rawExtHeader);
    const size_t fragmentPayloadBytes = rawBody.size() - 2;

    if (extHeader.dataSizeBytes() == 0 || extHeader.requestChunk()) {
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
        if (fragmentPayloadBytes < extHeader.dataSizeBytes()) {
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

    for (size_t i = 0; i < bytesToCopy; ++i) {
        reassembly.payload.bytes[reassembly.payload.length + i] = rawBody[2 + i];
    }
    reassembly.payload.length += bytesToCopy;

    reassembly.contiguousPayloadBytes += bytesToCopy;

    if (reassembly.contiguousPayloadBytes < reassembly.expectedPayloadBytes) {
        const uint8_t nextChunkNumber = static_cast<uint8_t>(extHeader.chunkNumber() + 1);
        if (nextChunkNumber > 0x0F) {
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
        _runtimeState._state == SinkState::PE_SNK_EPR_Keepalive &&
        _runtimeState._currentStateHandler) {
        _runtimeState._currentStateHandler->handleMessageSenderStateChange(_context, state);
        return;
    }

    if (state == SinkMessageSenderState::GoodCRCTimeout) {
        reset(SinkResetType::SoftReset);
    }
}
