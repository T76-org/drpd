"""
Copyright (c) 2025 MTA, Inc.

This module defines Request Data Object (RDO) classes for USB-PD Request messages.
Request Data Objects are sent by the Sink to request power from the Source.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, Any

from .bit_helpers import _bits, _u32

from .power import (
    SourcePDO,
    FixedSupplyPDO,
    VariableSupplyPDO,
    BatterySupplyPDO,
    SPRPpsApdo,
    SPRAvsApdo,
    EPRAvsApdo,
)


# ====================== Base RDO ======================

@dataclass
class RequestDO:
    """
    Base class for all Request Data Objects (RDO/ARDO).

    Wraps a 32-bit value from a Request message. Subclasses implement
    type-specific accessors and validation.
    """
    raw: int

    # -------- Common header (all RDOs) --------
    @property
    def object_position(self) -> int:
        """Bits [31:28]: 1-based index of referenced PDO/APDO in Source_Capabilities."""
        return _bits(self.raw, 31, 28)

    @property
    def give_back(self) -> bool:
        """Bit 27: GiveBack flag (legacy; must be 0 in PD3)."""
        return bool(_bits(self.raw, 27, 27))

    @property
    def capability_mismatch(self) -> bool:
        """Bit 26: Capability Mismatch flag (Sink indicates request exceeds capability)."""
        return bool(_bits(self.raw, 26, 26))

    @property
    def usb_comm_capable(self) -> bool:
        """Bit 25: Sink is USB Communications Capable."""
        return bool(_bits(self.raw, 25, 25))

    @property
    def no_usb_suspend(self) -> bool:
        """Bit 24: No USB Suspend requested by Sink."""
        return bool(_bits(self.raw, 24, 24))

    @property
    def unchunked_ext_supported(self) -> bool:
        """Bit 23: Unchunked Extended Messages Supported by the Sink."""
        return bool(_bits(self.raw, 23, 23))

    @property
    def epr_mode_capable(self) -> bool:
        """Bit 22: EPR Mode Capable (used in EPR requests)."""
        return bool(_bits(self.raw, 22, 22))

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to a plain dict. Subclasses add type-specific fields."""
        return {
            "Request Type": type(self).__name__.replace("RDO", ""),
            "Requested Power Data Object Position": self.object_position,
            "Give Back": self.give_back,
            "Capability Mismatch": self.capability_mismatch,
            "USB Communications Capable": self.usb_comm_capable,
            "No USB Suspend": self.no_usb_suspend,
            "Unchunked Extended Messages Supported": (
                self.unchunked_ext_supported
            ),
            "EPR Mode Capable": self.epr_mode_capable,
        }

    def encode(self) -> bytes:
        """
        Return the 32-bit raw value as a bytes object (little-endian).
        """
        return self.raw.to_bytes(4, byteorder="little")

    def is_compatible_with(self, pdo: SourcePDO) -> bool:
        """
        Return True if this request is within the advertised limits of `pdo`.
        Subclasses implement detailed checks per object type.
        """
        raise NotImplementedError

    # ---- Factory helpers ----
    @staticmethod
    def from_raw_and_pdo(raw: int, referenced_pdo: SourcePDO) -> "RequestDO":
        """
        Pick the correct RDO subclass based on the referenced PDO/APDO type.
        This is the safest way (no heuristics).
        """
        if isinstance(referenced_pdo, (FixedSupplyPDO, VariableSupplyPDO)):
            return FixedVariableRDO(raw)
        if isinstance(referenced_pdo, BatterySupplyPDO):
            return BatteryRDO(raw)
        if isinstance(referenced_pdo, SPRPpsApdo):
            return PpsRDO(raw)
        if isinstance(referenced_pdo, SPRAvsApdo):
            return AvsSprRDO(raw)
        if isinstance(referenced_pdo, EPRAvsApdo):
            return AvsEprRDO(raw)
        # Fallback: try to guess APDO vs standard
        return RequestDO.guess_from_raw(raw)

    @classmethod
    def guess_from_raw(cls, raw: int) -> "RequestDO":
        """
        Best-effort classification without knowing the PDO type.

        - If bits [8:7]==0 and either B19..9 or B20..9 nonzero -> assume APDO.
        - Otherwise treat as standard (Fixed/Variable/Battery).
        """
        raw = _u32(raw)
        if _bits(raw, 8, 7) == 0 and (_bits(raw, 19, 9) != 0 or _bits(raw, 20, 9) != 0 or _bits(raw, 6, 0) != 0):
            # We cannot distinguish PPS vs AVS EPR from raw alone; default to PPS view here.
            return PpsRDO(raw)
        return FixedVariableRDO(raw)

    @classmethod
    def from_source_pdo(cls, reference_pdo_position: int, reference_pdo: SourcePDO, give_back: bool, capability_mismatch: bool, usb_comm_capable: bool, no_usb_suspend: bool, unchunked_ext_supported: bool, epr_mode_capable: bool) -> "RequestDO":
        """
        Create a RequestDO from a SourcePDO.
        """
        raw = (reference_pdo_position << 28) | (int(give_back) << 27) | (int(capability_mismatch) << 26) | (int(
            usb_comm_capable) << 25) | (int(no_usb_suspend) << 24) | (int(unchunked_ext_supported) << 23) | (int(epr_mode_capable) << 22)
        return cls.from_raw_and_pdo(raw, reference_pdo)


