#pragma once

#include "../state_handler.hpp"

namespace T76::DRPD::Logic {

class StartupStateHandler : public SinkStateHandler {
public:
    void handleMessage(SinkContext&, const PHY::BMCDecodedMessage*) override {}
    void handleMessageSenderStateChange(SinkContext&, SinkMessageSenderState) override {}
    void run(SinkContext& context) override;
    void enter(SinkContext& context) override { _bindContext(context); }
    void reset(SinkContext&) override { _unbindContext(); }
};

} // namespace T76::DRPD::Logic
