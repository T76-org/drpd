#include <array>
#include <cassert>

#include "../lib/logic/sink/inquiry_reassembly.hpp"

using namespace T76::DRPD::Logic;

int main() {
    const std::array<uint8_t, 8> malformedPPS{1, 2, 3, 4, 5, 6, 0, 0};
    assert(isRecoverableMalformedInquiryPPSStatus(0x0c, true, false, 1, 0, 2, malformedPPS));
    assert(!isRecoverableMalformedInquiryPPSStatus(0x0c, true, false, 1, 0, 2,
        std::span<const uint8_t>(malformedPPS).first(7)));
    auto badMalformedPPS = malformedPPS;
    badMalformedPPS[7] = 1;
    assert(!isRecoverableMalformedInquiryPPSStatus(0x0c, true, false, 1, 0, 2, badMalformedPPS));
    InquiryExtendedReassembly<8> reassembly;
    const std::array<uint8_t, 3> whole{1, 2, 3};
    assert(reassembly.accept(false, false, 3, 0, whole) == InquiryReassemblyResult::Complete);
    assert(reassembly.payload().size() == 3);

    InquiryExtendedReassembly<32> ndoReassembly;
    const std::array<uint8_t, 6> status6{1, 2, 3, 4, 5, 6};
    const std::array<uint8_t, 10> status7Padded{1, 2, 3, 4, 5, 6, 7, 0, 0, 0};
    const std::array<uint8_t, 26> scedb24Padded{
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
        14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 0, 0};
    const std::array<uint8_t, 26> scedb25Padded{
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
        14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 0};
    assert(ndoReassembly.accept(false, false, 6, 0, status6) == InquiryReassemblyResult::Complete);
    assert(ndoReassembly.payload().size() == 6);
    assert(ndoReassembly.accept(false, false, 7, 0, status7Padded) == InquiryReassemblyResult::Complete);
    assert(ndoReassembly.payload().size() == 7);
    assert(ndoReassembly.accept(false, false, 24, 0, scedb24Padded) == InquiryReassemblyResult::Complete);
    assert(ndoReassembly.payload().size() == 24);
    assert(ndoReassembly.accept(false, false, 25, 0, scedb25Padded) == InquiryReassemblyResult::Complete);
    assert(ndoReassembly.payload().size() == 25);
    auto badStatusPadding = status7Padded;
    badStatusPadding[9] = 1;
    assert(ndoReassembly.accept(false, false, 7, 0, badStatusPadding) == InquiryReassemblyResult::Malformed);
    assert(ndoReassembly.accept(false, false, 7, 0,
        std::span<const uint8_t>(status7Padded).first(6)) == InquiryReassemblyResult::Malformed);

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
