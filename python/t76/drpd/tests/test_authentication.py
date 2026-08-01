import hashlib
from datetime import datetime, timedelta, timezone

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.x509.oid import NameOID

from t76.drpd.device.device_sink import _decode_inquiry_response
from t76.drpd.device.types import (
    AuthenticationCertificateInquiryData,
    AuthenticationChallengeInquiryData,
    AuthenticationDigestsInquiryData,
    AuthenticationErrorInquiryData,
    ChallengeInquiryRequest,
    GetCertificateInquiryRequest,
    GetDigestsInquiryRequest,
    SinkInquiryOutcome,
    SinkInquiryStatus,
)

from t76.drpd.device.authentication import (
    AuthenticationTrustAnchor,
    AuthenticationVerificationError,
    certificate_chain_digest,
    challenge_transcript,
    signature_little_endian_to_p1363,
    USB_AUTH_ACD,
    USB_AUTH_EKU,
    verify_certificate_chain,
    verify_challenge_signature,
)


def test_authentication_digest_and_transcript_are_exact() -> None:
    chain = b"strict-wire-chain"
    assert certificate_chain_digest(chain) == hashlib.sha256(chain).digest()
    request = bytes(range(36))
    response = bytes(range(168))
    assert challenge_transcript(request, response) == request + response[:104]


def test_signature_halves_reverse_independently() -> None:
    signature = bytes(range(32)) + bytes(range(32, 64))
    assert signature_little_endian_to_p1363(signature) == bytes(range(31, -1, -1)) + bytes(range(63, 31, -1))


def test_trust_anchor_never_accepts_unmatched_roothash() -> None:
    with pytest.raises(AuthenticationVerificationError, match="RootHash") as caught:
        AuthenticationTrustAnchor(b"root", bytes(32))
    assert caught.value.layer == "trust"


@pytest.mark.parametrize("chain", [b"", bytes(4097)])
def test_certificate_chain_bound_is_strict(chain: bytes) -> None:
    with pytest.raises(AuthenticationVerificationError) as caught:
        certificate_chain_digest(chain)
    assert caught.value.layer == "chain"


def _status(request, length: int) -> SinkInquiryStatus:
    return SinkInquiryStatus(SinkInquiryOutcome.RESPONSE, 7, request.type, 0, 0x09, length)


def test_authentication_response_vectors_correlate() -> None:
    digest_request = GetDigestsInquiryRequest()
    digest_body = bytes([0x10, 1, 1, 0b1001]) + bytes([0x11]) * 32 + bytes([0x33]) * 32
    digests = _decode_inquiry_response(digest_request, _status(digest_request, len(digest_body)), digest_body)
    assert isinstance(digests, AuthenticationDigestsInquiryData)
    assert tuple(slot for slot, _ in digests.digests) == (0, 3)

    certificate_request = GetCertificateInquiryRequest(3, 128, 4)
    certificate_body = bytes([0x10, 2, 3, 0, 1, 2, 3, 4])
    certificate = _decode_inquiry_response(certificate_request, _status(certificate_request, len(certificate_body)), certificate_body)
    assert certificate == AuthenticationCertificateInquiryData(3, 128, b"\x01\x02\x03\x04")

    challenge_request = ChallengeInquiryRequest(3, bytes(32))
    challenge_body = bytearray(168)
    challenge_body[:8] = bytes([0x10, 3, 3, 1 << 3, 1, 1, 1, 0])
    challenge = _decode_inquiry_response(challenge_request, _status(challenge_request, 168), bytes(challenge_body))
    assert isinstance(challenge, AuthenticationChallengeInquiryData)
    assert len(challenge.signed_response) == 104


def test_authentication_response_vectors_reject_wrong_slot_and_context() -> None:
    request = ChallengeInquiryRequest(2, bytes(32))
    body = bytearray(168)
    body[:8] = bytes([0x10, 3, 2, 1 << 2, 1, 1, 1, 0])
    body[72] = 1
    with pytest.raises(ValueError, match="context hash"):
        _decode_inquiry_response(request, _status(request, 168), bytes(body))


