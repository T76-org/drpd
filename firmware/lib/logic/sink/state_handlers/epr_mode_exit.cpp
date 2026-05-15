/**
 * @file epr_mode_exit.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 */

#include "epr_mode_exit.hpp"

#include "../sink.hpp"


using namespace T76::DRPD::Logic;


void EPRModeExitStateHandler::_completeExitToWaitForCapabilities(SinkContext& context) {
    context.setEPRModeActive(false);
    context.clearEPRSourceCapabilities();
    // Wait_for_Capabilities owns tTypeCSinkWaitCap and Hard Resets if SPR Source_Capabilities do not arrive.
    context.transitionTo(SinkState::PE_SNK_Wait_for_Capabilities);
}

void EPRModeExitStateHandler::_completeExitWithSourceCapabilities(
    SinkContext& context,
    const T76::DRPD::PHY::BMCDecodedMessage *message) {
    const auto decodedHeader = message->decodedHeader();

    context.abandonPendingMessage();
    context.setEPRModeActive(false);
    context.clearEPRSourceCapabilities();
    context.setSourceCapabilities(Proto::SourceCapabilities(
        message->rawBody(), decodedHeader.numDataObjects()));
    // Enter Wait_for_Capabilities so SPR renegotiation uses the same timer/cancel path as a delayed response.
    context.transitionTo(SinkState::PE_SNK_Wait_for_Capabilities);
    (void)context.requestPDO(0, 0, 0);
}

void EPRModeExitStateHandler::handleMessage(
    SinkContext& context,
    const T76::DRPD::PHY::BMCDecodedMessage *message) {
    const auto decodedHeader = message->decodedHeader();

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Data) {
        const auto dataType = decodedHeader.dataMessageType();

        if (dataType.has_value() &&
            dataType.value() == Proto::DataMessageType::Source_Capabilities) {
            _completeExitWithSourceCapabilities(context, message);
            return;
        }

        if (dataType.has_value() && dataType.value() == Proto::DataMessageType::EPR_Mode) {
            if (message->rawBody().size() < 4) {
                context.performReset(SinkResetType::SoftReset);
                return;
            }

            const auto body = message->rawBody();
            const uint32_t rawEprMode = static_cast<uint32_t>(body[0]) |
                (static_cast<uint32_t>(body[1]) << 8) |
                (static_cast<uint32_t>(body[2]) << 16) |
                (static_cast<uint32_t>(body[3]) << 24);
            const Proto::EPRMode eprMode(rawEprMode);

            if (!eprMode.isMessageInvalid() &&
                eprMode.action() == Proto::EPRMode::Action::Exit) {
                context.abandonPendingMessage();
                _completeExitToWaitForCapabilities(context);
                return;
            }
        }
    }

    context.performReset(SinkResetType::SoftReset);
}

void EPRModeExitStateHandler::handleMessageSenderStateChange(
    SinkContext& context,
    SinkMessageSenderState state) {
    if (state == SinkMessageSenderState::GoodCRCReceived) {
        _completeExitToWaitForCapabilities(context);
        return;
    }

    if (state == SinkMessageSenderState::GoodCRCTimeout) {
        context.performReset(SinkResetType::SoftReset);
    }
}

void EPRModeExitStateHandler::enter(SinkContext& context) {
    _bindContext(context);

    if (!context.eprExitContractReady()) {
        context.performReset(SinkResetType::HardReset);
        return;
    }

    context.sendEPRMode(Proto::EPRMode::Action::Exit, 0);
}

void EPRModeExitStateHandler::reset(SinkContext& context) {
    (void)context;
    _unbindContext();
}
