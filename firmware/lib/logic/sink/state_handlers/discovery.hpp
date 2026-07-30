#pragma once

#include <cstdint>

#include "../state_handler.hpp"

namespace T76::DRPD::Logic {

class DiscoveryStateHandler : public SinkStateHandler {
public:
    void handleMessage(SinkContext&, const PHY::BMCDecodedMessage*) override {}
    void handleMessageSenderStateChange(SinkContext&, SinkMessageSenderState) override {}
    void run(SinkContext& context) override;
    void enter(SinkContext& context) override;
    void reset(SinkContext&) override;

private:
    uint64_t _thresholdSinceUs = 0;
    uint64_t _lastSampleTimestampUs = 0;
};

} // namespace T76::DRPD::Logic
