"""
Copyright (c) 2025 MTA, Inc.

This module defines classes for decoding and representing USB Power Delivery (USB-PD)
Power Data Objects (PDOs) used in Source_Capabilities messages. It includes support
for Fixed, Variable, Battery, and various types of Augmented PDOs (APDOs).

USB PD R3.2 V1.1 Specification References:
  - Section 6.4.1: Capabilities Message
  - Section 6.4.1.1-6.4.1.3: Power Data Objects
  - Section 6.4.1.4: APDO structure
  - Table 6.7-6.15: PDO/APDO definitions
"""

from dataclasses import dataclass
from typing import Dict, Any

from .bit_helpers import _bits, _u32
from enum import Enum


class PDOType(Enum):
    FIXED = "Fixed"
    VARIABLE = "Variable"
    BATTERY = "Battery"
    APDO = "APDO"


@dataclass(frozen=True)
class SourcePDO:
    """
    Base class for all Source Power Data Objects (PDO/APDO).

    USB PD R3.2 V1.1 Section 6.4.1 - Capabilities Message

    Each instance wraps a 32-bit PDO/APDO value from a Source_Capabilities message.
    Subclasses provide typed accessors for their respective fields and units.

    PDO Types (bits [31:30]):
      - 0b00: Fixed Supply PDO (Section 6.4.1.2.1 Table 6.9)
      - 0b01: Variable Supply or Battery Supply PDO (Tables 6.11-6.12)
      - 0b10: Battery Supply PDO
      - 0b11: APDO - SPR PPS (0b00), SPR AVS (0b10), EPR AVS (0b01) (Tables 6.13-6.15)

    Args:
        raw (int): 32-bit PDO/APDO value as received on the wire.
    """

    raw: int

    # ---------- Common helpers ----------

    @property
    def pdo_type(self) -> PDOType:
        """PDO/APDO major type decoded from bits [31:30]. Returns a PDOType enum value."""
        t = _bits(self.raw, 31, 30)
        return {
            0b00: PDOType.FIXED,
            0b01: PDOType.VARIABLE,
            0b10: PDOType.BATTERY,
            0b11: PDOType.APDO,
        }[t]

    def to_dict(self) -> Dict[str, Any]:
        """
        Serialize this PDO/APDO to a plain dict with human units (V, A, W) and flags.
        Includes raw value and type information per spec table requirements.
        Subclasses extend this with their specific fields.
        """
        return {
            "Power Data Object Type": self.pdo_type.value,
        }

    def supports(self, voltage: float, current: float) -> bool:
        """
        Return True if this advertised PDO/APDO can satisfy the given (voltage, current) need.

        Semantics per subclass (USB PD R3.2 Section 6.4.1.2-6.4.1.4):
        - Fixed: voltage must match the fixed voltage (within 0.05 V step), current <= Imax.
        - Variable: Vmin <= voltage <= Vmax and current <= Imax.
        - Battery: Vmin <= voltage <= Vmax and (voltage * current) <= Pmax.
        - SPR PPS: Vmin <= voltage <= Vmax and current <= Imax (Section 6.4.1.2.4.1).
        - SPR AVS: 9–15 V uses Imax_15; 15–20 V uses Imax_20 (Section 6.4.1.2.4.2).
        - EPR AVS: Vmin <= voltage <= Vmax and current <= (PDP / voltage) (Section 6.4.1.2.4.3).
        """

        raise NotImplementedError

    def encode(self) -> bytes:
        """Encode the SourcePDO as 4 bytes (little-endian)."""
        return self.raw.to_bytes(4, byteorder="little")

    @staticmethod
    def from_raw(raw: int) -> "SourcePDO":
        """
        Factory: decode the top bits and return the proper subclass instance.

        Per USB PD R3.2 Section 6.4.1 Table 6.7 and Table 6.8:
        Routes to appropriate PDO/APDO subclass based on bits [31:30] and [29:28].

        Handles:
          - Fixed Supply PDO (bit pattern 00b at [31:30])
          - Variable Supply (non-Battery) PDO (bit pattern 01b at [31:30])
          - Battery Supply PDO (bit pattern 10b at [31:30])
          - APDO: SPR PPS (11b, 00b), SPR AVS (11b, 10b), EPR AVS (11b, 01b)
        """
        raw = _u32(raw)
        t = _bits(raw, 31, 30)
        if t == 0b00:
            return FixedSupplyPDO(raw)
        if t == 0b01:
            return VariableSupplyPDO(raw)
        if t == 0b10:
            return BatterySupplyPDO(raw)
        # APDO
        apdo_kind = _bits(raw, 29, 28)
        if apdo_kind == 0b00:
            return SPRPpsApdo(raw)
        if apdo_kind == 0b10:
            return SPRAvsApdo(raw)
        if apdo_kind == 0b01:
            return EPRAvsApdo(raw)
        # Reserved/unknown APDO (still return base type for visibility)
        return UnknownApdo(raw)


