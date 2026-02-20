/**
 * @file select_capability.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 * 
 * The SelectCapabilityStateHandler manages the behaviour of the Sink
 * in the PE_SNK_Select_Capability state.
 * 
 * The Sink class's requestPDO() method invokes this state handler's 
 * requestPDO() method to send a Request message to the Source for a 
 * specific PDO.
 *
 * This handler is responsible for request construction/validation across
 * Fixed/Variable/Battery/Augmented PDO types and for handling Accept/Reject/
 * Wait control responses that advance or roll back policy progression.
 * 
 */

#pragma once

#include <optional>

#include "../state_handler.hpp"

#include "../../../proto/pd_messages/source_capabilities.hpp"
#include "../../../proto/pd_messages/request.hpp"


namespace T76::DRPD::Logic {

    /**
     * @class SelectCapabilityStateHandler
     * @brief State handler for the PE_SNK_Select_Capability state of the Sink
     * 
     * This state handler manages the behaviour of the Sink when
     * it is in the PE_SNK_Select_Capability state.
     */
    class SelectCapabilityStateHandler : public SinkStateHandler {
    public:
        /**
         * @brief Construct a Select Capability state handler.
         */
        SelectCapabilityStateHandler() = default;

        /** 
         * @brief Destroy the Select Capability State Handler object
         */
        ~SelectCapabilityStateHandler() override = default;

        /**
         * @brief Handle incoming message in Select_Capability state.
         * @param context Shared sink context.
         * @param message Decoded incoming message.
         */
        void handleMessage(SinkContext& context, const T76::DRPD::PHY::BMCDecodedMessage *message) override;

        /**
         * @brief Handle sender state changes in Select_Capability state.
         * @param context Shared sink context.
         * @param state Sender state.
         */
        void handleMessageSenderStateChange(SinkContext& context, SinkMessageSenderState state) override;

        /**
         * @brief Handle timeout events in Select_Capability state.
         * @param context Shared sink context.
         * @param eventType Timeout event type.
         */
        void handleTimeoutEvent(SinkContext& context, SinkTimeoutEventType eventType) override;

        /**
         * @brief Enter Select_Capability state.
         * @param context Shared sink context.
         */
        void enter(SinkContext& context) override;

        /**
         * @brief Reset Select_Capability timers.
         * @param context Shared sink context.
         */
        void reset(SinkContext& context) override;

        /**
         * @brief Validate and request a PDO from the active source capability set.
         * @param context Shared sink context.
         * @param pdoIndex Zero-based PDO index.
         * @param voltageMV Requested voltage in millivolts.
         * @param currentMA Requested current in milliamps.
         * @return True if request message was dispatched; otherwise false.
         */
        bool requestPDO(
            SinkContext& context,
            size_t pdoIndex,
            uint32_t voltageMV,
            uint32_t currentMA);

    protected:
        /**
         * @brief Send the Request message after validation
         * 
         * @param pdoIndex Index of the PDO in the source capabilities
         * @param pdoVariant The PDO variant being requested
         * @param voltageMV Requested voltage in millivolts
         * @param currentMA Requested current in milliamps
         * @param request The Request message to send
         * @return true if the Request message was sent successfully, false otherwise
         */
        bool _requestPDO(size_t pdoIndex,
                         const Proto::PDOVariant& pdoVariant,
                         uint32_t voltageMV,
                         uint32_t currentMA,
                         Proto::Request& request);

        /**
         * @brief Send the Fixed PDO Request message after validation
         * 
         * @param pdoIndex Index of the PDO in the source capabilities
         * @param pdoVariant The PDO variant being requested
         * @param currentMA Requested current in milliamps
         * @return true if the Request message was sent successfully, false otherwise
         */
        bool _requestFixedPDO(size_t pdoIndex, const Proto::PDOVariant& pdoVariant, uint32_t currentMA);

        /**
         * @brief Send a Variable PDO Request message after validation
         * 
         * @param pdoIndex Index of the PDO in the source capabilities
         * @param pdoVariant The PDO variant being requested
         * @param currentMA Requested current in milliamps
         * @return true if the Request message was sent successfully, false otherwise
         */
        bool _requestVariablePDO(size_t pdoIndex, const Proto::PDOVariant& pdoVariant, uint32_t currentMA);

        /**
         * @brief Send a Battery PDO Request message after validation
         * 
         * @param pdoIndex Index of the PDO in the source capabilities
         * @param pdoVariant The PDO variant being requested
         * @param voltageMV Requested voltage in millivolts
         * @param currentMA Requested current in milliamps
         * @return true if the Request message was sent successfully, false otherwise
         */
        bool _requestBatteryPDO(size_t pdoIndex, const Proto::PDOVariant& pdoVariant, uint32_t voltageMV, uint32_t currentMA);

        /**
         * @brief Send an Augmented (PPS) PDO Request message after validation
         * 
         * @param pdoIndex Index of the PDO in the source capabilities
         * @param pdoVariant The PDO variant being requested
         * @param voltageMV Requested voltage in millivolts
         * @param currentMA Requested current in milliamps
         * @return true if the Request message was sent successfully, false otherwise
         */
        bool _requestAugmentedPDO(size_t pdoIndex, const Proto::PDOVariant& pdoVariant, uint32_t voltageMV, uint32_t currentMA);

        alarm_id_t _responseTimeoutAlarmId = -1;  ///< Alarm ID for response timeout timer

        /**
         * @brief Called when the response timeout expires
         */ 
        void _onResponseTimeout();

        /**
         * @brief Static callback for response timeout
         *
         * @param id The alarm ID
         * @param user_data Pointer to SelectCapabilityStateHandler instance
         * @return 0 for one-shot timer (no reschedule)
         */
        static int64_t _onResponseTimeoutCallback(alarm_id_t id, void *user_data);
    };

} // namespace T76::DRPD::Logic
