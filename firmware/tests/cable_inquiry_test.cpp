#define LOGIC_SINK_MAX_EXTENDED_PAYLOAD_BYTES 512
#include "../lib/logic/sink/cable_inquiry.hpp"
#include "../lib/logic/sink/sop_target_match.hpp"

#include <cassert>

using namespace T76::DRPD::Logic;

int main() {
    constexpr SinkInquiryType simple[] = {
        SinkInquiryType::GetStatus, SinkInquiryType::GetRevision,
        SinkInquiryType::GetManufacturerInfo, SinkInquiryType::DiscoverIdentity,
        SinkInquiryType::DiscoverSVIDs};
    for (const auto type : simple) {
        assert(cableInquirySyntaxValid(type, "SOP_PRIME", 2));
        assert(cableInquirySyntaxValid(type, "SOP_DOUBLE_PRIME", 2));
        assert(!cableInquirySyntaxValid(type, "SOP", 2));
        assert(!cableInquirySyntaxValid(type, "SOP_PRIME", 1));
        assert(!cableInquirySyntaxValid(type, "SOP_PRIME", 3));
    }
    assert(cableInquirySyntaxValid(
        SinkInquiryType::DiscoverModes, "SOP_PRIME", 3, 1));
    assert(cableInquirySyntaxValid(
        SinkInquiryType::DiscoverModes, "SOP_DOUBLE_PRIME", 3, 65535));
    assert(!cableInquirySyntaxValid(
        SinkInquiryType::DiscoverModes, "SOP_PRIME", 2, 1));
    assert(!cableInquirySyntaxValid(
        SinkInquiryType::DiscoverModes, "SOP_PRIME", 3));
    assert(!cableInquirySyntaxValid(
        SinkInquiryType::DiscoverModes, "SOP_PRIME", 3, 0));
    assert(!cableInquirySyntaxValid(
        SinkInquiryType::DiscoverModes, "SOP_PRIME", 3, 65536));
    assert(!cableInquirySyntaxValid(
        SinkInquiryType::DiscoverModes, "SOP_PRIME", 3, 1.5));
    assert(!cableInquirySyntaxValid(
        SinkInquiryType::GetSourceCapabilities, "SOP_PRIME", 2));

    constexpr auto prime = cableHeaderIntent(SinkInquirySOPTarget::SOPPrime);
    constexpr auto doublePrime = cableHeaderIntent(SinkInquirySOPTarget::SOPDoublePrime);
    static_assert(prime.targetIndex == 1 && doublePrime.targetIndex == 2);
    static_assert(prime.cablePlugBit == 0 && prime.reservedDataRoleBit == 0);
    static_assert(doublePrime.cablePlugBit == 0 && doublePrime.reservedDataRoleBit == 0);
    static_assert(preserveInquiryTarget(SinkInquirySOPTarget::SOPPrime) ==
        SinkInquirySOPTarget::SOPPrime);
    static_assert(preserveInquiryTarget(SinkInquirySOPTarget::SOPDoublePrime) ==
        SinkInquirySOPTarget::SOPDoublePrime);
    constexpr std::optional<SinkInquirySOPTarget> preparedPrime =
        SinkInquirySOPTarget::SOPPrime;
    static_assert(exactSOPTargetMatch(preparedPrime, SinkInquirySOPTarget::SOPPrime));
    static_assert(!exactSOPTargetMatch(
        preparedPrime, SinkInquirySOPTarget::SOPDoublePrime));
    static_assert(!exactSOPTargetMatch(
        std::optional<SinkInquirySOPTarget>{}, SinkInquirySOPTarget::SOPPrime));
}
