"""
Copyright (c) 2025 MTA, Inc.

This module defines Alert Data Object (ADO) classes for USB-PD Alert messages.
Alert Data Objects are used to indicate various alert conditions in USB-PD communications.
"""
from __future__ import annotations
from dataclasses import dataclass
from enum import IntEnum
from typing import Dict, Any


class ExtendedAlertType(IntEnum):
    """
    USB-PD Extended Alert Types
    """
    FIXED_SUPPLY = 0
    BATTERY_STATUS = 1
    MANUFACTURER_INFO = 2


@dataclass
class AlertDataObject:
    """
    Alert Data Object (ADO) class for USB-PD Alert messages.

    According to USB PD Section 6.4.6, Alert Message contains:

    Bits 0:       Reserved, Shall be set to zero
    Bits 1-7:     Type of Alert (Battery Status Change, OCP, OTP, etc.)
    Bits 8:       Extended Alert Event
    Bits 9-14:    Reserved
    Bits 15:      Reserved (part of Type field)
    Bits 23-20:   Fixed Batteries (which fixed batteries have status change)
    Bits 19-16:   Hot Swappable Batteries (which hot swappable batteries have status change)
    Bits 31-24:   Type of Alert (bit layout)

    When Extended Alert Event bit (7) is set, Extended Alert Type field (bits 3-0) indicates:
    0 = Reserved
    1 = Power state change (DFP only)
    2 = Power button press (UFP only)
    3 = Power button release (UFP only)
    4 = Controller initiated wake (UFP only)
    5-15 = Reserved
    """
    raw_value: int

    @property
    def battery_status_change_event(self) -> bool:
        """Whether a Battery Status Change Event occurred (bit 1)."""
        return bool((self.raw_value >> 1) & 0x1)

    @property
    def ocp_event(self) -> bool:
        """Whether an Over Current Protection event occurred (bit 2)."""
        return bool((self.raw_value >> 2) & 0x1)

    @property
    def otp_event(self) -> bool:
        """Whether an Over Temperature Protection event occurred (bit 3)."""
        return bool((self.raw_value >> 3) & 0x1)

    @property
    def operating_condition_change(self) -> bool:
        """Whether an Operating Condition Change occurred (bit 4)."""
        return bool((self.raw_value >> 4) & 0x1)

    @property
    def source_input_change(self) -> bool:
        """Whether a Source Input Change occurred (bit 5)."""
        return bool((self.raw_value >> 5) & 0x1)

    @property
    def ovp_event(self) -> bool:
        """Whether an Over Voltage Protection event occurred (bit 6)."""
        return bool((self.raw_value >> 6) & 0x1)

    @property
    def extended_alert_event(self) -> bool:
        """Whether an Extended Alert event is present (bit 7)."""
        return bool((self.raw_value >> 7) & 0x1)

    @property
    def fixed_batteries(self) -> int:
        """
        Which Fixed Batteries have had a status change (bits 23-20).
        B20 corresponds to Battery 0 and B23 corresponds to Battery 3.
        Returns a 4-bit value where bit position N indicates Battery N has a status change.
        """
        return (self.raw_value >> 20) & 0xF

    @property
    def hot_swappable_batteries(self) -> int:
        """
        Which Hot Swappable Batteries have had a status change (bits 19-16).
        B16 corresponds to Battery 4 and B19 corresponds to Battery 7.
        Returns a 4-bit value where bit position N indicates Battery (N+4) has a status change.
        """
        return (self.raw_value >> 16) & 0xF

    @property
    def extended_alert_event_type(self) -> int:
        """
        Extended Alert Event Type field (bits 3-0) indicates the type of extended alert.
        Only valid when extended_alert_event is True.
        0 = Reserved
        1 = Power state change (DFP only)
        2 = Power button press (UFP only)
        3 = Power button release (UFP only)
        4 = Controller initiated wake (UFP only)
        5-15 = Reserved
        """
        return self.raw_value & 0xF

    def get_fixed_batteries_list(self) -> list:
        """Get list of fixed battery indices that have status changes."""
        batteries = []
        for i in range(4):
            if (self.fixed_batteries >> i) & 0x1:
                batteries.append(i)
        return batteries

    def get_hot_swappable_batteries_list(self) -> list:
        """Get list of hot swappable battery indices (4-7) that have status changes."""
        batteries = []
        for i in range(4):
            if (self.hot_swappable_batteries >> i) & 0x1:
                # Hot swappable batteries start at index 4
                batteries.append(i + 4)
        return batteries

    def _get_extended_alert_type_description(self) -> str:
        """Get description of extended alert type."""
        alert_type = self.extended_alert_event_type
        descriptions = {
            0: "Reserved",
            1: "Power state change (DFP only)",
            2: "Power button press (UFP only)",
            3: "Power button release (UFP only)",
            4: "Controller initiated wake e.g., Wake on LAN (UFP only)",
        }
        return descriptions.get(alert_type, f"Unknown extended alert type (0x{alert_type:X})")

    def get_alert_description(self) -> str:
        """Get a human-readable description of what the alert indicates."""
        alerts = []

        if self.battery_status_change_event:
            fixed_batt = self.get_fixed_batteries_list()
            hot_swap_batt = self.get_hot_swappable_batteries_list()
            batt_desc = []
            if fixed_batt:
                batt_desc.append(f"Fixed Battery(ies) {fixed_batt}")
            if hot_swap_batt:
                batt_desc.append(f"Hot Swappable Battery(ies) {hot_swap_batt}")
            alerts.append(f"Battery Status Change: {', '.join(batt_desc)}")

        if self.ocp_event:
            alerts.append("Over Current Protection (OCP) event detected")

        if self.otp_event:
            alerts.append("Over Temperature Protection (OTP) event detected")

        if self.operating_condition_change:
            alerts.append(
                "Operating condition has changed (e.g., temperature threshold, CV/CL mode)")

        if self.source_input_change:
            alerts.append(
                "Source input has changed (e.g., AC removed, battery switched)")

        if self.ovp_event:
            alerts.append("Over Voltage Protection (OVP) event detected")

        if self.extended_alert_event:
            alerts.append(
                f"Extended Alert Event: {self._get_extended_alert_type_description()}")

        return "; ".join(alerts) if alerts else "No alerts active"

    def to_dict(self) -> Dict[str, Any]:
        """Convert the ADO to a dictionary for display."""
        return {
            "Alert Description": self.get_alert_description(),
            "Battery Status Change Event": self.battery_status_change_event,
            "Over Current Protection Event": self.ocp_event,
            "Over Temperature Protection Event": self.otp_event,
            "Operating Condition Change": self.operating_condition_change,
            "Source Input Change": self.source_input_change,
            "Over Voltage Protection Event": self.ovp_event,
            "Extended Alert Event": self.extended_alert_event,
            "Extended Alert Event Type": (
                self._get_extended_alert_type_description()
                if self.extended_alert_event
                else "Not applicable"
            ),
            "Fixed Batteries with Status Change": (
                ", ".join(str(i) for i in self.get_fixed_batteries_list())
                if self.fixed_batteries
                else "None"
            ),
            "Hot Swappable Batteries with Status Change": (
                ", ".join(
                    str(i) for i in self.get_hot_swappable_batteries_list()
                ) if self.hot_swappable_batteries else "None"
            ),
        }

    def encode(self) -> bytes:
        """Encode the Alert Data Object as 4 bytes (little-endian)."""
        return self.raw_value.to_bytes(4, byteorder="little")


