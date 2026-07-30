#include <array>
#include <algorithm>
#include <cassert>
#include <cstdint>
#include <iostream>

#include "structured_vdm.hpp"
#include "../lib/proto/pd_revision.hpp"

using T76::DRPD::Proto::StructuredVDM;

int main() {
    const std::array<uint8_t, 4> appleRequest = {0x01, 0x80, 0x00, 0xFF};
    const auto request = StructuredVDM::decode(appleRequest);
    assert(request.has_value());
    assert(request->isDiscoverIdentityRequest());
    assert(request->svid() == StructuredVDM::PDSID);
    assert(request->commandType() == StructuredVDM::CommandType::Request);

    const auto nak = StructuredVDM::discoverIdentityNak(request.value());
    const auto rawNak = nak.raw();
    const std::array<uint8_t, 4> expectedNak = {0x81, 0x80, 0x00, 0xFF};
    assert(std::equal(rawNak.begin(), rawNak.end(), expectedNak.begin(), expectedNak.end()));
    assert(nak.numDataObjects() == 1);

    assert(!StructuredVDM::decode(std::span<const uint8_t>(appleRequest.data(), 3)).has_value());

    for (const uint32_t invalid : {
        0xFF000001u, // Unstructured.
        0xFF008041u, // ACK response.
        0x12348001u, // Wrong SVID.
        0xFF008021u, // Reserved bit set.
        0xFF008101u, // Object position non-zero.
        0xFF00C001u, // Reserved major version.
    }) {
        assert(!StructuredVDM(invalid).isDiscoverIdentityRequest());
    }

    using SpecRevision = T76::DRPD::Proto::PDHeader::SpecRevision;
    assert(T76::DRPD::Proto::negotiatedSpecRevision(SpecRevision::Rev2_0) == SpecRevision::Rev2_0);
    assert(T76::DRPD::Proto::negotiatedSpecRevision(SpecRevision::Rev3_x) == SpecRevision::Rev3_x);
    assert(T76::DRPD::Proto::unsupportedControlResponse(SpecRevision::Rev2_0) ==
        T76::DRPD::Proto::ControlMessageType::Reject);
    assert(T76::DRPD::Proto::unsupportedControlResponse(SpecRevision::Rev3_x) ==
        T76::DRPD::Proto::ControlMessageType::Not_Supported);

    std::cout << "Structured VDM tests passed\n";
    return 0;
}
