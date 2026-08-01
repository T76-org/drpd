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
#include <array>
#include <functional>
#include <optional>
#include <utility>

#include "../../phy/bmc_encoder.hpp"
#include "sink_alarm_service.hpp"
#include "message_transport_state.hpp"


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
        using StateChangeCallback = std::function<void(
            SinkMessageSenderState, Proto::SOP::SOPType)>;

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
         * @brief Send Hard Reset signaling and clear sender retry state.
         */
        void sendHardResetSignaling();

        /**
         * @brief Reset the transmitter MessageIDCounter and retry mechanism.
         */
        void resetMessageIdCounter();
        void resetTarget(Proto::SOP::SOPType sopType);

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
        void handleGoodCRCReceived(Proto::SOP::SOPType sopType, uint32_t messageId);

        /**
         * @brief Stop awaiting GoodCRC for the current message without resetting MessageIDCounter.
         */
        void abandonPendingMessage();

        /**
         * @brief Return whether a transmitted message is still pending GoodCRC.
         * @return True when an outgoing message is pending.
         */
        [[nodiscard]] bool hasPendingMessage() const;

        /** 
         * @brief Reset the GoodCRC timeout timer and retry count
         * 
         */
        void reset();

    protected:
        PHY::BMCEncoder& _bmcEncoder;                                               ///< Reference to the BMC encoder
        SinkAlarmService& _alarmService;                                            ///< Sink-owned timer service.
        struct TargetContext {
            std::optional<PHY::BMCEncodedMessage> pendingMessage = std::nullopt;
            alarm_id_t goodCRCTimeoutAlarmId = -1;
        };
        struct TimeoutCookie {
            SinkMessageSender *sender = nullptr;
            size_t targetIndex = 0;
        };
        std::array<TargetContext, 3> _targetContexts = {};
        SinkMessageTransportState _transportState;
        std::array<TimeoutCookie, 3> _timeoutCookies = {};
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
        void _resetGoodCRCTimer(size_t targetIndex);

        /** 
         * @brief Cancel the GoodCRC timeout timer
         * 
         */
        void _cancelGoodCRCTimer(size_t targetIndex);

        /** 
         * @brief Notify the Sink logic of a state change
         * 
         * @param state The new state
         */
        void _notifyStateChange(
            SinkMessageSenderState state, Proto::SOP::SOPType sopTarget);

    };

} // namespace T76::DRPD::Logic
