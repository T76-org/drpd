#include "../lib/logic/sink/message_transport_state.hpp"

#include <cassert>

using T76::DRPD::Logic::SinkMessageTransportState;

int main() {
    SinkMessageTransportState state;
    assert(state.begin(0) == 0);
    assert(state.begin(1) == 0);
    assert(state.begin(2) == 0);
    assert(state.begin(0) == 1);
    assert(state.target(1).pendingMessageId == 0);

    assert(!state.acknowledge(0, 0)); // stale ID on SOP
    assert(!state.acknowledge(2, 1)); // wrong ID on SOP''
    assert(state.acknowledge(1, 0));
    assert(state.target(0).pending);
    assert(!state.target(1).pending);
    assert(state.target(2).pending);

    assert(state.retry(2) == 1);
    assert(state.retry(2) == 2);
    assert(state.target(0).retryCount == 0);
    state.abandon(2);
    assert(!state.target(2).pending);

    // SOP Soft Reset resets only the partner domain.
    const auto cablePrimeNext = state.target(1).nextMessageId;
    state.reset(0);
    assert(state.target(0).nextMessageId == 0);
    assert(state.target(1).nextMessageId == cablePrimeNext);

    // Hard Reset/Cable power-cycle reset clears every affected cable domain.
    state.reset();
    for (size_t target = 0; target < 3; ++target) {
        assert(state.target(target).nextMessageId == 0);
        assert(!state.target(target).pending);
        assert(state.target(target).retryCount == 0);
    }
}
