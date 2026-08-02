---
title: Type-C authentication policy
sidebar_position: 20
---

# Type-C authentication policy

This document fixes the security and trust boundary for the automated **Authenticate source** inquiry. The inquiry is an inspection tool. It reports evidence for every advertised certificate slot; it never changes the active power contract or silently treats protocol success as trust.

## Normative profile

Dr. PD implements USB Type-C Authentication 1.0 over USB Power Delivery `Security_Request` and `Security_Response` Extended Messages. It supports the `GET_DIGESTS`, `GET_CERTIFICATE`, and `CHALLENGE` operations for an SOP Source.

The accepted cryptographic profile is fixed to:

- X.509 v3 certificates encoded as strict DER;
- SHA-256 digests;
- ECDSA over NIST P-256 (`secp256r1`);
- uncompressed public points; and
- the USB authentication certificate-chain and challenge transcript formats.

Unsupported versions, algorithms, encodings, reserved values, trailing bytes, or non-canonical DER fail validation. Parser tolerance must not broaden the trust decision.

## Trust anchors and chain building

No trust anchor is bundled or inherited from the operating-system or Web PKI store. A chain is trusted only when its 32-byte `RootHash` matches an explicitly configured anchor for the selected policy. Merely being self-consistent, using slots 0–3, or claiming a USB-IF name is not trust.

The frontend inquiry operates in `inspect` mode. It performs all protocol and cryptographic checks possible with the returned chain and challenge, but always reports trust and policy as `not evaluated` because the Source does not return its root certificate and the inquiry does not prompt for or assume a trust anchor.

The lower-level verifier can apply caller-supplied anchors, but that is not part of this automated menu action. No trust anchor is bundled, inferred, or inherited from the operating-system or Web PKI store.

An anchor record contains a stable caller-defined identifier, the exact DER root certificate, an allowed-slot class (`usb-if`, slots 0–3; `private`, slots 4–7; or an explicit slot list), and optional allowed leaf VID/PID pairs. Its key is `SHA-256(root DER)`, compared byte-for-byte with the wire `RootHash`. A `usb-if` classification is caller configuration, not something inferred from a certificate name. A local denylist contains SHA-256 fingerprints of root, intermediate, or leaf DER certificates and takes precedence over every anchor allow. The USB ACD is decoded and reported; it affects allow/deny only when the selected anchor record contains explicit ACD constraints. Missing or unknown constrained claims deny rather than wildcard-match.

Verification is offline and deterministic. Dr. PD does not fetch certificates, AIA resources, CRLs, OCSP responses, or anchors from the network. The returned chain omits the root certificate, so the configured anchor must contain the root certificate needed to verify the first returned certificate. Chain order is exactly the wire order; alternate-chain search is not performed.

The verifier enforces the USB profile: certificate size and 4096-byte chain bounds, signature chain, Basic Constraints, Key Usage, critical USB-Auth Extended Key Usage `2.23.145.1.1`, leaf USB-IF ACD `2.23.145.1.2`, common-name VID/PID rules, and the slot/root constraints. Unknown critical extensions fail. Product certificate `notBefore` and `notAfter` values are parsed but, as directed by the USB Authentication 1.0 product profile, do not affect the verdict.

Revocation is not defined by the wire exchange and no online revocation check is made. A configured anchor may be locally disabled or accompanied by a local denylist of certificate fingerprints. When no applicable revocation data is configured, the result says `revocation: not checked`; it must not say `good`.

## Challenge freshness and verification

Each challenge uses a newly generated 32-byte nonce from the host platform cryptographic random-number generator. A nonce belongs to one workflow run, one attachment generation, one source, and one certificate slot. It is never reused after retry, detach, reset, cancellation, or supersession.

The verifier requires the response slot to equal the selected slot and its bit to be set in the returned slot mask. Other mask bits may differ from the earlier `DIGESTS` response, but that change is reported. It also checks the certificate-chain hash, the all-zero PD Source context hash, and the 64-byte little-endian `r || s` ECDSA signature over the exact 36-byte request followed by the first 104 bytes of the response. Verification uses the public key in the selected leaf certificate. Any mismatch is terminal for that attempt.

## Workflow and bounds

The host owns the multistep workflow. Firmware performs exactly one atomic AMS per request and returns the logical response body.

The runner:

1. reads digests and selects every populated slot, bounded to the eight protocol slots;
2. retrieves the certificate chain in bounded parts, requiring the returned slot and request ID to correlate while retaining the requested offset in host workflow state;
3. verifies total length, segment progress, chain digest, certificates, and configured trust anchor; then
4. sends a fresh challenge and verifies the response.

Certificate retrieval first requests the 36-byte chain header so it cannot overrun a short chain whose length is not yet known. It then requests contiguous segments of exactly `min(256, remaining)`, and each successful response must return exactly that length. Retrieval stops at 4096 bytes and at most 17 successful requests: one header plus at most 16 data requests. A response cannot supply an offset, so overlap/gap protection comes from request-ID correlation, the retained requested offset, exact response length, and append-only assembly.

Each atomic step permits at most three attempts, including `BUSY`. Thus certificate retrieval permits at most 51 atomic attempts for its 17 successful requests. Each retry creates a new request ID; challenge retry also creates a new nonce. After the retry budget is exhausted, the runner records the current slot as failed or indeterminate and continues with the next populated slot. A failure never skips certificate validation and then challenges that same slot. Digest discovery failure, detach, reset, cancellation, collision, or supersession stops the workflow.

Firmware applies operation-specific response deadlines from the authentication profile: 200 ms for potentially chunked digest and certificate responses, and 1200 ms for a potentially chunked challenge response. A complete unchunked response may use the shorter 40 ms and 1000 ms limits respectively only when transport can determine that form without weakening chunked interoperability.

## Verdicts and side effects

Results keep these layers separate:

- **Transport**: request accepted, response, USB-PD rejection, timeout, reset, detach, or collision.
- **Protocol**: authentication message type, version, fields, bounds, and request correlation.
- **Cryptographic**: chain digest, certificate signatures/profile, challenge transcript, and challenge signature.
- **Trust**: configured anchor and local denylist decision.
- **Policy**: caller-selected rule applied to the verified identity and ACD claims.

Every failure identifies its layer and preserves decoded fields plus raw logical response bytes. `Not_Supported`, `ERROR`, malformed input, missing anchor, unchecked revocation, and an unknown policy never become authenticated success.

Authentication is observational in this feature. It does not renegotiate power, alter advertised capabilities, authorize USB data, or persist a trust verdict across detach. Host/UI history may persist for inspection, but every verdict is tied to the attachment generation, source identity evidence, slot, firmware SHA, and request IDs that produced it.

## References

- USB-IF, *USB Type-C Authentication Specification*, Revision 1.0 with ECN and Errata through July 24, 2017, sections 2–6 and 8.
- USB-IF, *USB Power Delivery Specification*, Revision 3.2, sections defining `Security_Request` and `Security_Response` Extended Messages.
