/**
 * @file message_sender.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 * 
 */

#include "message_sender.hpp"


using namespace T76::DRPD::Logic;


SinkMessageSender::SinkMessageSender(PHY::BMCEncoder& bmcEncoder,
                                     SinkAlarmService& alarmService,
                                     StateChangeCallback stateChangeCallback)
    : _bmcEncoder(bmcEncoder),
      _alarmService(alarmService),
      _stateChangeCallback(std::move(stateChangeCallback)) {}

void SinkMessageSender::sendMessage(const PHY::BMCEncodedMessage& message) {
    // Set the Message ID on the outgoing message (USB-PD 3.2 spec: 3-bit counter)
    _pendingMessage = message;
    _pendingMessage.value().header().messageId(_nextMessageId);

    // Increment Message ID for next message (wrap around at 8 for 3-bit counter)
    _nextMessageId = (_nextMessageId + 1) & 0x7;

    _bmcEncoder.encodeAndSendMessage(*_pendingMessage);
}

void SinkMessageSender::sendMessageAndAwaitGoodCRC(const PHY::BMCEncodedMessage& message) {
    // Cancel any existing GoodCRC timeout timer
    _cancelGoodCRCTimer();

    // Reset retry count
    _goodCRCRetryCount = 0;

    // Schedule the message for transmission
    sendMessage(message);

    // Set up a one-shot timer for the GoodCRC timeout
    _resetGoodCRCTimer();
}

void SinkMessageSender::handleGoodCRCReceived(uint32_t messageId) {
    if (!_pendingMessage.has_value()) {
        return;
    }

    if (_pendingMessage->header().messageId() != messageId) {
        return;
    }

    _cancelGoodCRCTimer();
    _pendingMessage.reset();
    _goodCRCRetryCount = 0;
    _notifyStateChange(SinkMessageSenderState::GoodCRCReceived);
}

void SinkMessageSender::reset() {
    // Cancel any existing GoodCRC timeout timer
    _cancelGoodCRCTimer();

    // Reset message ID counter
    _nextMessageId = 0;

    // Reset retry count
    _goodCRCRetryCount = 0;

    // Clear pending message
    _pendingMessage.reset();
}

int64_t SinkMessageSender::_onGoodCRCTimeout(alarm_id_t id, void *user_data) {
    SinkMessageSender *sender = static_cast<SinkMessageSender*>(user_data);

    // Increment retry count
    sender->_goodCRCRetryCount++;

    // Check if we've exceeded the maximum retry count
    if (sender->_goodCRCRetryCount >= LOGIC_SINK_GOODCRC_RETRIES) {
        sender->_pendingMessage.reset();
        sender->_goodCRCTimeoutAlarmId = -1;
        sender->_notifyStateChange(SinkMessageSenderState::GoodCRCTimeout);
        return 0; // Don't reschedule
    }

    // Resend the pending message
    if (sender->_pendingMessage.has_value()) {
        sender->_bmcEncoder.encodeAndSendMessage(*sender->_pendingMessage);
        sender->_resetGoodCRCTimer();
    }

    return 0; // Don't reschedule (one-shot timer)
}

void SinkMessageSender::_resetGoodCRCTimer() {
    // Cancel any existing timer
    _cancelGoodCRCTimer();

    // Set up a one-shot timer for the GoodCRC timeout
    _goodCRCTimeoutAlarmId = _alarmService.addAlarmInUs(
        LOGIC_SINK_GOODCRC_TIMEOUT_US,
        _onGoodCRCTimeout,
        this,
        true  // One-shot timer
    );
}

void SinkMessageSender::_cancelGoodCRCTimer() {
    if (_goodCRCTimeoutAlarmId != -1) {
        _alarmService.cancelAlarm(_goodCRCTimeoutAlarmId);
        _goodCRCTimeoutAlarmId = -1;
    }
}

void SinkMessageSender::_notifyStateChange(SinkMessageSenderState state) {
    if (_stateChangeCallback) {
        _stateChangeCallback(state);
    }
}
