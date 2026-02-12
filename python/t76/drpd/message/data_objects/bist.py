"""
Copyright (c) 2025 MTA, Inc.

This module defines BIST Data Object (BISTDO) classes for USB-PD BIST messages.
BIST Data Objects are used to indicate various BIST conditions in USB-PD communications.
"""

from dataclasses import dataclass
from typing import Dict, Any, List

from .bit_helpers import _bits, _u32


# ---------------- Base class ----------------

@dataclass(frozen=True)
class BistDataObject:
    """
    Base class for a 32-bit BIST Data Object (BDO).

    USB PD R3.2 V1.1 Section 6.4.3 - BIST Message

    Layout (per USB PD Table 6.27 "BIST Data Object"):
      - Bits [31:28]: BIST Mode selector (0101b-1010b, others reserved)
      - Bits [27:0] : Reserved (must be zero per spec Section 1.4.2)

    BIST Modes Supported:
      - 0b0101 (5): BIST Carrier Mode (Mandatory) - continuous BMC carrier
      - 0b1000 (8): BIST Test Data (Mandatory) - test frame transmission
      - 0b1001 (9): BIST Shared Test Mode Entry (for Shared Capacity Groups)
      - 0b1010 (10): BIST Shared Test Mode Exit (for Shared Capacity Groups)

    Reserved modes (0b0000-0b0100, 0b0110-0b0111, 0b1011-0b1111) shall not be used
    per USB PD Section 1.4.2 and Section 6.4.3 Table 6.27.
    """
    raw: int

    @property
    def mode_code(self) -> int:
        """Bits [31:28] — BIST mode code from raw value."""
        return _bits(self.raw, 31, 28)

    @property
    def reserved_bits(self) -> int:
        """Bits [27:0] — reserved, must be 0 per USB PD spec."""
        return _bits(self.raw, 27, 0)

    @property
    def is_reserved_clean(self) -> bool:
        """True if all reserved bits [27:0] are zero (spec compliant)."""
        return self.reserved_bits == 0

    @property
    def mode_name(self) -> str:
        """Human-friendly BIST mode name (USB PD R3.2 Table 6.27)."""
        return {
            0b0101: "BIST Carrier Mode",
            0b1000: "BIST Test Data",
            0b1001: "BIST Shared Test Mode Entry",
            0b1010: "BIST Shared Test Mode Exit",
        }.get(self.mode_code, "Reserved/Unknown")

    def to_dict(self) -> Dict[str, Any]:
        """
        Serialize BIST Data Object to dictionary for logging/UI.
        Includes all fields per USB PD R3.2 Section 6.4.3 Table 6.27.
        Subclasses extend this with mode-specific descriptions and behavior.
        """
        return {
            "Mode": self.mode_name,
            "Reserved Fields Clear": self.is_reserved_clean,
        }

    def spec_warnings(self) -> List[str]:
        """
        Return list of USB PD spec compliance warnings.

        Per USB PD R3.2 Section 1.4.2 and Section 6.4.3:
        - Reserved bits [27:0] must be zero
        - Reserved mode codes (outside 0b0101, 0b1000-0b1010) shall not be used
        - Unknown mode codes are implementation-specific failures
        """
        w: List[str] = []
        if not self.is_reserved_clean:
            w.append(
                f"Spec violation: Reserved bits [27:0] must be zero (found 0x{self.reserved_bits:07X}).")

        valid_modes = {0b0101, 0b1000, 0b1001, 0b1010}
        if self.mode_code not in valid_modes:
            w.append(f"Spec violation: Mode code 0b{self.mode_code:04b} ({self.mode_code}) is reserved/unknown. "
                     f"Valid modes per Section 6.4.3: 0b0101, 0b1000, 0b1001, 0b1010.")

        return w

    def encode(self) -> bytes:
        """Encode the BIST Data Object as 4 bytes (little-endian)."""
        return self.raw.to_bytes(4, byteorder="little")

    @staticmethod
    def from_raw(raw: int) -> "BistDataObject":
        """
        Factory method that creates appropriate BIST subclass.

        Per USB PD R3.2 Section 6.4.3 Table 6.27, routes to specific
        BIST mode handler based on bits [31:28]. Unknown/reserved codes
        fall back to BistReservedOrUnknown for safety.

        Args:
            raw: 32-bit BIST Data Object value

        Returns:
            Appropriate BistDataObject subclass instance based on mode code.
        """
        raw = _u32(raw)
        code = _bits(raw, 31, 28)
        if code == 0b0101:
            return BistCarrierMode(raw)
        if code == 0b1000:
            return BistTestData(raw)
        if code == 0b1001:
            return BistSharedTestModeEntry(raw)
        if code == 0b1010:
            return BistSharedTestModeExit(raw)
        return BistReservedOrUnknown(raw)