def test_authentication_error_is_exact_four_byte_header() -> None:
    request = GetDigestsInquiryRequest()
    decoded = _decode_inquiry_response(request, _status(request, 4), bytes([0x10, 0x7F, 5, 9]))
    assert decoded == AuthenticationErrorInquiryData(5, 9)
    with pytest.raises(ValueError, match="exactly 4"):
        _decode_inquiry_response(request, _status(request, 5), bytes([0x10, 0x7F, 5, 9, 0]))


def _certificate(subject_cn, key, issuer_name, issuer_key, *, ca: bool, acd: bool = False) -> bytes:
    now = datetime.now(timezone.utc)
    builder = (
        x509.CertificateBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, subject_cn)]))
        .issuer_name(issuer_name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=1))
        .add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True)
        .add_extension(x509.KeyUsage(digital_signature=not ca, content_commitment=False, key_encipherment=False, data_encipherment=False, key_agreement=False, key_cert_sign=ca, crl_sign=False, encipher_only=None, decipher_only=None), critical=True)
        .add_extension(x509.ExtendedKeyUsage([USB_AUTH_EKU]), critical=True)
    )
    if acd:
        builder = builder.add_extension(x509.UnrecognizedExtension(USB_AUTH_ACD, b"\x05\x00"), critical=False)
    return builder.sign(issuer_key, hashes.SHA256()).public_bytes(serialization.Encoding.DER)


def _valid_chain():
    root_key = ec.generate_private_key(ec.SECP256R1())
    root_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "USB Root")])
    root_der = _certificate("USB Root", root_key, root_name, root_key, ca=True)
    root = x509.load_der_x509_certificate(root_der)
    intermediate_key = ec.generate_private_key(ec.SECP256R1())
    intermediate_der = _certificate("USB Intermediate", intermediate_key, root.subject, root_key, ca=True)
    intermediate = x509.load_der_x509_certificate(intermediate_der)
    leaf_key = ec.generate_private_key(ec.SECP256R1())
    leaf_der = _certificate("device vid:1234 pid:5678", leaf_key, intermediate.subject, intermediate_key, ca=False, acd=True)
    anchor = AuthenticationTrustAnchor(root_der, hashlib.sha256(root_der).digest())
    return anchor, intermediate_der, leaf_der, leaf_key


def test_generated_wire_order_chain_and_challenge_signature_succeed() -> None:
    anchor, intermediate, leaf, leaf_key = _valid_chain()
    verified = verify_certificate_chain((intermediate, leaf), anchor, expected_vid=0x1234, expected_pid=0x5678, wire_root_hash=anchor.root_hash, slot=2, allowed_slots=frozenset({2}))
    assert "vid:1234" in verified.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value
    request = bytes([0x10, 0x83, 2, 0]) + bytes(range(32))
    response = bytearray(168)
    response[:8] = bytes([0x10, 3, 2, 4, 1, 1, 1, 0])
    der_signature = leaf_key.sign(challenge_transcript(request, response), ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der_signature)
    response[104:] = r.to_bytes(32, "little") + s.to_bytes(32, "little")
    verify_challenge_signature(leaf_key.public_key(), request, bytes(response))


def test_wire_order_root_hash_slot_and_signature_mutations_fail() -> None:
    anchor, intermediate, leaf, leaf_key = _valid_chain()
    with pytest.raises(AuthenticationVerificationError):
        verify_certificate_chain((leaf, intermediate), anchor)
    with pytest.raises(AuthenticationVerificationError, match="RootHash"):
        verify_certificate_chain((intermediate, leaf), anchor, wire_root_hash=bytes(32))
    with pytest.raises(AuthenticationVerificationError, match="slot"):
        verify_certificate_chain((intermediate, leaf), anchor, slot=3, allowed_slots=frozenset({2}))
    denied = AuthenticationTrustAnchor(anchor.root_certificate_der, anchor.root_hash, denied_fingerprints=frozenset({hashlib.sha256(leaf).digest()}))
    with pytest.raises(AuthenticationVerificationError, match="denied"):
        verify_certificate_chain((intermediate, leaf), denied)
    request = bytes([0x10, 0x83, 2, 0]) + bytes(32)
    response = bytearray(168); response[:8] = bytes([0x10, 3, 2, 4, 1, 1, 1, 0]); response[104:] = bytes(64)
    with pytest.raises(AuthenticationVerificationError) as caught:
        verify_challenge_signature(leaf_key.public_key(), request, bytes(response))
    assert caught.value.layer == "signature"
