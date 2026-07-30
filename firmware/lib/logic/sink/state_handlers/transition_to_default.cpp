#include "transition_to_default.hpp"

#include <pico/time.h>

using namespace T76::DRPD::Logic;

void TransitionToDefaultStateHandler::run(SinkContext& context) {
    const uint64_t nowUs = time_us_64();
    if (nowUs - _enteredAtUs >= LOGIC_SINK_NO_RESPONSE_TIMEOUT_US) {
        context.performReset(SinkResetType::HardReset);
        return;
    }
    const uint64_t sampleTimestampUs = context.protocolVBusCaptureTimestampUs();
    if (sampleTimestampUs == 0 || sampleTimestampUs == _lastSampleTimestampUs) {
        return;
    }
    _lastSampleTimestampUs = sampleTimestampUs;
    const float voltage = context.protocolVBusVoltage();
    const bool thresholdMet = _phase == Phase::WaitForSafe0V
        ? voltage <= LOGIC_SINK_VSAFE0V_THRESHOLD_VOLTS
        : voltage >= LOGIC_SINK_VSAFE5V_PRESENT_THRESHOLD_VOLTS;

    if (!thresholdMet) {
        _thresholdSinceUs = 0;
        return;
    }

    if (_thresholdSinceUs == 0) {
        _thresholdSinceUs = sampleTimestampUs;
        return;
    }

    if (sampleTimestampUs - _thresholdSinceUs < LOGIC_SINK_VBUS_DEBOUNCE_US) {
        return;
    }

    _thresholdSinceUs = 0;
    if (_phase == Phase::WaitForSafe0V) {
        _phase = Phase::WaitForSafe5V;
    } else {
        context.transitionTo(SinkState::PE_SNK_Wait_for_Capabilities);
    }
}

void TransitionToDefaultStateHandler::enter(SinkContext& context) {
    _bindContext(context);
    _phase = Phase::WaitForSafe0V;
    _thresholdSinceUs = 0;
    _enteredAtUs = time_us_64();
    _lastSampleTimestampUs = 0;
}

void TransitionToDefaultStateHandler::reset(SinkContext&) {
    _phase = Phase::WaitForSafe0V;
    _thresholdSinceUs = 0;
    _enteredAtUs = 0;
    _lastSampleTimestampUs = 0;
    _unbindContext();
}
