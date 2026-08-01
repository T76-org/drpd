#pragma once
#include "../authentication_inquiry.hpp"

#include "../state_handler.hpp"

namespace T76::DRPD::Logic {

class InquiryStateHandler : public SinkStateHandler {
public:
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
    static int64_t _onResponseTimeout(alarm_id_t, void*);
    static int64_t _onRetryTimeout(alarm_id_t, void*);
    void _trySend(SinkContext&);
    void _finish(SinkContext&, SinkInquiryOutcome);
};

}
