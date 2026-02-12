"""
Copyright (c) 2025 MTA, Inc.

Power Data Objects (PDOs) for USB Power Delivery - Sink (Consumer) side.
Defines classes to represent and interpret Sink PDOs, including Fixed, Variable, Battery, and APDO types.
"""

from dataclasses import dataclass
from typing import Dict, Any

from .bit_helpers import _bits, _u32


@dataclass(frozen=True)
class SinkPDO:
    """Base class for all Sink Power Data Objects.

    This class serves as the foundation for all sink-side Power Data Objects in USB-PD.
    It provides common functionality for PDO type identification and raw value handling.

    Attributes:
        raw (int): The raw 32-bit PDO value.
    """
    raw: int

    @property
    def pdo_type(self) -> str:
        """Get the PDO type string from bits [31:30].

        Returns:
            str: One of "Fixed", "Variable", "Battery", or "APDO" based on the PDO type bits.
        """
        return {0b00: "Fixed", 0b01: "Variable", 0b10: "Battery", 0b11: "APDO"}[_bits(self.raw, 31, 30)]

    def to_dict(self) -> Dict[str, Any]:
        """Convert the PDO to a dictionary representation.

        Returns:
            Dict[str, Any]: Dictionary containing the PDO type and raw value.
        """
        return {
            "Power Data Object Type": self.pdo_type,
        }

    def supports(self, voltage: float, current: float) -> bool:
        """Check if this PDO supports the given voltage and current requirements.

        Args:
            voltage (float): The voltage in volts to check.
            current (float): The current in amperes to check.

        Returns:
            bool: True if the PDO can support the given power requirements.

        Raises:
            NotImplementedError: This is an abstract method that must be implemented by subclasses.
        """
        raise NotImplementedError

    def encode(self) -> bytes:
        """Encode the SinkPDO as 4 bytes (little-endian)."""
        return self.raw.to_bytes(4, byteorder="little")

    @staticmethod
    def from_raw(raw: int) -> "SinkPDO":
        """Create a specific PDO instance from a raw 32-bit value.

        Args:
            raw (int): The raw 32-bit PDO value.

        Returns:
            SinkPDO: An instance of a specific PDO subclass based on the PDO type bits.
                    Returns UnknownSinkApdo if the APDO type is not recognized.
        """
        raw = _u32(raw)
        t = _bits(raw, 31, 30)
        if t == 0b00:
            return FixedSinkPDO(raw)
        if t == 0b01:
            return VariableSinkPDO(raw)
        if t == 0b10:
            return BatterySinkPDO(raw)
        apdo_kind = _bits(raw, 29, 28)
        if apdo_kind == 0b00:
            return SprPpsSinkApdo(raw)
        if apdo_kind == 0b01:
            return EprAvsSinkApdo(raw)
        return UnknownSinkApdo(raw)