# ---------------------- Fixed Supply PDO (Source) ----------------------

@dataclass(frozen=True)
class FixedSupplyPDO(SourcePDO):
    """
    Fixed Supply PDO for Source (bits per USB PD R3.2 V1.1 Table 6.9).

    USB PD R3.2 V1.1 Section 6.4.1.2.1 - Fixed Supply Power Data Object

    Used to expose well-regulated fixed voltage power supplies. The vSafe5V
    (5V) Fixed Supply PDO is mandatory and always the first PDO in any
    Source_Capabilities Message.

    Fields (per Table 6.9):
      - Voltage: bits [19:10], 50 mV units (mandatory in all Fixed PDOs)
      - Max Current: bits [9:0], 10 mA units
      - Dual-Role Power: bit 29 (set for DRPs per Section 6.4.1.2.1.1)
      - USB Suspend Supported: bit 28
      - Unconstrained Power: bit 27 (for external power sources)
      - USB Communications Capable: bit 26 (for USB data lines)
      - Dual-Role Data: bit 25 (set for DRD capable per Section 6.4.1.2.1.5)
      - Unchunked Extended Messages: bit 24 (for >26-byte extended messages)
      - EPR Capable: bit 23 (set if source can operate in EPR mode)
      - Peak Current Code: bits [21:20] (per Table 6.10 for overload capability)
      - Bits [22] and [31:30]: Format identifier (00b)

    Special Notes:
      - For vSafe5V PDO only: bits [29:23] convey additional info per Section 6.4.1.2.1
      - For other Fixed PDOs: bits [29:23] shall be zero
      - Peak Current field indicates overload capability (see Table 6.10)
      - Reserved bit 22 shall be zero
    """

    # --- Flags / capability bits ---

    @property
    def dual_role_power(self) -> bool:
        """Bit 29: Dual-Role Power capability flag (Section 6.4.1.2.1.1)."""
        return bool(_bits(self.raw, 29, 29))

    @property
    def usb_suspend_supported(self) -> bool:
        """Bit 28: USB Suspend supported flag (Section 6.4.1.2.1)."""
        return bool(_bits(self.raw, 28, 28))

    @property
    def unconstrained_power(self) -> bool:
        """Bit 27: Unconstrained Power flag (Section 6.4.1.2.1.2)."""
        return bool(_bits(self.raw, 27, 27))

    @property
    def usb_comm_capable(self) -> bool:
        """Bit 26: USB Communications Capable flag (Section 6.4.1.2.1.4)."""
        return bool(_bits(self.raw, 26, 26))

    @property
    def dual_role_data(self) -> bool:
        """Bit 25: Dual-Role Data flag (Section 6.4.1.2.1.5)."""
        return bool(_bits(self.raw, 25, 25))

    @property
    def unchunked_ext_supported(self) -> bool:
        """Bit 24: Unchunked Extended Messages Supported flag (Section 6.4.1.2.1.6)."""
        return bool(_bits(self.raw, 24, 24))

    @property
    def epr_capable(self) -> bool:
        """Bit 23: EPR Capable flag - Source can operate in EPR mode (Section 6.4.1.2.1.7)."""
        return bool(_bits(self.raw, 23, 23))

    # --- Numeric fields ---

    @property
    def peak_current_code(self) -> int:
        """Bits [21:20]: Peak current capability code (Table 6.10 - source-dependent table)."""
        return _bits(self.raw, 21, 20)

    @property
    def voltage(self) -> float:
        """Bits [19:10]: Fixed output voltage, in volts (50 mV units)."""
        return _bits(self.raw, 19, 10) * 0.05

    @property
    def max_current(self) -> float:
        """Bits [9:0]: Maximum source current, in amps (10 mA units)."""
        return _bits(self.raw, 9, 0) * 0.01

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update({
            "Voltage": f"{self.voltage}V",
            "Max Current": f"{self.max_current}A",
            "Max Power": f"{self.voltage * self.max_current:.2f}W",
            "Dual Role Power": self.dual_role_power,
            "USB Suspend Supported": self.usb_suspend_supported,
            "Unconstrained Power": self.unconstrained_power,
            "USB Communications Capable": self.usb_comm_capable,
            "Dual Role Data": self.dual_role_data,
            "Unchunked Extended Messages": self.unchunked_ext_supported,
            "EPR Capable": self.epr_capable,
            "Peak Current Capability": self.peak_current_code,
        })
        return d

    def __repr__(self) -> str:
        return f"FixedSupplyPDO(raw=0x{self.raw:08X}, voltage={self.voltage}V, max_current={self.max_current}A, power={self.voltage * self.max_current:.2f}W)"

    def supports(self, voltage: float, current: float) -> bool:
        # Accept within one LSB of the encoded granularity (50 mV)
        return abs(voltage - self.voltage) <= 0.05 and current <= self.max_current


