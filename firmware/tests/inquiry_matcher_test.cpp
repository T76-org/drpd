#include <cassert>
#include <cstring>
#define LOGIC_SINK_MAX_EXTENDED_PAYLOAD_BYTES 512
#define LOGIC_SINK_INQUIRY_RESPONSE_TIMEOUT_US 33000
#include "../lib/logic/sink/inquiry_descriptor.hpp"
#include "../lib/logic/sink/sink_types.hpp"
#include "../lib/logic/sink/inquiry_capability_selection.hpp"

using namespace T76::DRPD::Logic;

int main() {
    const auto descriptor = sinkInquiryDescriptor(SinkInquiryType::GetRevision);
    assert(descriptor.has_value());
    assert(std::strcmp(descriptor->token, "GET_REVISION") == 0);
    assert(sinkInquiryDescriptor("GET_REVISION").has_value());
    assert(!sinkInquiryDescriptor("UNKNOWN").has_value());
    assert(descriptor->requestMessageType == 0x18);
    assert(inquiryParametersApplicable(*descriptor, 0, 0, 0));
    assert(!inquiryParametersApplicable(*descriptor, 1, 0, 0));
    assert(matchInquiryResponse(*descriptor, 2, 0x0c, 1) == InquiryMatch::Response);
    assert(matchInquiryResponse(*descriptor, 1, 0x10, 0) == InquiryMatch::NotSupported);
    assert(matchInquiryResponse(*descriptor, 1, 0x04, 0) == InquiryMatch::Rejected);
    assert(matchInquiryResponse(*descriptor, 1, 0x0c, 0) == InquiryMatch::Wait);
    assert(matchInquiryResponse(*descriptor, 0, 0x0c, 1) == InquiryMatch::Unrelated);
    assert(matchInquiryResponse(*descriptor, 2, 0x0b, 1) == InquiryMatch::Unrelated);
    assert(matchInquiryResponse(*descriptor, 2, 0x0c, 0) == InquiryMatch::ProtocolError);
    assert(matchInquiryResponse(*descriptor, 2, 0x0c, 2) == InquiryMatch::ProtocolError);
    assert(matchInquiryResponse(*descriptor, 1, 0x03, 0) == InquiryMatch::Unrelated);

    struct Golden {
        SinkInquiryType type;
        const char *token;
        uint8_t requestType;
        InquiryMessageClass responseClass;
        uint8_t responseType;
        uint16_t responseBytes;
    };
    const Golden golden[] = {
        {SinkInquiryType::GetRevision, "GET_REVISION", 0x18, InquiryMessageClass::Data, 0x0c, 4},
        {SinkInquiryType::GetSourceCapabilities, "GET_SOURCE_CAP", 0x07, InquiryMessageClass::Data, 0x01, 4},
        {SinkInquiryType::GetSourceCapabilitiesExtended, "GET_SOURCE_CAP_EXTENDED", 0x11, InquiryMessageClass::Extended, 0x01, 24},
        {SinkInquiryType::GetStatus, "GET_STATUS", 0x12, InquiryMessageClass::Extended, 0x02, 6},
        {SinkInquiryType::GetSourceInfo, "GET_SOURCE_INFO", 0x17, InquiryMessageClass::Data, 0x0b, 4},
        {SinkInquiryType::GetPPSStatus, "GET_PPS_STATUS", 0x14, InquiryMessageClass::Extended, 0x0c, 4},
    };
    for (const auto& expected : golden) {
        const auto actual = sinkInquiryDescriptor(expected.type);
        assert(actual.has_value());
        assert(std::strcmp(actual->token, expected.token) == 0);
        assert(actual->requestClass == InquiryMessageClass::Control);
        assert(actual->requestMessageType == expected.requestType);
        assert(actual->requestDataObjects == 0);
        assert(actual->response.messageClass == expected.responseClass);
        assert(actual->response.messageType == expected.responseType);
        assert(actual->minimumResponseBytes == expected.responseBytes);
        assert(sinkInquiryDescriptor(expected.token).has_value());
        assert(inquiryResponsePayloadSizeValid(*actual, actual->minimumResponseBytes));
        assert(!inquiryResponsePayloadSizeValid(*actual, actual->minimumResponseBytes - 1));
        assert(inquiryStateApplicability(*actual, true, 2, true) ==
            InquiryApplicability::Applicable);
        assert(inquiryStateApplicability(*actual, false, 2, true) ==
            InquiryApplicability::RequiresExplicitContract);
    }
    const auto sourceCap = sinkInquiryDescriptor(SinkInquiryType::GetSourceCapabilities).value();
    assert(inquiryStateApplicability(sourceCap, true, 0, false) == InquiryApplicability::Applicable);
    const auto status = sinkInquiryDescriptor(SinkInquiryType::GetStatus).value();
    assert(inquiryStateApplicability(status, true, 1, false) == InquiryApplicability::RequiresSpecRevision);
    assert(status.warningFlags == InquiryWarningStatusReadClearsEvents);
    assert(inquiryResponsePayloadSizeValid(status, 7));
    assert(inquiryResponsePayloadSizeValid(
        sinkInquiryDescriptor(SinkInquiryType::GetSourceCapabilitiesExtended).value(), 25));
    const auto pps = sinkInquiryDescriptor(SinkInquiryType::GetPPSStatus).value();
    assert(inquiryStateApplicability(pps, true, 2, false) == InquiryApplicability::RequiresPPSContract);

    const uint32_t refreshed[] = {0x00019096, 0x0002d0c8, 0xc0dc213c};
    auto selection = selectRefreshedCapability(0x0002d0c8, refreshed);
    assert(selection.provenance == CapabilityRefreshSelectionProvenance::MatchedPreviousPDO);
    assert(selection.index == 1);
    selection = selectRefreshedCapability(0x12345678, refreshed);
    assert(selection.provenance == CapabilityRefreshSelectionProvenance::SafeFirstPDOFallback);
    assert(selection.index == 0);
    selection = selectRefreshedCapability(std::nullopt, refreshed);
    assert(selection.provenance == CapabilityRefreshSelectionProvenance::SafeFirstPDOFallback);
    selection = selectRefreshedCapability(std::nullopt, std::span<const uint32_t>{});
    assert(selection.provenance == CapabilityRefreshSelectionProvenance::NoCapabilities);
}