# ---------------- Concrete modes ----------------

@dataclass(frozen=True)
class BistCarrierMode(BistDataObject):
    """
    BIST Carrier Mode (Mode Code 0101b = 5).

    USB PD R3.2 V1.1 Section 6.4.3.1 - BIST Carrier Mode

    Purpose:
      Request the UUT (Unit Under Test) to transmit a continuous string
      of BMC encoded alternating "1"s and "0"s for PHY layer testing.

    Behavior:
      - UUT generates continuous BMC encoded test pattern
      - Duration: within tBISTContMode of enablement (compliance test timing)
      - After timeout: UUT exits BIST and returns to normal operation
      - Supported: Mandatory for all ports at vSafe5V

    Applicability:
      - Mandatory per USB PD R3.2 Section 6.4.3
      - Only valid when operating at vSafe5V
      - If received at other voltages: message is ignored
    """

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update(
            mode_description="BIST Carrier Mode",
            behavior="Transmit continuous BMC carrier pattern",
            duration_timer="Automatic timeout",
            exit_behavior="Returns to normal operation after timeout",
            applicability="Mandatory at vSafe5V",
        )
        return d


@dataclass(frozen=True)
class BistTestData(BistDataObject):
    """
    BIST Test Data Mode (Mode Code 1000b = 8).

    USB PD R3.2 V1.1 Section 6.4.3.2 - BIST Test Data Mode

    Purpose:
      Request the UUT to enter test data mode for PHY compliance testing.
      Defined in USB PD Section 5.9.2 "BIST Test Data Mode".

    Behavior:
      - UUT returns GoodCRC acknowledgment
      - Enters BIST Test Data Mode (responses limited to GoodCRC only)
      - Ignores all other received messages except Hard Reset
      - No other messages are transmitted beyond GoodCRC responses

    Exit Conditions:
      - Hard Reset Signaling: Resets UUT and exits BIST mode
      - Cable/device detach
      - Power removal

    Applicability:
      - Mandatory per USB PD R3.2 Section 6.4.3
      - Only valid when operating at vSafe5V
      - If received at other voltages: message is ignored
    """

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update(
            mode_description="BIST Test Data Mode",
            behavior="GoodCRC-only responses until termination",
            first_response="GoodCRC to BIST Test Data message",
            subsequent_responses="GoodCRC only (no other PD messages)",
            exit_trigger="Hard Reset Signaling",
            applicability="Mandatory at vSafe5V",
        )
        return d