# ---------------------- Variable Supply (non-Battery) PDO (Source) ----------------------

@dataclass(frozen=True)
class VariableSupplyPDO(SourcePDO):
    """
    Variable Supply (non-Battery) PDO for Source.

    USB PD R3.2 V1.1 Section 6.4.1.2.2 - Variable Supply (non-Battery) Power Data Object

    Used for poorly regulated power supplies with a defined voltage range.
    Allows specifying voltage flexibility and corresponding current capability.

    Fields (per Table 6.11):
      - Maximum Voltage: bits [29:20], 50 mV units
      - Minimum Voltage: bits [19:10], 50 mV units
      - Maximum Current: bits [9:0], 10 mA units
      - Bits [31:30]: Format identifier (01b)

    Constraints:
      - Absolute voltage including variation must be within Min/Max range
      - Source must be capable of supplying specified current over entire voltage range
    """

    @property
    def max_voltage(self) -> float:
        """Bits [29:20]: Maximum voltage, volts (50 mV units)."""
        return _bits(self.raw, 29, 20) * 0.05

    @property
    def min_voltage(self) -> float:
        """Bits [19:10]: Minimum voltage, volts (50 mV units)."""
        return _bits(self.raw, 19, 10) * 0.05

    @property
    def max_current(self) -> float:
        """Bits [9:0]: Maximum current, amps (10 mA units)."""
        return _bits(self.raw, 9, 0) * 0.01

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update({
            "Min Voltage": f"{self.min_voltage:.2f}V",
            "Max Voltage": f"{self.max_voltage:.2f}V",
            "Voltage Range": f"{self.min_voltage:.2f}V - {self.max_voltage:.2f}V",
            "Max Current": f"{self.max_current:.2f}A",
            "Max Power @ Min Voltage": f"{self.min_voltage * self.max_current:.2f}W",
            "Max Power @ Max Voltage": f"{self.max_voltage * self.max_current:.2f}W",
        })
        return d

    def __repr__(self) -> str:
        return f"VariableSupplyPDO(raw=0x{self.raw:08X}, min_voltage={self.min_voltage}V, max_voltage={self.max_voltage}V, max_current={self.max_current}A)"

    def supports(self, voltage: float, current: float) -> bool:
        return (self.min_voltage <= voltage <= self.max_voltage) and (current <= self.max_current)


