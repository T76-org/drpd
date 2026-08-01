#include <cassert>
#include <cstring>
#define LOGIC_SINK_MAX_EXTENDED_PAYLOAD_BYTES 512
#define LOGIC_SINK_INQUIRY_RESPONSE_TIMEOUT_US 33000
#include "../lib/logic/sink/inquiry_descriptor.hpp"
#include "../lib/logic/sink/sink_types.hpp"

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
}