@dataclass
class ExtendedADO:
    """
    Extended Alert Data Object base class.
    This is used for extended alert information that follows an ADO.

    Bits:
    0-7   -> Type-specific data
    8-14  -> Reserved
    15    -> Type (1: Extended ADO Header)
    16-31 -> Type-specific data
    """
    raw_value: int

    @property
    def type(self) -> ExtendedAlertType:
        """The type of extended alert."""
        type_val = (self.raw_value >> 16) & 0xFF
        try:
            return ExtendedAlertType(type_val)
        except ValueError:
            # If the value doesn't match an enum, return FIXED_SUPPLY as default
            return ExtendedAlertType.FIXED_SUPPLY

    @classmethod
    def from_raw(cls, raw_value: int) -> ExtendedADO:
        """Create the appropriate ExtendedADO subclass based on the type field."""
        type_val = (raw_value >> 16) & 0xFF
        try:
            alert_type = ExtendedAlertType(type_val)
            match alert_type:
                case ExtendedAlertType.FIXED_SUPPLY:
                    return FixedSupplyExtendedADO(raw_value)
                case ExtendedAlertType.BATTERY_STATUS:
                    return BatteryStatusExtendedADO(raw_value)
                case ExtendedAlertType.MANUFACTURER_INFO:
                    return ManufacturerInfoExtendedADO(raw_value)
        except ValueError:
            pass
        # Default to base class if type is unknown
        return cls(raw_value)

    def to_dict(self) -> Dict[str, Any]:
        """Convert the Extended ADO to a dictionary for display."""
        return {
            "Alert Type": self.type.name
        }