@dataclass(frozen=True)
class FixedSinkPDO(SinkPDO):
    """Fixed Power Supply Sink PDO.

    Represents a fixed-voltage power supply sink capability with additional USB-PD 3.1
    features such as EPR mode and FR swap support.

    Inherits from:
        SinkPDO: Base class for all sink PDOs.
    """
    @property
    def voltage(self) -> float:
        """Get the fixed voltage value in volts.

        Returns:
            float: The voltage in volts (50mV units in raw form).
        """
        return _bits(self.raw, 19, 10) * 0.05

    @property
    def op_current(self) -> float:
        """Get the operational current in amperes.

        Returns:
            float: The operational current in amperes (10mA units in raw form).
        """
        return _bits(self.raw, 9, 0) * 0.01

    @property
    def higher_capability(self) -> bool:
        """Check if the sink supports higher capability.

        Returns:
            bool: True if the sink supports higher power capability.
        """
        return bool(_bits(self.raw, 28, 28))

    @property
    def unconstrained_power(self) -> bool:
        """Check if the sink supports unconstrained power.

        Returns:
            bool: True if the sink supports unconstrained power operation.
        """
        return bool(_bits(self.raw, 27, 27))

    @property
    def usb_comm_capable(self) -> bool:
        """Check if the sink supports USB communications.

        Returns:
            bool: True if the sink supports USB communications.
        """
        return bool(_bits(self.raw, 26, 26))

    @property
    def dual_role_data(self) -> bool:
        """Check if the sink supports dual-role data.

        Returns:
            bool: True if the sink supports dual-role data operation.
        """
        return bool(_bits(self.raw, 25, 25))

    @property
    def unchunked_ext_supported(self) -> bool:
        """Check if the sink supports unchunked extended messages.

        Returns:
            bool: True if the sink supports unchunked extended messages.
        """
        return bool(_bits(self.raw, 24, 24))

    @property
    def epr_mode_capable(self) -> bool:
        """Check if the sink supports Extended Power Range (EPR) mode.

        Returns:
            bool: True if the sink is EPR mode capable.
        """
        return bool(_bits(self.raw, 23, 23))

    @property
    def fr_swap_required_current_code(self) -> int:
        """Get the Fast Role Swap required current code.

        Returns:
            int: The FR_Swap required current code (2-bit value).
        """
        return _bits(self.raw, 21, 20)

    def to_dict(self) -> Dict[str, Any]:
        """Convert the Fixed PDO to a dictionary representation.

        Returns:
            Dict[str, Any]: Dictionary containing all Fixed PDO parameters and capabilities.
        """
        d = super().to_dict()
        d.update({
            "Voltage": f"{self.voltage:.2f}V",
            "Operational Current": f"{self.op_current:.2f}A",
            "Higher Capability": self.higher_capability,
            "Unconstrained Power": self.unconstrained_power,
            "USB Communications Capable": self.usb_comm_capable,
            "Dual Role Data": self.dual_role_data,
            "Unchunked Extended Messages Supported": self.unchunked_ext_supported,
            "EPR Mode Capable": self.epr_mode_capable,
            "Fast Role Swap Required Current Level": (
                self.fr_swap_required_current_code
            ),
        })
        return d

    def supports(self, voltage: float, current: float) -> bool:
        """Check if this Fixed PDO supports the given voltage and current requirements.

        Args:
            voltage (float): The voltage in volts to check.
            current (float): The current in amperes to check.

        Returns:
            bool: True if the voltage matches within 50mV and the current is supported.
        """
        return abs(voltage - self.voltage) <= 0.05 and current >= self.op_current


@dataclass(frozen=True)
class VariableSinkPDO(SinkPDO):
    """Variable Power Supply Sink PDO.

    Represents a variable-voltage power supply sink capability that can operate
    within a specified voltage range at a given current.

    Inherits from:
        SinkPDO: Base class for all sink PDOs.
    """
    @property
    def max_voltage(self) -> float:
        """Get the maximum supported voltage in volts.

        Returns:
            float: The maximum voltage in volts (50mV units in raw form).
        """
        return _bits(self.raw, 29, 20) * 0.05

    @property
    def min_voltage(self) -> float:
        """Get the minimum supported voltage in volts.

        Returns:
            float: The minimum voltage in volts (50mV units in raw form).
        """
        return _bits(self.raw, 19, 10) * 0.05

    @property
    def op_current(self) -> float:
        """Get the operational current in amperes.

        Returns:
            float: The operational current in amperes (10mA units in raw form).
        """
        return _bits(self.raw, 9, 0) * 0.01

    def to_dict(self) -> Dict[str, Any]:
        """Convert the Variable PDO to a dictionary representation.

        Returns:
            Dict[str, Any]: Dictionary containing voltage range and current specifications.
        """
        d = super().to_dict()
        d.update({
            "Minimum Voltage": f"{self.min_voltage:.2f}V",
            "Maximum Voltage": f"{self.max_voltage:.2f}V",
            "Operational Current": f"{self.op_current:.2f}A",
        })
        return d

    def supports(self, voltage: float, current: float) -> bool:
        """Check if this Variable PDO supports the given voltage and current requirements.

        Args:
            voltage (float): The voltage in volts to check.
            current (float): The current in amperes to check.

        Returns:
            bool: True if the voltage is within range and the current is supported.
        """
        return (self.min_voltage <= voltage <= self.max_voltage) and (current >= self.op_current)


