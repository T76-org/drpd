#include <array>
#include <cassert>

#include "../lib/logic/sink/inquiry_reassembly.hpp"

using namespace T76::DRPD::Logic;

int main() {
    InquiryExtendedReassembly<8> reassembly;
    const std::array<uint8_t, 3> whole{1, 2, 3};
    assert(reassembly.accept(false, false, 3, 0, whole) == InquiryReassemblyResult::Complete);
    assert(reassembly.payload().size() == 3);

    const std::array<uint8_t, 4> first{1, 2, 3, 4};
    const std::array<uint8_t, 4> last{5, 6, 0, 0};
    assert(reassembly.accept(true, false, 6, 0, first) == InquiryReassemblyResult::InProgress);
    assert(reassembly.accept(true, false, 6, 0, first) == InquiryReassemblyResult::Duplicate);
    assert(reassembly.accept(true, false, 6, 1, last) == InquiryReassemblyResult::Complete);
    assert(reassembly.payload().size() == 6);

    assert(reassembly.accept(true, false, 6, 1, last) == InquiryReassemblyResult::Malformed);
    assert(reassembly.accept(true, false, 9, 0, first) == InquiryReassemblyResult::TooLarge);
    assert(reassembly.accept(true, true, 0, 1, {}) == InquiryReassemblyResult::RequestChunk);

    const std::array<uint8_t, 4> badPadding{5, 6, 1, 0};
    assert(reassembly.accept(true, false, 6, 0, first) == InquiryReassemblyResult::InProgress);
    assert(reassembly.accept(true, false, 6, 1, badPadding) == InquiryReassemblyResult::Malformed);

    const std::array<uint8_t, 4> conflictingFirst{1, 2, 3, 9};
    assert(reassembly.accept(true, false, 6, 0, first) == InquiryReassemblyResult::InProgress);
    assert(reassembly.accept(true, false, 6, 0, conflictingFirst) == InquiryReassemblyResult::Malformed);

    const std::array<uint8_t, 5> wrongLength{1, 2, 3, 4, 0};
    assert(reassembly.accept(true, false, 6, 0, first) == InquiryReassemblyResult::InProgress);
    assert(reassembly.accept(true, false, 6, 0, wrongLength) == InquiryReassemblyResult::Malformed);

    assert(reassembly.accept(true, false, 6, 0, first) == InquiryReassemblyResult::InProgress);
    assert(reassembly.accept(true, false, 7, 0, first) == InquiryReassemblyResult::Malformed);
}