@dataclass
class FixedSupplyExtendedADO(ExtendedADO):
    """
    Fixed Supply Extended ADO.
    Contains information about fixed supply alerts.
    According to USB PD Section 6.4.6.4.1, this is used for power state change events.
    For DFP only - indicates power state transitions.
    """

    @property
    def power_state_info(self) -> int:
        """
        Power state information field (bits 15-8).
        Contains power state related information when Extended Alert Type is 1 (Power state change).
        """
        return (self.raw_value >> 8) & 0xFF

    def to_dict(self) -> Dict[str, Any]:
        base = super().to_dict()
        base.update({
            "Alert Type": "Fixed Supply (Power State Change)",
            "Power State Information": self.power_state_info,
        })
        return base


@dataclass
class BatteryStatusExtendedADO(ExtendedADO):
    """
    Battery Status Extended ADO.
    Contains information about battery-related alerts.
    Battery information is encoded in bits 7-0 (battery index).
    """
    @property
    def battery_index(self) -> int:
        """
        The index of the battery this status refers to.
        Ranges from 0-7 depending on whether it's a fixed or hot-swappable battery.
        """
        return self.raw_value & 0xFF

    @property
    def battery_status_info(self) -> int:
        """
        Additional battery status information field (bits 15-8).
        """
        return (self.raw_value >> 8) & 0xFF

    def to_dict(self) -> Dict[str, Any]:
        base = super().to_dict()

        # Determine if this is a fixed or hot-swappable battery
        if self.battery_index < 4:
            battery_type = "Fixed Battery"
        elif self.battery_index < 8:
            battery_type = "Hot Swappable Battery"
        else:
            battery_type = "Unknown Battery Type"

        base.update({
            "Alert Type": "Battery Status",
            "Battery Type": battery_type,
            "Battery Index": self.battery_index,
            "Battery Status Information": self.battery_status_info,
        })
        return base


@dataclass
class ManufacturerInfoExtendedADO(ExtendedADO):
    """
    Manufacturer Info Extended ADO.
    Contains manufacturer-specific alert information.
    Bits 15-0 contain the manufacturer-specific information field.
    """
    @property
    def manufacturer_info(self) -> int:
        """The manufacturer-specific information field (bits 15-0)."""
        return self.raw_value & 0xFFFF

    @property
    def manufacturer_reserved_data(self) -> int:
        """
        Additional manufacturer-specific data field (bits 31-16).
        """
        return (self.raw_value >> 16) & 0xFFFF

    def to_dict(self) -> Dict[str, Any]:
        base = super().to_dict()
        base.update({
            "Alert Type": "Manufacturer Specific",
            "Manufacturer Information": self.manufacturer_info,
        })
        return base
