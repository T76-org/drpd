#include "discovery.hpp"

using namespace T76::DRPD::Logic;

void DiscoveryStateHandler::run(SinkContext& context) {
    const uint64_t nowUs = context.protocolVBusCaptureTimestampUs();
    if (nowUs == 0 || nowUs == _lastSampleTimestampUs) {
        return;
    }
    _lastSampleTimestampUs = nowUs;
    if (context.protocolVBusVoltage() < LOGIC_SINK_VSAFE5V_PRESENT_THRESHOLD_VOLTS) {
        _thresholdSinceUs = 0;
        return;
    }

    if (_thresholdSinceUs == 0) {
        _thresholdSinceUs = nowUs;
        return;
    }

    if (nowUs - _thresholdSinceUs >= LOGIC_SINK_VBUS_DEBOUNCE_US) {
        context.transitionTo(SinkState::PE_SNK_Wait_for_Capabilities);
    }
}

void DiscoveryStateHandler::enter(SinkContext& context) {
    _bindContext(context);
    _thresholdSinceUs = 0;
    _lastSampleTimestampUs = 0;
}

void DiscoveryStateHandler::reset(SinkContext&) {
    _thresholdSinceUs = 0;
    _lastSampleTimestampUs = 0;
    _unbindContext();
}
