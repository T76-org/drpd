/**
 * @file message_sender.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 * 
 */

#include "message_sender.hpp"

#include <algorithm>


using namespace T76::DRPD::Logic;

namespace {
    std::optional<size_t> messageIdIndex(Proto::SOP::SOPType target) {
        switch (target) {
            case Proto::SOP::SOPType::SOP: return 0;
            case Proto::SOP::SOPType::SOPPrime: return 1;
            case Proto::SOP::SOPType::SOPDoublePrime: return 2;
            default: return std::nullopt;
        }
    }
}


SinkMessageSender::SinkMessageSender(PHY::BMCEncoder& bmcEncoder,
                                     SinkAlarmService& alarmService,
                                     StateChangeCallback stateChangeCallback)
    : _bmcEncoder(bmcEncoder),
      _alarmService(alarmService),
      _stateChangeCallback(std::move(stateChangeCallback)) {
    for (size_t i = 0; i < _timeoutCookies.size(); ++i) {
        _timeoutCookies[i] = TimeoutCookie{this, i};
    }
}

void SinkMessageSender::sendMessage(const PHY::BMCEncodedMessage& message) {
    const auto index = messageIdIndex(message.sopType());
    if (!index.has_value()) return;
    // Set the Message ID on the outgoing message (USB-PD 3.2 spec: 3-bit counter)
    auto &context = _targetContexts[index.value()];
    context.pendingMessage = message;
    context.pendingMessage.value().header().messageId(_transportState.begin(index.value()));

    _bmcEncoder.encodeAndSendMessage(*context.pendingMessage);
}

void SinkMessageSender::sendMessageAndAwaitGoodCRC(const PHY::BMCEncodedMessage& message) {
    // Cancel any existing GoodCRC timeout timer
    const auto index = messageIdIndex(message.sopType());
    if (!index.has_value()) return;
    auto &context = _targetContexts[index.value()];
    _cancelGoodCRCTimer(index.value());

    // Reset retry count

    // Schedule the message for transmission
    sendMessage(message);

    // Set up a one-shot timer for the GoodCRC timeout
    _resetGoodCRCTimer(index.value());
}

void SinkMessageSender::sendHardResetSignaling() {
    resetTarget(Proto::SOP::SOPType::SOP);
    _bmcEncoder.sendHardResetSignaling();
}

void SinkMessageSender::resetMessageIdCounter() {
    for (size_t i = 0; i < _targetContexts.size(); ++i) {
        _cancelGoodCRCTimer(i);
        _targetContexts[i] = TargetContext{};
    }
    _transportState.reset();
}

void SinkMessageSender::resetTarget(Proto::SOP::SOPType sopType) {
    const auto index = messageIdIndex(sopType);
    if (!index.has_value()) return;
    _cancelGoodCRCTimer(index.value());
    _targetContexts[index.value()] = TargetContext{};
    _transportState.reset(index.value());
}

void SinkMessageSender::handleGoodCRCReceived(
    Proto::SOP::SOPType sopType, uint32_t messageId) {
    const auto index = messageIdIndex(sopType);
    if (!index.has_value()) return;
    auto &context = _targetContexts[index.value()];
    if (!context.pendingMessage.has_value()) {
        return;
    }

    if (!_transportState.acknowledge(index.value(), static_cast<uint8_t>(messageId))) {
        return;
    }

    _cancelGoodCRCTimer(index.value());
    context.pendingMessage.reset();
    _notifyStateChange(SinkMessageSenderState::GoodCRCReceived, sopType);
}

void SinkMessageSender::abandonPendingMessage() {
    for (size_t i = 0; i < _targetContexts.size(); ++i) {
        _cancelGoodCRCTimer(i);
        _targetContexts[i].pendingMessage.reset();
        _transportState.abandon(i);
    }
}

bool SinkMessageSender::hasPendingMessage() const {
    return std::any_of(_targetContexts.begin(), _targetContexts.end(),
        [](const auto& context) { return context.pendingMessage.has_value(); });
}

void SinkMessageSender::reset() {
    // Cancel any existing GoodCRC timeout timer
    for (size_t i = 0; i < _targetContexts.size(); ++i) _cancelGoodCRCTimer(i);

    resetMessageIdCounter();
}

int64_t SinkMessageSender::_onGoodCRCTimeout(alarm_id_t id, void *user_data) {
    auto *cookie = static_cast<TimeoutCookie*>(user_data);
    SinkMessageSender *sender = cookie->sender;
    auto &context = sender->_targetContexts[cookie->targetIndex];
    if (!context.pendingMessage.has_value()) return 0;

    // Increment retry count
    const uint8_t retryCount = sender->_transportState.retry(cookie->targetIndex);

    // Check if we've exceeded the maximum retry count
    if (retryCount >= LOGIC_SINK_GOODCRC_RETRIES) {
        context.pendingMessage.reset();
        sender->_transportState.abandon(cookie->targetIndex);
        context.goodCRCTimeoutAlarmId = -1;
        const auto target = cookie->targetIndex == 1 ? Proto::SOP::SOPType::SOPPrime :
            cookie->targetIndex == 2 ? Proto::SOP::SOPType::SOPDoublePrime :
            Proto::SOP::SOPType::SOP;
        sender->_notifyStateChange(SinkMessageSenderState::GoodCRCTimeout, target);
        return 0; // Don't reschedule
    }

    // Resend the pending message
    if (context.pendingMessage.has_value()) {
        sender->_bmcEncoder.encodeAndSendMessage(*context.pendingMessage);
        sender->_resetGoodCRCTimer(cookie->targetIndex);
    }

    return 0; // Don't reschedule (one-shot timer)
}

void SinkMessageSender::_resetGoodCRCTimer(size_t targetIndex) {
    // Cancel any existing timer
    _cancelGoodCRCTimer(targetIndex);
    auto &context = _targetContexts[targetIndex];

    // Set up a one-shot timer for the GoodCRC timeout
    context.goodCRCTimeoutAlarmId = _alarmService.addAlarmInUs(
        LOGIC_SINK_GOODCRC_TIMEOUT_US,
        _onGoodCRCTimeout,
        &_timeoutCookies[targetIndex],
        true  // One-shot timer
    );
}

void SinkMessageSender::_cancelGoodCRCTimer(size_t targetIndex) {
    auto &context = _targetContexts[targetIndex];
    if (context.goodCRCTimeoutAlarmId != -1) {
        _alarmService.cancelAlarm(context.goodCRCTimeoutAlarmId);
        context.goodCRCTimeoutAlarmId = -1;
    }
}

void SinkMessageSender::_notifyStateChange(
    SinkMessageSenderState state, Proto::SOP::SOPType sopTarget) {
    if (_stateChangeCallback) {
        _stateChangeCallback(state, sopTarget);
    }
}