# ====================== Standard RDOs ======================

@dataclass
class FixedVariableRDO(RequestDO):
    """
    Standard RDO for Fixed/Variable PDOs (current-based).
    Fields:
      - Operating Current: bits [19:10] in 10 mA units
      - Max Operating Current: bits [9:0] in 10 mA units
    """

    @property
    def operating_current(self) -> float:
        """Requested operating current (A)."""
        return _bits(self.raw, 19, 10) * 0.01

    @operating_current.setter
    def operating_current(self, value: float) -> None:
        """Set the operating current (A)."""
        if not (0.0 <= value <= 10.23):
            raise ValueError("Operating current must be between 0 and 10.23 A")
        object.__setattr__(self, 'raw', (self.raw & ~(0x3FF << 10)) | (
            (int(value * 100) & 0x3FF) << 10))

    @property
    def max_operating_current(self) -> float:
        """Maximum operating current the sink can draw (A)."""
        return _bits(self.raw, 9, 0) * 0.01

    @max_operating_current.setter
    def max_operating_current(self, value: float) -> None:
        """Set the maximum operating current (A)."""
        if not (0.0 <= value <= 10.23):
            raise ValueError(
                "Max operating current must be between 0 and 10.23 A")
        object.__setattr__(self, 'raw', (self.raw & ~(0x3FF))
                           | (int(value * 100) & 0x3FF))

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update({
            "Operating Current": f"{self.operating_current:.2f}A",
            "Maximum Operating Current": (
                f"{self.max_operating_current:.2f}A"
            ),
        })
        return d

    def is_compatible_with(self, pdo: SourcePDO) -> bool:
        """
        Valid if both requested currents are <= the PDO's max current (and operating <= max).
        """
        if not isinstance(pdo, (FixedSupplyPDO, VariableSupplyPDO)):
            return False
        return (self.operating_current <= self.max_operating_current and
                self.max_operating_current <= pdo.max_current)


@dataclass
class BatteryRDO(RequestDO):
    """
    Standard RDO for Battery PDOs (power-based).
    Fields:
      - Operating Power: bits [19:10] in 250 mW units
      - Max Operating Power: bits [9:0] in 250 mW units
    """

    @property
    def operating_power(self) -> float:
        """Requested operating power (W)."""
        return _bits(self.raw, 19, 10) * 0.25

    @property
    def max_operating_power(self) -> float:
        """Maximum operating power the sink can draw (W)."""
        return _bits(self.raw, 9, 0) * 0.25

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update({
            "Operating Power": f"{self.operating_power:.2f}W",
            "Maximum Operating Power": f"{self.max_operating_power:.2f}W",
        })
        return d

    def is_compatible_with(self, pdo: SourcePDO) -> bool:
        """
        Valid if both requested powers are <= the Battery PDO's max power (and operating <= max).
        """
        if not isinstance(pdo, BatterySupplyPDO):
            return False
        return (self.operating_power <= self.max_operating_power and
                self.max_operating_power <= pdo.max_power)