# ---------------------- Battery Supply PDO (Source) ----------------------

@dataclass(frozen=True)
class BatterySupplyPDO(SourcePDO):
    """
    Battery Supply PDO for Source.

    USB PD R3.2 V1.1 Section 6.4.1.2.3 - Battery Supply Power Data Object

    Used to expose batteries that can be directly connected to VBUS.
    Voltage fields represent battery's voltage range.

    Fields (per Table 6.12):
      - Maximum Voltage: bits [29:20], 50 mV units
      - Minimum Voltage: bits [19:10], 50 mV units
      - Maximum Allowable Power: bits [9:0], 250 mW units
      - Bits [31:30]: Format identifier (10b)

    Constraints:
      - Battery shall be capable of supplying specified power over entire voltage range
      - Absolute voltage including variation must be within Min/Max range
      - Unlike other PDOs, uses POWER (not current) for specification
    """

    @property
    def max_voltage(self) -> float:
        """Bits [29:20]: Maximum voltage, volts (50 mV units)."""
        return _bits(self.raw, 29, 20) * 0.05

    @property
    def min_voltage(self) -> float:
        """Bits [19:10]: Minimum voltage, volts (50 mV units)."""
        return _bits(self.raw, 19, 10) * 0.05

    @property
    def max_power(self) -> float:
        """Bits [9:0]: Maximum allowable power, watts (250 mW units)."""
        return _bits(self.raw, 9, 0) * 0.25

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update({
            "Min Voltage": f"{self.min_voltage:.2f}V",
            "Max Voltage": f"{self.max_voltage:.2f}V",
            "Voltage Range": f"{self.min_voltage:.2f}V - {self.max_voltage:.2f}V",
            "Max Power": f"{self.max_power:.2f}W",
            "Max Current @ Min Voltage": f"{self.max_power / self.min_voltage:.2f}A" if self.min_voltage > 0 else "N/A",
            "Max Current @ Max Voltage": f"{self.max_power / self.max_voltage:.2f}A" if self.max_voltage > 0 else "N/A",
        })
        return d

    def __repr__(self) -> str:
        return f"BatterySupplyPDO(raw=0x{self.raw:08X}, min_voltage={self.min_voltage}V, max_voltage={self.max_voltage}V, max_power={self.max_power}W)"

    def supports(self, voltage: float, current: float) -> bool:
        return (self.min_voltage <= voltage <= self.max_voltage) and ((voltage * current) <= self.max_power)


# ---------------------- SPR PPS APDO (Source) ----------------------

