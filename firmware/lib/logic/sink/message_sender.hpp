/**
 * @file message_sender.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 * 
 * The SinkMessageSender handles sending messages from the Sink
 * logic to the PHY layer via the BMC encoder, including managing
 * GoodCRC responses.
 * 
 * If a GoodCRC response is not received within LOGIC_SINK_GOODCRC_TIMEOUT_US
 * microseconds, the state handler will retry sending the message
 * up to LOGIC_SINK_GOODCRC_RETRIES times before giving up and
 * notifying the Sink logic of a timeout.
 * 
 * State changes are communicated back to the Sink logic
 * via a callback mechanism. This can be used to advance the
 * state machine when a GoodCRC is received or to handle
 * timeouts (for example, by hard resetting the connection).
 *
 * This class is transport-focused and policy-agnostic: it does not decide
 * what message to send next, only how to send and track delivery confirmation.
 * Policy handlers and `SinkContext` use it to enforce GoodCRC reliability.
 * 
 */

#pragma once

#include <cstdint>
#include <functional>
#include <optional>
#include <utility>

#include "../../phy/bmc_encoder.hpp"
#include "sink_alarm_service.hpp"


namespace T76::DRPD::Logic {

    /**
     * @brief States for SinkMessageSender callbacks
     */
    enum class SinkMessageSenderState {
        GoodCRCReceived,    ///< GoodCRC response received for the pending message
        GoodCRCTimeout      ///< GoodCRC not received within retry window
    };
    
    class SinkMessageSender {
    public:
        using StateChangeCallback = std::function<void(SinkMessageSenderState)>;

        /** 
         * @brief Construct a new Sink Message Sender object
         * 
         * @param bmcEncoder Reference to the BMC encoder to use for sending messages
         * @param stateChangeCallback Callback function to notify on state changes
         */
        SinkMessageSender(PHY::BMCEncoder& bmcEncoder,
                          SinkAlarmService& alarmService,
                          StateChangeCallback stateChangeCallback);

        ~SinkMessageSender() = default;

        /** 
         * @brief Send a message and await GoodCRC response
         * 
         * @param message The BMC encoded message to send
         * 
         * This function sends the given BMC encoded message using
         * the BMC encoder and sets up to await a GoodCRC response
         * for a maximum of LOGIC_SINK_GOODCRC_TIMEOUT_US microseconds.
         */
        void sendMessageAndAwaitGoodCRC(const PHY::BMCEncodedMessage& message);

        /** 
         * @brief Send a message without awaiting GoodCRC response
         * 
         * @param message The BMC encoded message to send
         * 
         * This function sends the given BMC encoded message using
         * the BMC encoder without waiting for any response.
         */
        void sendMessage(const PHY::BMCEncodedMessage& message);

        /**
         * @brief Handle a received GoodCRC response for the pending message
         *
         * @param messageId The Message ID from the received GoodCRC
         */
        void handleGoodCRCReceived(uint32_t messageId);

        /** 
         * @brief Reset the GoodCRC timeout timer and retry count
         * 
         */
        void reset();

    protected:
        PHY::BMCEncoder& _bmcEncoder;                                               ///< Reference to the BMC encoder
        SinkAlarmService& _alarmService;                                            ///< Sink-owned timer service.
        uint32_t _nextMessageId = 0;                                                ///< Next Message ID to use for outgoing messages
        std::optional<PHY::BMCEncodedMessage> _pendingMessage = std::nullopt;       ///< The message currently awaiting GoodCRC response
        uint32_t _goodCRCRetryCount = 0;                                            ///< Current retry count for GoodCRC
        alarm_id_t _goodCRCTimeoutAlarmId = -1;                                     ///< Alarm ID for GoodCRC timeout timer
        StateChangeCallback _stateChangeCallback;                                   ///< Callback for state changes

        /** 
         * @brief Static callback for GoodCRC timeout
         * 
         * @param id The alarm ID
         * @param user_data Pointer to SinkMessageSender instance
         * @return 0 for one-shot timer (no reschedule)
         */
        static int64_t _onGoodCRCTimeout(alarm_id_t id, void *user_data);

        /** 
         * @brief Reset the GoodCRC timeout timer
         * 
         */
        void _resetGoodCRCTimer();

        /** 
         * @brief Cancel the GoodCRC timeout timer
         * 
         */
        void _cancelGoodCRCTimer();

        /** 
         * @brief Notify the Sink logic of a state change
         * 
         * @param state The new state
         */
        void _notifyStateChange(SinkMessageSenderState state);

    };

} // namespace T76::DRPD::Logic