# ====================== APDO RDOs ======================

@dataclass
class PpsRDO(RequestDO):
    """
    SPR PPS RDO (for SPR PPS APDO).
    Fields:
      - Output Voltage: bits [20:9] in 20 mV units
      - Operating Current: bits [6:0] in 50 mA units
    """

    @property
    def target_voltage(self) -> float:
        """Requested target voltage (V), 20 mV units."""
        return _bits(self.raw, 20, 9) * 0.02

    @property
    def operating_current(self) -> float:
        """Requested operating current (A), 50 mA units."""
        return _bits(self.raw, 6, 0) * 0.05

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update({
            "Target Voltage": f"{self.target_voltage:.2f}V",
            "Operating Current": f"{self.operating_current:.2f}A",
            "Augmented Power Data Object Kind": "SPR PPS",
        })
        return d

    def is_compatible_with(self, pdo: SourcePDO) -> bool:
        """
        Valid if:
          - pdo is SPR PPS APDO
          - target voltage within [Vmin, Vmax]
          - operating current <= Imax
        """
        if not isinstance(pdo, SPRPpsApdo):
            return False
        return (pdo.min_voltage <= self.target_voltage <= pdo.max_voltage and
                self.operating_current <= pdo.max_current)


@dataclass
class AvsSprRDO(RequestDO):
    """
    SPR AVS RDO (for SPR AVS APDO).
    Fields:
      - Output Voltage: bits [20:9] in 25 mV units
      - Operating Current: bits [6:0] in 50 mA units
    """

    @property
    def target_voltage(self) -> float:
        """Requested target voltage (V), 25 mV units."""
        return _bits(self.raw, 20, 9) * 0.025

    @property
    def operating_current(self) -> float:
        """Requested operating current (A), 50 mA units."""
        return _bits(self.raw, 6, 0) * 0.05

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update({
            "Target Voltage": f"{self.target_voltage:.2f}V",
            "Operating Current": f"{self.operating_current:.2f}A",
            "Augmented Power Data Object Kind": "SPR AVS",
        })
        return d

    def is_compatible_with(self, pdo: SourcePDO) -> bool:
        """
        Valid if:
          - pdo is SPR AVS APDO
          - For 9–15 V: Ireq <= Imax_15V
          - For >15–20 V: Ireq <= Imax_20V and Imax_20V > 0
        """
        if not isinstance(pdo, SPRAvsApdo):
            return False
        v = self.target_voltage
        if 9.0 <= v <= 15.0:
            return self.operating_current <= pdo.max_current_15V
        if 15.0 < v <= 20.0:
            return (pdo.max_current_20V > 0.0) and (self.operating_current <= pdo.max_current_20V)
        return False


@dataclass
class AvsEprRDO(RequestDO):
    """
    EPR AVS RDO (for EPR AVS APDO).
    Fields:
      - Output Voltage: bits [20:9] in 25 mV units
      - Operating Current: bits [6:0] in 50 mA units
    """

    @property
    def target_voltage(self) -> float:
        """Requested target voltage (V), 25 mV units."""
        return _bits(self.raw, 20, 9) * 0.025

    @property
    def operating_current(self) -> float:
        """Requested operating current (A), 50 mA units."""
        return _bits(self.raw, 6, 0) * 0.05

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update({
            "Target Voltage": f"{self.target_voltage:.2f}V",
            "Operating Current": f"{self.operating_current:.2f}A",
            "Augmented Power Data Object Kind": "EPR AVS",
        })
        return d

    def is_compatible_with(self, pdo: SourcePDO) -> bool:
        """
        Valid if:
          - pdo is EPR AVS APDO
          - target voltage within [Vmin, Vmax]
          - Ireq <= PDP / V (continuous current derived from PDP)
        """
        if not isinstance(pdo, EPRAvsApdo):
            return False
        v = self.target_voltage
        if not (pdo.min_voltage <= v <= pdo.max_voltage):
            return False
        return self.operating_current <= (pdo.pdp / v)