@dataclass(frozen=True)
class SPRPpsApdo(SourcePDO):
    """
    SPR Programmable Power Supply (PPS) APDO.

    USB PD R3.2 V1.1 Section 6.4.1.4.1 - SPR PPS APDO (Table 6.13)

    Augmented PDO for programmable voltage supply in Standard Power Range (5-20V).
    Allows source to adjust voltage in 20 mV steps within specified range.

    Fields (per Table 6.13):
      - PPS Power Limited: bit [27], indicates power limitation
      - Maximum Voltage: bits [24:17], 100 mV units  
      - Minimum Voltage: bits [15:8], 100 mV units
      - Maximum Current: bits [6:0], 50 mA units
      - Reserved bits [31:28]=0b0010, [26:25]=0b00, [16]=0b0, [7]=0b0
      - Bits [31:30]: Format identifier (11b = APDO)

    Constraints:
      - Voltage range must be between 5V and 20V (SPR limits)
      - 20 mV voltage step granularity supported
      - Maximum voltage must be >= minimum voltage
      - Power Limited flag indicates source cannot sustain max current across entire range

    PPS allows charging optimization by negotiating exact voltage/current needed
    rather than fixed discrete power levels.
    """

    @property
    def pps_power_limited(self) -> bool:
        """Bit 27: PPS Power Limited flag - source cannot sustain max current across voltage range."""
        return bool(_bits(self.raw, 27, 27))

    @property
    def reserved_bits_ok(self) -> bool:
        """Verify reserved bits [26:25], [16], and [7] are 0 per spec compliance."""
        return (_bits(self.raw, 26, 25) == 0 and
                _bits(self.raw, 16, 16) == 0 and
                _bits(self.raw, 7, 7) == 0)

    @property
    def max_voltage(self) -> float:
        """Bits [24:17]: Maximum voltage, volts (100 mV units)."""
        return _bits(self.raw, 24, 17) * 0.1

    @property
    def min_voltage(self) -> float:
        """Bits [15:8]: Minimum voltage, volts (100 mV units)."""
        return _bits(self.raw, 15, 8) * 0.1

    @property
    def max_current(self) -> float:
        """Bits [6:0]: Maximum current, amps (50 mA units)."""
        return _bits(self.raw, 6, 0) * 0.05

    @property
    def max_power_at_max_voltage(self) -> float:
        """Maximum power when sourcing at maximum voltage (simplified, ignores power limitation)."""
        return self.max_voltage * self.max_current

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update({
            "Min Voltage": f"{self.min_voltage:.2f}V",
            "Max Voltage": f"{self.max_voltage:.2f}V",
            "Voltage Range": f"{self.min_voltage:.2f}V - {self.max_voltage:.2f}V",
            "Max Current": f"{self.max_current:.2f}A",
            "Max Power @ Max Voltage": f"{self.max_power_at_max_voltage:.2f}W",
            "PPS Power Limited": self.pps_power_limited,
        })
        return d

    def __repr__(self) -> str:
        return f"SPRPpsApdo(raw=0x{self.raw:08X}, {self.min_voltage}V-{self.max_voltage}V, {self.max_current}A, power_limited={self.pps_power_limited})"

    def supports(self, voltage: float, current: float) -> bool:
        """Check if this PPS APDO can support the requested voltage and current."""
        return (self.min_voltage <= voltage <= self.max_voltage) and (current <= self.max_current)


# ---------------------- SPR AVS APDO (Source) ----------------------

