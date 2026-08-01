"""Deterministic USB Type-C Authentication verification primitives."""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from cryptography.x509.oid import ExtensionOID, ObjectIdentifier, NameOID

USB_AUTH_EKU = ObjectIdentifier("2.23.145.1.1")
USB_AUTH_ACD = ObjectIdentifier("2.23.145.1.2")


@dataclass(frozen=True)
class AuthenticationTrustAnchor:
    """Explicit offline USB authentication root; OS/Web PKI is never consulted."""

    root_certificate_der: bytes
    root_hash: bytes
    disabled: bool = False
    denied_fingerprints: frozenset[bytes] = frozenset()

    def __post_init__(self) -> None:
        if len(self.root_hash) != 32 or hashlib.sha256(self.root_certificate_der).digest() != self.root_hash:
            raise AuthenticationVerificationError("trust", "anchor RootHash does not match root certificate")


class AuthenticationVerificationError(ValueError):
    """Failure tagged by transport/parse/signature/chain/trust/policy layer."""

    def __init__(self, layer: str, message: str):
        super().__init__(message)
        self.layer = layer


def generate_challenge_nonce() -> bytes:
    """Return one fresh 32-byte platform-CSPRNG nonce."""
    return secrets.token_bytes(32)


def certificate_chain_digest(chain: bytes) -> bytes:
    """Return the protocol SHA-256 digest of the exact chain bytes."""
    if not 1 <= len(chain) <= 4096:
        raise AuthenticationVerificationError("chain", "certificate chain must contain 1 to 4096 bytes")
    return hashlib.sha256(chain).digest()


def signature_little_endian_to_p1363(signature: bytes) -> bytes:
    """Convert USB Auth little-endian r||s to fixed-width big-endian P1363."""
    if len(signature) != 64:
        raise AuthenticationVerificationError("signature", "P-256 signature must contain 64 bytes")
    return signature[:32][::-1] + signature[32:][::-1]


def challenge_transcript(request_body: bytes, response_body: bytes) -> bytes:
    """Build the exact signed transcript: 36 request bytes + first 104 response bytes."""
    if len(request_body) != 36 or len(response_body) != 168:
        raise AuthenticationVerificationError("parse", "challenge request/response lengths must be 36/168 bytes")
    return request_body + response_body[:104]


def verify_challenge_signature(public_key: object, request_body: bytes, response_body: bytes) -> None:
    """Verify ECDSA-P256/SHA-256; raises a layer-specific deterministic failure."""
    signature = signature_little_endian_to_p1363(response_body[104:])
    r = int.from_bytes(signature[:32], "big")
    s = int.from_bytes(signature[32:], "big")
    try:
        public_key.verify(encode_dss_signature(r, s), challenge_transcript(request_body, response_body), ec.ECDSA(hashes.SHA256()))  # type: ignore[attr-defined]
    except Exception as exc:
        raise AuthenticationVerificationError("signature", "challenge signature verification failed") from exc


def _strict_certificate(der: bytes) -> x509.Certificate:
    try:
        certificate = x509.load_der_x509_certificate(der)
    except ValueError as exc:
        raise AuthenticationVerificationError("parse", "certificate is not strict DER") from exc
    if certificate.public_bytes(serialization.Encoding.DER) != der:
        raise AuthenticationVerificationError("parse", "certificate DER is non-canonical or has trailing bytes")
    key = certificate.public_key()
    if not isinstance(key, ec.EllipticCurvePublicKey) or not isinstance(key.curve, ec.SECP256R1):
        raise AuthenticationVerificationError("policy", "certificate key must be ECDSA P-256")
    if key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)[0] != 4:
        raise AuthenticationVerificationError("policy", "certificate public point must be uncompressed")
    return certificate


