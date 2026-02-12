"""
Copyright (c) 2025 MTA, Inc.

This module defines classes for representing Power Data Objects (PDOs)
from SINK:PDO? SCPI command responses. It supports all six PDO types:
Fixed Supply, Variable Supply, Battery Supply, SPR PPS, SPR AVS, and EPR AVS.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Optional, Sequence


@dataclass(frozen=True)
class DeviceSinkPDO(ABC):
    """
    Base class for all Sink Power Data Objects (PDO) from SCPI
    responses.

    This class represents a PDO returned by the SINK:PDO? SCPI query
    command. Subclasses implement specific PDO types, each with
    appropriate voltage, current, or power properties.

    The class supports factory construction from SCPI response strings
    with transparent polymorphism—the appropriate subclass is
    automatically instantiated based on the response format.
    """

    @staticmethod
    def from_response(response: Sequence[str]) -> Optional["DeviceSinkPDO"]:
        """
        Parse an SCPI SINK:PDO? response and return the appropriate
        PDO subclass instance.

        The response format is comma-separated values with the PDO
        type as the first element:
          - "NONE" (indicating no PDO)
          - "FIXED,<voltage>,<max_current>"
          - "VARIABLE,<min_voltage>,<max_voltage>,<max_current>"
          - "BATTERY,<min_voltage>,<max_voltage>,<max_power>"
          - "SPR_PPS,<min_voltage>,<max_voltage>,<max_current>"
          - "SPR_AVS,<min_voltage>,<max_voltage>,<max_power>"
          - "EPR_AVS,<min_voltage>,<max_voltage>,<max_power>"

        Args:
            response: A comma-separated string from SINK:PDO? query.

        Returns:
            A DeviceSinkPDO subclass instance (FixedPDO, VariablePDO,
            BatteryPDO, SPR_PDOPPS, SPR_PDOAVs, or EPR_PDOAVs) or None.

        Raises:
            ValueError: If the response format is invalid or the PDO
                type is unrecognized.
        """
        parts = [p.strip() for p in response]

        if not parts or not parts[0]:
            raise ValueError("Empty SCPI response")

        pdo_type = parts[0].upper()

        if pdo_type == "NONE":
            return None

        if pdo_type == "FIXED":
            if len(parts) != 3:
                raise ValueError(
                    f"FIXED PDO requires 3 values, "
                    f"got {len(parts)}"
                )
            return FixedPDO(
                voltage=float(parts[1]),
                max_current=float(parts[2]),
            )

        if pdo_type == "VARIABLE":
            if len(parts) != 4:
                raise ValueError(
                    f"VARIABLE PDO requires 4 values, "
                    f"got {len(parts)}"
                )
            return VariablePDO(
                min_voltage=float(parts[1]),
                max_voltage=float(parts[2]),
                max_current=float(parts[3]),
            )

        if pdo_type == "BATTERY":
            if len(parts) != 4:
                raise ValueError(
                    f"BATTERY PDO requires 4 values, "
                    f"got {len(parts)}"
                )
            return BatteryPDO(
                min_voltage=float(parts[1]),
                max_voltage=float(parts[2]),
                max_power=float(parts[3]),
            )

        if pdo_type == "SPR_PPS":
            if len(parts) != 4:
                raise ValueError(
                    f"SPR_PPS PDO requires 4 values, "
                    f"got {len(parts)}"
                )
            return SPR_PDOPPS(
                min_voltage=float(parts[1]),
                max_voltage=float(parts[2]),
                max_current=float(parts[3]),
            )

        if pdo_type == "SPR_AVS":
            if len(parts) != 4:
                raise ValueError(
                    f"SPR_AVS PDO requires 4 values, "
                    f"got {len(parts)}"
                )
            return SPR_PDOAVs(
                min_voltage=float(parts[1]),
                max_voltage=float(parts[2]),
                max_power=float(parts[3]),
            )

        if pdo_type == "EPR_AVS":
            if len(parts) != 4:
                raise ValueError(
                    f"EPR_AVS PDO requires 4 values, "
                    f"got {len(parts)}"
                )
            return EPR_PDOAVs(
                min_voltage=float(parts[1]),
                max_voltage=float(parts[2]),
                max_power=float(parts[3]),
            )

        raise ValueError(f"Unrecognized PDO type: {pdo_type}")

    @abstractmethod
    def to_dict(self) -> dict[str, Any]:
        """
        Serialize the PDO to a dictionary representation.

        Returns:
            A dictionary with string keys and typed values. The exact
            keys depend on the PDO type.
        """

    @abstractmethod
    def __str__(self) -> str:
        """Return a human-readable string representation of the PDO."""


@dataclass(frozen=True)
class FixedPDO(DeviceSinkPDO):
    """
    Represents a Fixed Supply PDO from a SINK:PDO? SCPI response.

    A Fixed Supply PDO indicates the source can provide a fixed,
    well-regulated voltage at the specified current level.

    Attributes:
        voltage: The fixed supply voltage in volts (float).
        max_current: The maximum available current in amps (float).
    """

    voltage: float
    max_current: float

    def to_dict(self) -> dict[str, Any]:
        """
        Serialize the Fixed PDO to a dictionary.

        Returns:
            A dictionary with keys: 'type', 'voltage_v', 'max_current_a'
        """
        return {
            "type": "FIXED",
            "voltage_v": self.voltage,
            "max_current_a": self.max_current,
        }

    def __str__(self) -> str:
        """Return a human-readable representation."""
        return (
            f"FixedPDO(voltage={self.voltage:.2f}V, "
            f"max_current={self.max_current:.3f}A)"
        )


@dataclass(frozen=True)
class VariablePDO(DeviceSinkPDO):
    """
    Represents a Variable Supply PDO from a SINK:PDO? SCPI response.

    A Variable Supply PDO indicates the source can regulate voltage
    within a specified range at the specified current level.

    Attributes:
        min_voltage: The minimum voltage in volts (float).
        max_voltage: The maximum voltage in volts (float).
        max_current: The maximum available current in amps (float).
    """

    min_voltage: float
    max_voltage: float
    max_current: float

    def to_dict(self) -> dict[str, Any]:
        """
        Serialize the Variable PDO to a dictionary.

        Returns:
            A dictionary with keys: 'type', 'min_voltage_v',
            'max_voltage_v', 'max_current_a'
        """
        return {
            "type": "VARIABLE",
            "min_voltage_v": self.min_voltage,
            "max_voltage_v": self.max_voltage,
            "max_current_a": self.max_current,
        }

    def __str__(self) -> str:
        """Return a human-readable representation."""
        return (
            f"VariablePDO(voltage={self.min_voltage:.2f}V–"
            f"{self.max_voltage:.2f}V, "
            f"max_current={self.max_current:.3f}A)"
        )


@dataclass(frozen=True)
class BatteryPDO(DeviceSinkPDO):
    """
    Represents a Battery Supply PDO from a SINK:PDO? SCPI response.

    A Battery Supply PDO indicates the source is a battery that can
    regulate voltage within a specified range. Power delivery is
    limited by maximum power rather than current.

    Attributes:
        min_voltage: The minimum voltage in volts (float).
        max_voltage: The maximum voltage in volts (float).
        max_power: The maximum available power in watts (float).
    """

    min_voltage: float
    max_voltage: float
    max_power: float

    def to_dict(self) -> dict[str, Any]:
        """
        Serialize the Battery PDO to a dictionary.

        Returns:
            A dictionary with keys: 'type', 'min_voltage_v',
            'max_voltage_v', 'max_power_w'
        """
        return {
            "type": "BATTERY",
            "min_voltage_v": self.min_voltage,
            "max_voltage_v": self.max_voltage,
            "max_power_w": self.max_power,
        }

    def __str__(self) -> str:
        """Return a human-readable representation."""
        return (
            f"BatteryPDO(voltage={self.min_voltage:.2f}V–"
            f"{self.max_voltage:.2f}V, "
            f"max_power={self.max_power:.2f}W)"
        )


@dataclass(frozen=True)
class SPR_PDOPPS(DeviceSinkPDO):
    """
    Represents an SPR PPS (Programmable Power Supply) PDO from a
    SINK:PDO? SCPI response.

    An SPR PPS PDO allows the sink to request specific voltage and
    current within the advertised range with finer granularity than
    fixed PDOs.

    Attributes:
        min_voltage: The minimum voltage in volts (float).
        max_voltage: The maximum voltage in volts (float).
        max_current: The maximum available current in amps (float).
    """

    min_voltage: float
    max_voltage: float
    max_current: float

    def to_dict(self) -> dict[str, Any]:
        """
        Serialize the SPR PPS PDO to a dictionary.

        Returns:
            A dictionary with keys: 'type', 'min_voltage_v',
            'max_voltage_v', 'max_current_a'
        """
        return {
            "type": "SPR_PPS",
            "min_voltage_v": self.min_voltage,
            "max_voltage_v": self.max_voltage,
            "max_current_a": self.max_current,
        }

    def __str__(self) -> str:
        """Return a human-readable representation."""
        return (
            f"SPR_PDOPPS(voltage={self.min_voltage:.2f}V–"
            f"{self.max_voltage:.2f}V, "
            f"max_current={self.max_current:.3f}A)"
        )


@dataclass(frozen=True)
class SPR_PDOAVs(DeviceSinkPDO):
    """
    Represents an SPR AVS (Adjustable Voltage Supply) PDO from a
    SINK:PDO? SCPI response.

    An SPR AVS PDO indicates the source can regulate voltage within a
    specified range. Power delivery is limited by maximum power rather
    than current.

    Attributes:
        min_voltage: The minimum voltage in volts (float).
        max_voltage: The maximum voltage in volts (float).
        max_power: The maximum available power in watts (float).
    """

    min_voltage: float
    max_voltage: float
    max_power: float

    def to_dict(self) -> dict[str, Any]:
        """
        Serialize the SPR AVS PDO to a dictionary.

        Returns:
            A dictionary with keys: 'type', 'min_voltage_v',
            'max_voltage_v', 'max_power_w'
        """
        return {
            "type": "SPR_AVS",
            "min_voltage_v": self.min_voltage,
            "max_voltage_v": self.max_voltage,
            "max_power_w": self.max_power,
        }

    def __str__(self) -> str:
        """Return a human-readable representation."""
        return (
            f"SPR_PDOAVs(voltage={self.min_voltage:.2f}V–"
            f"{self.max_voltage:.2f}V, "
            f"max_power={self.max_power:.2f}W)"
        )


@dataclass(frozen=True)
class EPR_PDOAVs(DeviceSinkPDO):
    """
    Represents an EPR AVS (Adjustable Voltage Supply) PDO from a
    SINK:PDO? SCPI response.

    An EPR AVS PDO indicates the source is an extended power range
    supply that can regulate voltage within a specified range. Power
    delivery is limited by maximum power rather than current.

    Attributes:
        min_voltage: The minimum voltage in volts (float).
        max_voltage: The maximum voltage in volts (float).
        max_power: The maximum available power in watts (float).
    """

    min_voltage: float
    max_voltage: float
    max_power: float

    def to_dict(self) -> dict[str, Any]:
        """
        Serialize the EPR AVS PDO to a dictionary.

        Returns:
            A dictionary with keys: 'type', 'min_voltage_v',
            'max_voltage_v', 'max_power_w'
        """
        return {
            "type": "EPR_AVS",
            "min_voltage_v": self.min_voltage,
            "max_voltage_v": self.max_voltage,
            "max_power_w": self.max_power,
        }

    def __str__(self) -> str:
        """Return a human-readable representation."""
        return (
            f"EPR_PDOAVs(voltage={self.min_voltage:.2f}V–"
            f"{self.max_voltage:.2f}V, "
            f"max_power={self.max_power:.2f}W)"
        )
