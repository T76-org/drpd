/**
 * @file wait_for_capabilities.cpp
 * @copyright Copyright (c) 2026 MTA, Inc.
 * 
 */

#include "wait_for_capabilities.hpp"

#include "../sink.hpp"


using namespace T76::DRPD::Logic;


int64_t WaitForCapabilitiesStateHandler::_onCapabilitiesTimeoutCallback(
    alarm_id_t id,
    void *user_data) {
    WaitForCapabilitiesStateHandler *handler =
        static_cast<WaitForCapabilitiesStateHandler *>(user_data);
    handler->_capabilitiesTimeoutAlarmId = -1;
    handler->_onCapabilitiesTimeout();
    return 0;  // One-shot timer
}

void WaitForCapabilitiesStateHandler::_onCapabilitiesTimeout() {
    if (_context != nullptr) {
        _context->performReset(SinkResetType::HardReset);
    }
}


void WaitForCapabilitiesStateHandler::handleMessage(
    SinkContext& context,
    const PHY::BMCDecodedMessage *message) {
    Proto::PDHeader decodedHeader = message->decodedHeader();

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Control) {
        const auto controlMessageType = decodedHeader.controlMessageType();
        if (controlMessageType.has_value() &&
            (controlMessageType.value() == Proto::ControlMessageType::Accept ||
             controlMessageType.value() == Proto::ControlMessageType::GoodCRC)) {
            // Soft_Reset recovery legitimately yields Accept/GoodCRC before
            // Source_Capabilities. Ignore them and continue waiting.
            return;
        }
    }

    // Here, we only care about receiving a Source_Capabilities message

    if (decodedHeader.messageClass() == Proto::PDHeader::MessageClass::Data) {
        auto dataMessageType = decodedHeader.dataMessageType();

        if (dataMessageType.has_value() && dataMessageType.value() == Proto::DataMessageType::Source_Capabilities) {
            // Cancel the capabilities timeout timer
            if (_capabilitiesTimeoutAlarmId != -1) {
                cancel_alarm(_capabilitiesTimeoutAlarmId);
                _capabilitiesTimeoutAlarmId = -1;
            }

            context.setSourceCapabilities(Proto::SourceCapabilities(
                message->rawBody(), decodedHeader.numDataObjects()));
                            
            context.requestPDO(0, 0.0f, 0.0f);  // Request first PDO with max current

            return;
        }
    }

    // We received an unexpected message - issue a soft reset
    
    context.performReset(SinkResetType::SoftReset);
}

void WaitForCapabilitiesStateHandler::handleMessageSenderStateChange(
    SinkContext& context,
    SinkMessageSenderState state) {
    (void)context;
    (void)state;
    // No specific handling needed in Wait_for_Capabilities state
}


void WaitForCapabilitiesStateHandler::enter(SinkContext& context) {
    _bindContext(context);
    // Start the capabilities timeout timer
    _capabilitiesTimeoutAlarmId = add_alarm_in_us(
        LOGIC_SINK_WAIT_FOR_CAPABILITIES_TIMEOUT_US,
        _onCapabilitiesTimeoutCallback,
        this,
        true  // One-shot timer
    );
}

void WaitForCapabilitiesStateHandler::reset(SinkContext& context) {
    (void)context;
    // Cancel the capabilities timeout timer
    if (_capabilitiesTimeoutAlarmId != -1) {
        cancel_alarm(_capabilitiesTimeoutAlarmId);
        _capabilitiesTimeoutAlarmId = -1;
    }
    _unbindContext();
}
