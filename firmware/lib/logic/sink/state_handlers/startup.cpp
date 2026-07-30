#include "startup.hpp"

using namespace T76::DRPD::Logic;

void StartupStateHandler::run(SinkContext& context) {
    context.transitionTo(SinkState::PE_SNK_Discovery);
}
