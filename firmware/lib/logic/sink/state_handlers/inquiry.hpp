/**
 * @file inquiry.hpp
 * @brief Runs one host-requested Sink inquiry as an atomic USB-PD AMS.
 *
 * The handler owns request transmission, response correlation, bounded timeout
 * handling, and return to the stable SPR or EPR policy state that dispatched
 * the inquiry. Callers must prepare that return state before entering it.
 */

#pragma once
#include "../authentication_inquiry.hpp"

#include "../state_handler.hpp"

namespace T76::DRPD::Logic {

class InquiryStateHandler : public SinkStateHandler {
public:
    /**
     * @brief Select the stable policy state restored after the inquiry.
     * @param state Dispatching stable state; unsupported values use SPR Ready.
     */
    void prepareReturnState(SinkState state);
    void handleMessage(SinkContext&, const PHY::BMCDecodedMessage*) override;
    void handleMessageSenderStateChange(SinkContext&, SinkMessageSenderState) override;
    void handleTimeoutEvent(SinkContext&, SinkTimeoutEventType) override;
    void enter(SinkContext&) override;
    void reset(SinkContext&) override;

private:
    alarm_id_t _responseTimeoutAlarmId = -1;
    alarm_id_t _retryAlarmId = -1;
    uint32_t _requestId = 0;
    AuthenticationChunkRequestState _authenticationChunkState;
    bool _sent = false;
    SinkState _returnState = SinkState::PE_SNK_Ready;
    static int64_t _onResponseTimeout(alarm_id_t, void*);
    static int64_t _onRetryTimeout(alarm_id_t, void*);
    void _trySend(SinkContext&);
    void _finish(SinkContext&, SinkInquiryOutcome);
    /**
     * @brief Restore the stable SPR or EPR state selected before dispatch.
     * @param context Shared Sink policy context.
     */
    void _returnToStableState(SinkContext&);
};

}