@dataclass(frozen=True)
class BatterySinkPDO(SinkPDO):
    """Battery Power Supply Sink PDO.

    Represents a battery-powered sink capability that operates within a voltage range
    and specifies power requirements instead of current.

    Inherits from:
        SinkPDO: Base class for all sink PDOs.
    """

    @property
    def max_voltage(self) -> float:
        """Get the maximum supported voltage in volts.

        Returns:
            float: The maximum voltage in volts (50mV units in raw form).
        """
        return _bits(self.raw, 29, 20) * 0.05

    @property
    def min_voltage(self) -> float:
        """Get the minimum supported voltage in volts.

        Returns:
            float: The minimum voltage in volts (50mV units in raw form).
        """
        return _bits(self.raw, 19, 10) * 0.05

    @property
    def op_power(self) -> float:
        """Get the operational power in watts.

        Returns:
            float: The operational power in watts (250mW units in raw form).
        """
        return _bits(self.raw, 9, 0) * 0.25

    def to_dict(self) -> Dict[str, Any]:
        """Convert the Battery PDO to a dictionary representation.

        Returns:
            Dict[str, Any]: Dictionary containing voltage range and power specifications.
        """
        d = super().to_dict()
        d.update({
            "Minimum Voltage": f"{self.min_voltage:.2f}V",
            "Maximum Voltage": f"{self.max_voltage:.2f}V",
            "Operational Power": f"{self.op_power:.2f}W",
        })
        return d

    def supports(self, voltage: float, current: float) -> bool:
        """Check if this Battery PDO supports the given voltage and power requirements.

        Args:
            voltage (float): The voltage in volts to check.
            current (float): The current in amperes to check.

        Returns:
            bool: True if the voltage is within range and the power requirement is met.
        """
        return (self.min_voltage <= voltage <= self.max_voltage) and ((voltage * current) >= self.op_power)


@dataclass(frozen=True)
class SprPpsSinkApdo(SinkPDO):
    """Standard Power Range (SPR) Programmable Power Supply (PPS) Sink APDO.

    Represents a PPS sink capability that supports a continuously adjustable voltage
    range with specified maximum current limits.

    Inherits from:
        SinkPDO: Base class for all sink PDOs.
    """

    @property
    def max_voltage(self) -> float:
        """Get the maximum supported PPS voltage in volts.

        Returns:
            float: The maximum voltage in volts (100mV units in raw form).
        """
        return _bits(self.raw, 24, 17) * 0.1

    @property
    def min_voltage(self) -> float:
        """Get the minimum supported PPS voltage in volts.

        Returns:
            float: The minimum voltage in volts (100mV units in raw form).
        """
        return _bits(self.raw, 15, 8) * 0.1

    @property
    def op_current_max(self) -> float:
        """Get the maximum operational current in amperes.

        Returns:
            float: The maximum operational current in amperes (50mA units in raw form).
        """
        return _bits(self.raw, 6, 0) * 0.05

    def to_dict(self) -> Dict[str, Any]:
        """Convert the SPR PPS APDO to a dictionary representation.

        Returns:
            Dict[str, Any]: Dictionary containing PPS voltage range and current specifications.
        """
        d = super().to_dict()
        d.update({
            "Augmented Power Data Object Type": "SPR PPS Sink",
            "Minimum Voltage": f"{self.min_voltage:.2f}V",
            "Maximum Voltage": f"{self.max_voltage:.2f}V",
            "Maximum Operating Current": f"{self.op_current_max:.2f}A",
        })
        return d

    def supports(self, voltage: float, current: float) -> bool:
        """Check if this PPS APDO supports the given voltage and current requirements.

        Args:
            voltage (float): The voltage in volts to check.
            current (float): The current in amperes to check.

        Returns:
            bool: True if the voltage is within PPS range and the current is supported.
        """
        return (self.min_voltage <= voltage <= self.max_voltage) and (current >= self.op_current_max)