@dataclass(frozen=True)
class SPRAvsApdo(SourcePDO):
    """
    SPR Adjustable Voltage Supply (AVS) APDO.

    USB PD R3.2 V1.1 Section 6.4.1.4.2 - SPR AVS APDO (Table 6.14)

    Augmented PDO for adjustable voltage supply in Standard Power Range.
    Supports two voltage bands with different current limits:
    - 9-15V band (lower voltage, higher current capability typically)
    - 15-20V band (higher voltage, potentially lower current)

    Fields (per Table 6.14):
      - Peak Current Code: bits [27:26], overload capability (Table 6.10)
      - Minimum Voltage: bits [25:20], 100 mV units (typically 15V minimum for AVS)
      - Maximum Current 9-15V: bits [19:10], 10 mA units
      - Maximum Current 15-20V: bits [9:0], 10 mA units (0 = not supported)
      - Reserved bits [31:28]=0b0010, [16]=0b0
      - Bits [31:30]: Format identifier (11b = APDO)

    Constraints:
      - Minimum voltage normally >=15V to avoid overlap with PPS
      - If max_current_20V is 0, the 15-20V band is not supported
      - Different current limits for each band allow independent negotiation
      - Peak current code indicates short-term overload capability per Table 6.10

    AVS allows sources to offer different power delivery strategies across
    voltage bands, useful for supply designs optimized for specific ranges.
    """

    @property
    def peak_current_code(self) -> int:
        """Bits [27:26]: Peak current code (same coding as fixed PDO peak current, Table 6.10)."""
        return _bits(self.raw, 27, 26)

    @property
    def min_voltage(self) -> float:
        """Bits [25:20]: Minimum voltage, volts (100 mV units). Typically >= 15V for SPR AVS."""
        return _bits(self.raw, 25, 20) * 0.1

    @property
    def max_current_15V(self) -> float:
        """Bits [19:10]: Max current for 9–15 V band, amps (10 mA units)."""
        return _bits(self.raw, 19, 10) * 0.01

    @property
    def max_current_20V(self) -> float:
        """Bits [9:0]: Max current for 15–20 V band, amps (10 mA units). Zero means band not supported."""
        return _bits(self.raw, 9, 0) * 0.01

    def max_power_at(self, voltage: float) -> float:
        """Calculate maximum power at requested voltage based on applicable current limit."""
        if voltage <= 15.0:
            return voltage * self.max_current_15V
        elif self.max_current_20V > 0:
            return voltage * self.max_current_20V
        else:
            return 0.0

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update({
            "Min Voltage": f"{self.min_voltage:.2f}V",
            "9-15V Band Max Current": f"{self.max_current_15V:.2f}A",
            "15-20V Band Max Current": f"{self.max_current_20V:.2f}A",
            "15-20V Band Supported": self.max_current_20V > 0,
            "Max Power @ 15V": f"{self.max_power_at(15.0):.2f}W",
            "Max Power @ 20V": f"{self.max_power_at(20.0):.2f}W" if self.max_current_20V > 0 else "Not supported",
            "Peak Current Capability": self.peak_current_code,
        })
        return d

    def __repr__(self) -> str:
        return f"SPRAvsApdo(raw=0x{self.raw:08X}, min_voltage={self.min_voltage}V, 9-15V:{self.max_current_15V}A, 15-20V:{self.max_current_20V}A)"

    def supports(self, voltage: float, current: float) -> bool:
        """Check if this AVS APDO can support the requested voltage and current."""
        # Note: SPR AVS typically supports 15V-20V range (sometimes 9V+)
        # The 9-15V band is available if min_voltage <= 9.0 or in 9-15V range
        if voltage <= 15.0:
            return voltage >= self.min_voltage and current <= self.max_current_15V
        if 15.0 < voltage <= 20.0:
            return (self.max_current_20V > 0.0) and (current <= self.max_current_20V)
        return False


# ---------------------- EPR AVS APDO (Source) ----------------------

