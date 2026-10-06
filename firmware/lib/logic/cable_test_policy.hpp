/**
 * @file cable_test_policy.hpp
 * Host-testable electrical and identity validation for single-ended cable tests.
 * No Ra is intentionally ambiguous: empty, unmarked and damaged cables overlap.
 */
#pragma once
#include <cstdint>
#include <span>

namespace T76::DRPD::Logic {
    /** Check the three-second host lease without expiring a concurrent renewal.
     * @param nowMs Sampled clock in milliseconds, modulo 2^32.
     * @param lastPollMs Last atomic renewal; may be newer than the sampled clock.
     * @return True only when the forward elapsed time exceeds three seconds.
     */
    inline bool cableTestLeaseExpired(uint32_t nowMs, uint32_t lastPollMs) {
        return static_cast<int32_t>(nowMs - lastPollMs) > 3000;
    }
    /** Classify the DUT contact with Ra under default-current Rp.
     * @param voltage Sampled CC voltage in volts.
     * @return True for the qualified Ra voltage window.
     */
    inline bool cableTestRa(float voltage) {
        return voltage >= 0.02f && voltage <= 0.20f;
    }
    /** Choose VCONN contact only for an unambiguous Ra/open pair.
     * @param cc1 First DUT CC voltage under Rp.
     * @param cc2 Second DUT CC voltage under Rp.
     * @return VCONN contact 1 or 2; zero when absent or unsafe/ambiguous.
     */
    inline uint8_t cableTestContact(float cc1, float cc2) {
        if (cableTestRa(cc1) && cc2 >= 2.6f) return 1;
        if (cableTestRa(cc2) && cc1 >= 2.6f) return 2;
        return 0;
    }
    /** Accept only cable-origin SOP-prime headers, not looped-back port traffic.
     * @param header Raw PD header; bit 8 is Cable Plug, not Port Power Role.
     * @return True for cable-origin traffic with the reserved data-role bit clear.
     */
    inline bool cableTestResponderHeader(uint16_t header) {
        return (header & 0x0120u) == 0x0100u;
    }
    /** Read a little-endian VDO without alignment assumptions.
     * @param bytes Four or more bytes.
     * @return First 32-bit VDO.
     */
    inline uint32_t cableTestVDO(std::span<const uint8_t> bytes) {
        return uint32_t(bytes[0]) | (uint32_t(bytes[1]) << 8) |
            (uint32_t(bytes[2]) << 16) | (uint32_t(bytes[3]) << 24);
    }
    /** Validate Discover Identity ACK topology for a cable plug.
     * @param body Complete Vendor_Defined response body, including VDM header.
     * @param pd3 True when response uses PD revision 3.x.
     * @return True for a complete passive or active cable identity.
     */
    inline bool cableTestIdentityValid(std::span<const uint8_t> body, bool pd3) {
        if (body.size() < 20 || body.size() > 28 || body.size() % 4 != 0) return false;
        const uint32_t header = cableTestVDO(body);
        if ((header & 0xffff87ffu) != 0xff008041u ||
            ((header >> 13) & 3) > 1 || ((header >> 11) & 3) > 1 ||
            (((header >> 13) & 3) == 0 && ((header >> 11) & 3) != 0)) return false;
        const uint8_t type = (cableTestVDO(body.subspan(4)) >> 27) & 7;
        return type == 3 || (type == 4 && (!pd3 || body.size() >= 24));
    }
}
