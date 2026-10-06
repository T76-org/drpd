#include "../lib/logic/cable_test_policy.hpp"
#include <array>
#include <cassert>
#include <limits>
using namespace T76::DRPD::Logic;
int main() {
    assert(!cableTestLeaseExpired(1000, 1001)); // poll renews after clock sample
    assert(!cableTestLeaseExpired(4000, 1000)); // exact lease boundary
    assert(cableTestLeaseExpired(4001, 1000));
    assert(!cableTestLeaseExpired(1, 0xffffffffu)); // normal timer wrap
    assert(!cableTestLeaseExpired(0xffffffffu, 0)); // concurrent renewal at wrap
    assert(cableTestLeaseExpired(3000, 0xffffffffu));
    assert(cableTestResponderHeader(0x0101)); // captured cable GoodCRC
    assert(cableTestResponderHeader(0x518f)); // captured cable Identity ACK
    assert(!cableTestResponderHeader(0x108f)); // looped-back outgoing request
    assert(!cableTestResponderHeader(0x51af)); // reserved bit set

    assert(cableTestContact(0.09f, 4.9f) == 1);
    assert(cableTestContact(4.9f, 0.09f) == 2);
    assert(cableTestContact(4.9f, 4.9f) == 0); // empty/unmarked ambiguous
    assert(cableTestContact(0.09f, 0.09f) == 0); // two Ra, no proven CC
    assert(cableTestContact(0, 4.9f) == 0); // short, not Ra
    assert(cableTestContact(0.4f, 4.9f) == 0); // Rd / far end connected
    assert(cableTestContact(std::numeric_limits<float>::quiet_NaN(), 4.9f) == 0);
    std::array<uint8_t, 24> ack{0x41,0xa8,0x00,0xff,0,0,0,0x18};
    assert(cableTestIdentityValid(std::span(ack).first(20), true));
    ack[7] = 0x20; // active cable
    assert(!cableTestIdentityValid(std::span(ack).first(20), true));
    assert(cableTestIdentityValid(ack, true));
    assert(cableTestIdentityValid(std::span(ack).first(20), false));
    ack[0] = 0x01; // initiator request must not become identity
    assert(!cableTestIdentityValid(ack, true));
    ack[0] = 0xc1; // BUSY, no identity
    assert(!cableTestIdentityValid(ack, true));
    ack[0] = 0x41; ack[3] = 0xfe; // wrong SVID
    assert(!cableTestIdentityValid(ack, true));
    ack[3] = 0xff; ack[7] = 0x08; // partner UFP identity, not cable
    assert(!cableTestIdentityValid(ack, true));
    assert(!cableTestIdentityValid(std::span(ack).first(19), true));
}