@dataclass(frozen=True)
class BistSharedTestModeEntry(BistDataObject):
    """
    BIST Shared Capacity Test Mode - ENTRY (Mode Code 1001b = 9).

    USB PD R3.2 V1.1 Section 6.4.3.3.1 - BIST Shared Test Mode Entry

    Purpose:
      Enter compliance test mode for multi-port Shared Capacity Groups.
      Disables power sharing management for full capability testing.

    Applicability:
      - UUTs with ports in a Shared Capacity Group only
      - Master Ports in the group recognize this command
      - Non-Master Ports: do not enter compliance mode
      - Only valid in PE_SRC_Ready state
      - Only valid at vSafe5V

    Behavior:
      - Master Ports enter BIST Shared Capacity Test Mode
      - All shared power management is disabled
      - Each Port in group offers maximum Source Capabilities (unconditional)
      - UUT returns GoodCRC acknowledgment
      - Within tBISTSharedTestMode: send new Source_Capabilities Message

    Exit:
      - Only via BIST Shared Test Mode Exit message
      - Or power off/attach/detach

    Constraint:
      - Tester shall not exceed shared capacity during test
    """

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update(
            mode_description="BIST Shared Capacity Test Mode Entry",
            behavior="Disable power sharing, offer max capabilities on all ports",
            applicability="Shared Capacity Group - Master Ports only",
            valid_states="PE_SRC_Ready state at vSafe5V",
            response="GoodCRC, then Source_Capabilities within tBISTSharedTestMode",
            shared_capacity=True,
            exit_method="BIST Shared Test Mode Exit message or power loss",
            constraint="Tester must not exceed shared capacity",
        )
        return d


@dataclass(frozen=True)
class BistSharedTestModeExit(BistDataObject):
    """
    BIST Shared Capacity Test Mode - EXIT (Mode Code 1010b = 10).

    USB PD R3.2 V1.1 Section 6.4.3.3.2 - BIST Shared Test Mode Exit

    Purpose:
      Exit BIST Shared Capacity Test Mode and return to normal operation.
      Re-enable power sharing management across Shared Capacity Group.

    Applicability:
      - UUTs with ports in a Shared Capacity Group only
      - Master Ports in the group recognize this command
      - Non-Master Ports: should not exit on receipt
      - Only valid when in BIST Shared Capacity Test Mode

    Behavior:
      - Master Ports exit BIST Shared Capacity Test Mode
      - Power sharing management re-enabled
      - UUT returns GoodCRC acknowledgment
      - Post-exit options:
        * May send new Source_Capabilities Message to each Port
        * May perform ErrorRecovery on each Port

    Important Notes:
      - Non-Message traffic (PD messages other than BIST Shared Test Mode Exit)
        received during BIST mode does NOT trigger auto-exit
      - UUT exits if powered off
      - UUT remains in BIST mode for PD events (Hard Reset, Cable Reset, etc.)
        unless Exit message received
      - UUT may exit if Tester makes request exceeding UUT capabilities
    """

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update(
            mode_description="BIST Shared Capacity Test Mode Exit",
            behavior="Exit compliance mode, re-enable power sharing",
            applicability="Shared Capacity Group - Master Ports only",
            response="GoodCRC acknowledgment",
            post_exit_actions="Send new Source_Capabilities or perform ErrorRecovery",
            shared_capacity=True,
            auto_exit_behavior="Does not exit on other PD messages; only on Exit command or power loss",
            non_master_behavior="Non-Master Ports should not exit (spec guidance)",
        )
        return d


@dataclass(frozen=True)
class BistReservedOrUnknown(BistDataObject):
    """
    Reserved or Unknown BIST mode code.

    USB PD R3.2 V1.1 Section 6.4.3 Table 6.27

    Per USB PD R3.2 Section 1.4.2:
      Mode codes outside the defined set (0b0101, 0b1000-0b1010) are
      reserved and shall not be used. Reserved values must be treated
      as protocol violations.

    Reserved Ranges:
      - 0b0000-0b0100: Reserved, Shall Not be used
      - 0b0110-0b0111: Reserved, Shall Not be used
      - 0b1011-0b1111: Reserved, Shall Not be used

    Handling:
      - Device behavior is implementation-specific
      - BIST Message should be ignored when received
      - No defined response behavior
      - Tester should not send reserved codes
    """

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update(
            mode_description="Unknown BIST mode",
            behavior="Should be ignored",
            handling="Implementation-specific (typically ignored)",
            compliance="Non-compliant message - device shall ignore"
        )
        return d
