"""Coherent identity-only Cable Test snapshots for single-ended Port 1 tests."""

from dataclasses import dataclass


@dataclass(frozen=True)
class CableTestResult:
    """Insertion evidence and owned raw Vendor_Defined identity response."""

    generation: int
    outcome: str
    vconn_contact: int
    good_crc: bool
    revision: int
    body: bytes

    @classmethod
    def from_values(cls, values: list[str]) -> "CableTestResult":
        """Validate and decode one atomic CABLE:TEST? response."""
        outcomes = {
            "DISABLED", "WAITING", "DISCOVERING", "IDENTITY", "NO_RESPONSE",
            "RESPONSE_TIMEOUT", "NAK", "MALFORMED", "POWER_FAULT",
            "UNSUPPORTED_CONNECTION",
        }
        if len(values) not in (5, 6):
            raise ValueError("Invalid Cable Test snapshot")
        generation, outcome, contact, crc, revision = values[:5]
        raw = values[5] if len(values) == 6 else ""
        if (not generation.isdecimal() or outcome not in outcomes
                or contact not in ("0", "1", "2") or crc not in ("0", "1")
                or revision not in ("1", "2") or len(raw) > 56
                or len(raw) % 2 or any(c not in "0123456789abcdefABCDEF"
                                       for c in raw)):
            raise ValueError("Invalid Cable Test snapshot")
        body = bytes.fromhex(raw)
        if ((outcome == "IDENTITY" and
             (len(body) < 20 or len(body) % 4 or contact == "0"))
                or (outcome != "IDENTITY" and body)):
            raise ValueError("Inconsistent Cable Test identity")
        return cls(int(generation), outcome, int(contact), crc == "1",
                   int(revision), body)
