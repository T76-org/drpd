#include <cassert>
#include "../lib/logic/sink/inquiry_matcher.hpp"

using namespace T76::DRPD::Logic;

int main() {
    assert(classifyGetRevisionResponse(2, 0x0c, 1) == InquiryMatch::Response);
    assert(classifyGetRevisionResponse(1, 0x10, 0) == InquiryMatch::NotSupported);
    assert(classifyGetRevisionResponse(1, 0x04, 0) == InquiryMatch::Rejected);
    assert(classifyGetRevisionResponse(1, 0x0c, 0) == InquiryMatch::Wait);
    assert(classifyGetRevisionResponse(0, 0x0c, 1) == InquiryMatch::ProtocolError);
    assert(classifyGetRevisionResponse(2, 0x0b, 1) == InquiryMatch::ProtocolError);
    assert(classifyGetRevisionResponse(2, 0x0c, 0) == InquiryMatch::ProtocolError);
    assert(classifyGetRevisionResponse(1, 0x03, 0) == InquiryMatch::ProtocolError);
}
