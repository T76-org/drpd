#pragma once

#include <cstdint>

#include "../state_handler.hpp"

namespace T76::DRPD::Logic {

class TransitionToDefaultStateHandler : public SinkStateHandler {
public:
    void handleMessage(SinkContext&, const PHY::BMCDecodedMessage*) override {}
    void handleMessageSenderStateChange(SinkContext&, SinkMessageSenderState) override {}
    void run(SinkContext& context) override;
    void enter(SinkContext& context) override;
    void reset(SinkContext&) override;

private:
    enum class Phase : uint8_t { WaitForSafe0V, WaitForSafe5V };
    Phase _phase = Phase::WaitForSafe0V;
    uint64_t _thresholdSinceUs = 0;
    uint64_t _enteredAtUs = 0;
    uint64_t _lastSampleTimestampUs = 0;
};

} // namespace T76::DRPD::Logic