@dataclass(frozen=True)
class EprAvsSinkApdo(SinkPDO):
    """Extended Power Range (EPR) Adjustable Voltage Supply (AVS) Sink APDO.

    Represents an EPR AVS sink capability that supports a continuously adjustable voltage
    range with power-based specifications.

    Inherits from:
        SinkPDO: Base class for all sink PDOs.
    """

    @property
    def max_voltage(self) -> float:
        """Get the maximum supported EPR voltage in volts.

        Returns:
            float: The maximum voltage in volts (100mV units in raw form).
        """
        return _bits(self.raw, 25, 17) * 0.1

    @property
    def min_voltage(self) -> float:
        """Get the minimum supported EPR voltage in volts.

        Returns:
            float: The minimum voltage in volts (100mV units in raw form).
        """
        return _bits(self.raw, 15, 8) * 0.1

    @property
    def pdp(self) -> float:
        """Get the Programmable Power Delivery Profile (PDP) in watts.

        Returns:
            float: The PDP in watts (1W units in raw form).
        """
        return _bits(self.raw, 7, 0) * 1.0

    def min_current_at(self, voltage: float) -> float:
        """Calculate the minimum current required at a given voltage to meet PDP.

        Args:
            voltage (float): The voltage in volts to calculate current for.

        Returns:
            float: The minimum required current in amperes, or infinity if voltage is zero.
        """
        return self.pdp / voltage if voltage > 0 else float("inf")

    def to_dict(self) -> Dict[str, Any]:
        """Convert the EPR AVS APDO to a dictionary representation.

        Returns:
            Dict[str, Any]: Dictionary containing EPR voltage range and PDP specifications.
        """
        d = super().to_dict()
        d.update({
            "Augmented Power Data Object Type": "EPR AVS Sink",
            "Minimum Voltage": f"{self.min_voltage:.2f}V",
            "Maximum Voltage": f"{self.max_voltage:.2f}V",
            "Port Data Power": f"{self.pdp:.2f}W",
        })
        return d

    def supports(self, voltage: float, current: float) -> bool:
        """Check if this EPR AVS APDO supports the given voltage and current requirements.

        Args:
            voltage (float): The voltage in volts to check.
            current (float): The current in amperes to check.

        Returns:
            bool: True if the voltage is within EPR range and the current meets PDP requirements.
        """
        return (self.min_voltage <= voltage <= self.max_voltage) and (current >= self.min_current_at(voltage))


@dataclass(frozen=True)
class UnknownSinkApdo(SinkPDO):
    """Unknown Sink APDO type.

    Represents an unrecognized or unsupported APDO type. This class is used as a
    fallback when encountering APDO types that are not defined in the current
    implementation.

    Inherits from:
        SinkPDO: Base class for all sink PDOs.
    """

    def to_dict(self) -> Dict[str, Any]:
        """Convert the Unknown APDO to a dictionary representation.

        Returns:
            Dict[str, Any]: Dictionary indicating an unknown APDO type.
        """
        d = super().to_dict()
        d.update({"Augmented Power Data Object Type": "Unknown Sink APDO"})
        return d

    def supports(self, voltage: float, current: float) -> bool:
        """Check if this Unknown APDO supports the given voltage and current requirements.

        Always returns False since the APDO type is unknown and unsupported.

        Args:
            voltage (float): The voltage in volts to check.
            current (float): The current in amperes to check.

        Returns:
            bool: Always False.
        """
        return False
