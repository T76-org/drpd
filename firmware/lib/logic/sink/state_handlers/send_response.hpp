/**
 * @file send_response.hpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Sink state for one-shot responses generated from PE_SNK_Ready.
 */

#pragma once

#include <optional>

#include "../state_handler.hpp"

#include "../../../phy/bmc_encoded_message.hpp"

namespace T76::DRPD::Logic {

    /**
     * @brief Sends a prebuilt Ready-state response and waits for GoodCRC.
     *
     * USB-PD response states are only complete once the response has been
     * successfully transmitted. This handler keeps DRPD out of Ready while a
     * response such as Not_Supported, Sink_Capabilities, or Revision is still
     * awaiting its GoodCRC.
     */
    class SendResponseStateHandler : public SinkStateHandler {
    public:
        /**
         * @brief Store the response to send when the state is entered.
         * @param message Encoded PD response message.
         * @param returnState State to enter after GoodCRC.
         */
        void prepareResponse(
            const PHY::BMCEncodedMessage& message,
            SinkState returnState = SinkState::PE_SNK_Ready);

        /**
         * @brief Unexpected messages while awaiting GoodCRC are protocol errors.
         */
        void handleMessage(
            SinkContext& context,
            const T76::DRPD::PHY::BMCDecodedMessage *message) override;

        /**
         * @brief Return to Ready after GoodCRC or Soft_Reset after timeout.
         */
        void handleMessageSenderStateChange(
            SinkContext& context,
            SinkMessageSenderState state) override;

        /**
         * @brief Send the prepared response.
         */
        void enter(SinkContext& context) override;

        /**
         * @brief Clear pending response state.
         */
        void reset(SinkContext& context) override;

    protected:
        std::optional<PHY::BMCEncodedMessage> _pendingResponse; ///< Response to send on entry.
        SinkState _returnState = SinkState::PE_SNK_Ready;       ///< State after GoodCRC.
    };

} // namespace T76::DRPD::Logic
