#define LOGIC_SINK_MAX_EXTENDED_PAYLOAD_BYTES 512
#include "../lib/logic/sink/authentication_inquiry.hpp"
#include "../lib/logic/sink/inquiry_reassembly.hpp"

#include <algorithm>
#include <cassert>

using namespace T76::DRPD::Logic;

int main() {
    SinkInquiryParameters parameters;
    auto request = encodeAuthenticationRequest(SinkInquiryType::GetDigests, parameters);
    assert(request.valid && request.length == 4);
    assert((std::array<uint8_t, 4>{request.bytes[0], request.bytes[1], request.bytes[2], request.bytes[3]} ==
        std::array<uint8_t, 4>{0x10, 0x81, 0x00, 0x00}));
    auto chunk = encodeAuthenticationChunk(request, 0);
    assert(chunk.valid && chunk.dataObjects == 2);
    assert(chunk.bytes[0] == 0x04 && chunk.bytes[1] == 0x00);

    parameters.target = 2;
    parameters.argument = 0x0123;
    parameters.selector[0] = 0x00;
    parameters.selector[1] = 0x01;
    request = encodeAuthenticationRequest(SinkInquiryType::GetCertificate, parameters);
    const std::array<uint8_t, 8> certificateGolden =
        {0x10, 0x82, 0x02, 0x00, 0x23, 0x01, 0x00, 0x01};
    assert(request.valid && request.length == certificateGolden.size());
    assert(std::equal(certificateGolden.begin(), certificateGolden.end(), request.bytes.begin()));
    chunk = encodeAuthenticationChunk(request, 0);
    assert(chunk.valid && chunk.dataObjects == 3 && chunk.bytes[0] == 0x08);
    parameters.argument = 4095;
    assert(!authenticationParametersValid(SinkInquiryType::GetCertificate, parameters));

    parameters = {};
    parameters.target = 3;
    for (size_t i = 0; i < parameters.payload.size(); ++i)
        parameters.payload[i] = static_cast<uint8_t>(i);
    request = encodeAuthenticationRequest(SinkInquiryType::Challenge, parameters);
    assert(request.valid && request.length == 36 && request.bytes[0] == 0x10 &&
        request.bytes[1] == 0x83 && request.bytes[2] == 3 && request.bytes[3] == 0);
    chunk = encodeAuthenticationChunk(request, 0);
    assert(chunk.valid && chunk.dataObjects == 7 && chunk.bytes[0] == 0x24 && chunk.bytes[1] == 0x80);
    const auto secondChunk = encodeAuthenticationChunk(request, 1);
    assert(secondChunk.valid && secondChunk.dataObjects == 3 &&
        secondChunk.bytes[0] == 0x24 && secondChunk.bytes[1] == 0x88);
    for (size_t i = 0; i < 10; ++i) assert(secondChunk.bytes[2 + i] == request.bytes[26 + i]);
    assert(!encodeAuthenticationChunk(request, 2).valid);

    std::array<uint8_t, 68> digests = {};
    digests[0] = 0x10; digests[1] = 0x01; digests[2] = 0x01; digests[3] = 0x05;
    assert(validateAuthenticationResponse(SinkInquiryType::GetDigests, {}, digests) ==
        AuthenticationResponseKind::Response);
    digests[2] = 0;
    assert(validateAuthenticationResponse(SinkInquiryType::GetDigests, {}, digests) ==
        AuthenticationResponseKind::Malformed);

    const std::array<uint8_t, 4> busyError = {0x10, 0x7f, 0x03, 0x00};
    assert(validateAuthenticationResponse(SinkInquiryType::GetDigests, {}, busyError) ==
        AuthenticationResponseKind::Error);
    const std::array<uint8_t, 4> malformedError = {0x10, 0x7f, 0x03, 0x01};
    assert(validateAuthenticationResponse(SinkInquiryType::GetDigests, {}, malformedError) ==
        AuthenticationResponseKind::Malformed);

    parameters = {};
    parameters.target = 2;
    parameters.selector[0] = 4;
    const std::array<uint8_t, 8> certificate = {0x10, 0x02, 0x02, 0x00, 1, 2, 3, 4};
    assert(validateAuthenticationResponse(SinkInquiryType::GetCertificate, parameters, certificate) ==
        AuthenticationResponseKind::Response);
    parameters.selector[0] = 3;
    assert(validateAuthenticationResponse(SinkInquiryType::GetCertificate, parameters, certificate) ==
        AuthenticationResponseKind::Malformed);

    parameters = {};
    parameters.target = 3;
    std::array<uint8_t, 168> challenge = {};
    challenge[0] = 0x10; challenge[1] = 0x03; challenge[2] = 3; challenge[3] = 0x08;
    challenge[4] = 0x10; challenge[5] = 0x10; challenge[6] = 1; challenge[7] = 0;
    assert(validateAuthenticationResponse(SinkInquiryType::Challenge, parameters, challenge) ==
        AuthenticationResponseKind::Response);
    challenge[7] = 1;
    assert(validateAuthenticationResponse(SinkInquiryType::Challenge, parameters, challenge) ==
        AuthenticationResponseKind::Malformed);
    challenge[7] = 0;
    challenge[72] = 1;
    assert(validateAuthenticationResponse(SinkInquiryType::Challenge, parameters, challenge) ==
        AuthenticationResponseKind::Malformed);

    AuthenticationChunkRequestState chunkState;
    chunkState.begin(SinkInquiryType::Challenge, 41);
    assert(chunkState.expected());
    assert(!chunkState.accept(40, 1)); // stale/superseded request ID
    assert(!chunkState.accept(41, 0));
    assert(chunkState.accept(41, 1));
    assert(!chunkState.accept(41, 1)); // duplicate after progress
    chunkState.reset(); // reset or detach invalidates the attempt
    assert(!chunkState.accept(41, 1));
    chunkState.begin(SinkInquiryType::Challenge, 42); // superseding attempt owns new state
    assert(!chunkState.accept(41, 1));
    assert(chunkState.accept(42, 1));
    chunkState.begin(SinkInquiryType::GetDigests, 43);
    assert(!chunkState.expected());

    static_assert(authenticationResponseTimeoutUs(SinkInquiryType::GetDigests) == 200000);
    static_assert(authenticationResponseTimeoutUs(SinkInquiryType::GetCertificate) == 200000);
    static_assert(authenticationResponseTimeoutUs(SinkInquiryType::Challenge) == 1200000);

    InquiryExtendedReassembly<260> reassembly;
    std::array<uint8_t, 26> fullFragment = {};
    for (uint8_t chunkNumber = 0; chunkNumber < 6; ++chunkNumber) {
        fullFragment.fill(chunkNumber);
        assert(reassembly.accept(true, false, 168, chunkNumber, fullFragment) ==
            InquiryReassemblyResult::InProgress);
    }
    std::array<uint8_t, 14> finalFragment = {};
    finalFragment.fill(6);
    finalFragment[12] = 0;
    finalFragment[13] = 0;
    assert(reassembly.accept(true, false, 168, 6, finalFragment) ==
        InquiryReassemblyResult::Complete);
    assert(reassembly.payload().size() == 168);
    assert(reassembly.accept(true, false, 168, 1, fullFragment) ==
        InquiryReassemblyResult::Malformed);
    auto badFinal = finalFragment;
    badFinal[13] = 1;
    fullFragment.fill(0);
    assert(reassembly.accept(true, false, 28, 0, fullFragment) ==
        InquiryReassemblyResult::InProgress);
    assert(reassembly.accept(true, false, 28, 1, badFinal) ==
        InquiryReassemblyResult::Malformed);
}
