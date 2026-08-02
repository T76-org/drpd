#include "../lib/logic/sink/received_message_id_state.hpp"

#include <cassert>

using T76::DRPD::Logic::ReceivedMessageIdState;

int main() {
    ReceivedMessageIdState ids;
    ids.store(0, 3);
    ids.store(1, 4);
    ids.store(2, 5);
    assert(ids.duplicate(0, 3));
    assert(ids.duplicate(1, 4));
    assert(ids.duplicate(2, 5));
    assert(!ids.duplicate(0, 4));
    assert(!ids.duplicate(1, 5));
    assert(!ids.duplicate(2, 3));
    ids.clear(1);
    assert(ids.duplicate(0, 3));
    assert(!ids.duplicate(1, 4));
    assert(ids.duplicate(2, 5));
    ids.clear(0); // SOP Soft Reset preserves cable duplicate domains.
    assert(!ids.duplicate(0, 3));
    assert(ids.duplicate(2, 5));
    ids.reset();
    assert(!ids.duplicate(0, 3));
    assert(!ids.duplicate(1, 4));
    assert(!ids.duplicate(2, 5));
}