def verify_certificate_chain(
    certificate_chain: tuple[bytes, ...],
    anchor: AuthenticationTrustAnchor | None,
    *,
    expected_vid: int | None = None,
    expected_pid: int | None = None,
    wire_root_hash: bytes | None = None,
    slot: int | None = None,
    allowed_slots: frozenset[int] | None = None,
) -> x509.Certificate:
    """Verify exact wire-order product chain against one explicit offline anchor."""
    if not certificate_chain or sum(map(len, certificate_chain)) > 4096:
        raise AuthenticationVerificationError("chain", "certificate chain count/size is invalid")
    certificates = tuple(_strict_certificate(value) for value in certificate_chain)
    if anchor is None:
        raise AuthenticationVerificationError("trust", "no configured trust anchor")
    if anchor.disabled:
        raise AuthenticationVerificationError("trust", "configured trust anchor is disabled")
    if wire_root_hash is not None and wire_root_hash != anchor.root_hash:
        raise AuthenticationVerificationError("trust", "wire RootHash does not match configured anchor")
    if slot is not None and (not 0 <= slot <= 7 or (allowed_slots is not None and slot not in allowed_slots)):
        raise AuthenticationVerificationError("policy", "certificate slot is not allowed by policy")
    root = _strict_certificate(anchor.root_certificate_der)
    leaf = certificates[-1]
    if len(certificate_chain[-1]) > 640 or any(len(value) > 512 for value in certificate_chain[:-1]):
        raise AuthenticationVerificationError("chain", "certificate exceeds USB profile size")
    for certificate in certificates + (root,):
        if certificate.fingerprint(hashes.SHA256()) in anchor.denied_fingerprints:
            raise AuthenticationVerificationError("trust", "certificate is locally denied")
        try:
            for extension in certificate.extensions:
                if extension.critical and isinstance(extension.value, x509.UnrecognizedExtension):
                    raise AuthenticationVerificationError("policy", "unknown critical certificate extension")
        except x509.DuplicateExtension as exc:
            raise AuthenticationVerificationError("parse", "duplicate certificate extension") from exc
    # Wire order is root-nearest intermediate first and product leaf last.
    issuers = (root,) + certificates[:-1]
    for index, (certificate, issuer) in enumerate(zip(certificates, issuers)):
        if certificate.issuer != issuer.subject:
            raise AuthenticationVerificationError("chain", "certificate chain is not in exact wire order")
        if certificate.signature_hash_algorithm.name != "sha256":
            raise AuthenticationVerificationError("policy", "certificate signature must use SHA-256")
        try:
            issuer.public_key().verify(certificate.signature, certificate.tbs_certificate_bytes, ec.ECDSA(certificate.signature_hash_algorithm))  # type: ignore[attr-defined]
        except Exception as exc:
            raise AuthenticationVerificationError("chain", "certificate signature verification failed") from exc
        is_leaf = index == len(certificates) - 1
        try:
            basic_ext = certificate.extensions.get_extension_for_oid(ExtensionOID.BASIC_CONSTRAINTS)
            usage_ext = certificate.extensions.get_extension_for_oid(ExtensionOID.KEY_USAGE)
            eku_ext = certificate.extensions.get_extension_for_oid(ExtensionOID.EXTENDED_KEY_USAGE)
            if not basic_ext.critical or basic_ext.value.ca == is_leaf or basic_ext.value.path_length is not None:
                raise AuthenticationVerificationError("policy", "Basic Constraints do not match USB profile")
            usage = usage_ext.value
            exact_usage = (
                usage.digital_signature == is_leaf and not usage.content_commitment and
                not usage.key_encipherment and not usage.data_encipherment and
                not usage.key_agreement and usage.key_cert_sign == (not is_leaf) and
                not usage.crl_sign
            )
            if not usage_ext.critical or not exact_usage:
                raise AuthenticationVerificationError("policy", "Key Usage does not exactly match USB profile")
            if not eku_ext.critical or tuple(eku_ext.value) != (USB_AUTH_EKU,):
                raise AuthenticationVerificationError("policy", "Extended Key Usage does not exactly match USB profile")
            acd_extensions = [extension for extension in certificate.extensions if extension.oid == USB_AUTH_ACD]
            if len(acd_extensions) != (1 if is_leaf else 0):
                raise AuthenticationVerificationError("policy", "ACD must appear on product leaf only")
        except x509.ExtensionNotFound as exc:
            raise AuthenticationVerificationError("policy", "certificate lacks required USB profile extensions") from exc
    if expected_vid is not None or expected_pid is not None:
        common_names = " ".join(value.value.lower() for value in leaf.subject.get_attributes_for_oid(NameOID.COMMON_NAME))
        for label, expected in (("vid", expected_vid), ("pid", expected_pid)):
            if expected is not None and f"{label}:{expected:04x}" not in common_names:
                raise AuthenticationVerificationError("policy", f"leaf common name does not match {label}")
    return leaf