@dataclass(frozen=True)
class EPRAvsApdo(SourcePDO):
    """
    EPR Adjustable Voltage Supply (AVS) APDO.

    USB PD R3.2 V1.1 Section 6.4.1.4.3 - EPR AVS APDO (Table 6.15)

    Augmented PDO for adjustable voltage supply in Extended Power Range (20-48V).
    Defines voltage range and power delivery via Port Data Power (PDP) specification.
    Actual current at any voltage is derived from PDP / voltage (up to peak limits).

    Fields (per Table 6.15):
      - Peak Current Code: bits [27:26], EPR overload capability (Table 6.16)
      - Maximum Voltage: bits [25:17], 100 mV units (up to 48V)
      - Minimum Voltage: bits [15:8], 100 mV units (minimum 20V for EPR)
      - Port Data Power (PDP): bits [7:0], 1W units (max 240W for EPR)
      - Reserved bits [31:28]=0b0010, [16]=0b0
      - Bits [31:30]: Format identifier (11b = APDO)

    Constraints:
      - Minimum voltage must be >= 20V (EPR minimum)
      - Maximum voltage must be <= 48V (EPR maximum)
      - PDP is the maximum continuous power the source can deliver
      - Actual current = min(PDP / voltage, peak overload current from peak_current_code)
      - Maximum source current in EPR is typically 5A continuous

    EPR enables high-power delivery for demanding applications:
      - 48V @ 5A = 240W maximum
      - Power is voltage-independent when specified as PDP
      - Replaces PPS for extended voltage/power range
    """

    @property
    def peak_current_code(self) -> int:
        """Bits [27:26]: EPR AVS peak current code per Table 6.16 for overload capability."""
        return _bits(self.raw, 27, 26)

    @property
    def reserved_bits_ok(self) -> bool:
        """Verify reserved bit [16] is 0 per spec compliance."""
        return _bits(self.raw, 16, 16) == 0

    @property
    def max_voltage(self) -> float:
        """Bits [25:17]: Maximum voltage, volts (100 mV units). Must be <= 48V for EPR."""
        return _bits(self.raw, 25, 17) * 0.1

    @property
    def min_voltage(self) -> float:
        """Bits [15:8]: Minimum voltage, volts (100 mV units). Must be >= 20V for EPR."""
        return _bits(self.raw, 15, 8) * 0.1

    @property
    def pdp(self) -> float:
        """Bits [7:0]: Port Data Power (PDP), watts (1 W units). Max 240W for EPR."""
        return _bits(self.raw, 7, 0) * 1.0

    def max_current_at(self, voltage: float) -> float:
        """
        Compute the maximum continuous current implied by PDP at the requested voltage.

        Current = PDP / voltage (capped by hardware limits).
        For EPR, source current is typically limited to 5A.
        Peak overload behavior is separately encoded in peak_current_code (not applied here).

        Args:
            voltage: Requested voltage in volts

        Returns:
            Maximum continuous current in amps at this voltage
        """
        if voltage <= 0.0:
            return 0.0
        return min(self.pdp / voltage, 5.0)  # EPR typically limited to 5A

    def power_available_at(self, voltage: float) -> float:
        """Calculate available power at requested voltage (PDP-limited)."""
        if not (self.min_voltage <= voltage <= self.max_voltage):
            return 0.0
        return min(self.pdp, voltage * self.max_current_at(voltage))

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update({
            "Min Voltage": f"{self.min_voltage:.2f}V",
            "Max Voltage": f"{self.max_voltage:.2f}V",
            "Voltage Range": f"{self.min_voltage:.2f}V - {self.max_voltage:.2f}V",
            "Port Data Power (PDP)": f"{self.pdp:.2f}W",
            "Max Current @ Min Voltage": f"{self.max_current_at(self.min_voltage):.2f}A",
            "Max Current @ Max Voltage": f"{self.max_current_at(self.max_voltage):.2f}A",
            "Max Current @ 48V": f"{self.max_current_at(48.0):.2f}A",
            "Peak Current Capability": self.peak_current_code,
        })
        return d

    def __repr__(self) -> str:
        return f"EPRAvsApdo(raw=0x{self.raw:08X}, {self.min_voltage}V-{self.max_voltage}V, PDP={self.pdp}W, peak_code={self.peak_current_code})"

    def supports(self, voltage: float, current: float) -> bool:
        """Check if this EPR AVS APDO can support the requested voltage and current."""
        if not (self.min_voltage <= voltage <= self.max_voltage):
            return False
        return current <= self.max_current_at(voltage)


# ---------------------- Unknown/Reserved APDO ----------------------

@dataclass(frozen=True)
class UnknownApdo(SourcePDO):
    """
    Fallback wrapper for reserved/unknown APDO kinds.

    USB PD R3.2 V1.1 Section 6.4.1 - Capabilities Message

    Used when an APDO with an unrecognized type code is encountered.
    Bits [31:30] = 11b (APDO) but bits [29:28] or other encoding bits
    don't match any known APDO type (SPR PPS, SPR AVS, EPR AVS).

    Reserved for future use or vendor-specific extensions.
    This class provides minimal functionality - just wraps the raw value
    and cannot satisfy any voltage/current requests until type is understood.
    """

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update({
            "Augmented Power Data Object Type": "Unknown",
            "Note": "Unrecognized augmented power profile",
        })
        return d

    def supports(self, voltage: float, current: float) -> bool:
        """Unknown APDOs cannot satisfy any requests until type is understood."""
        return False
