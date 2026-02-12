"""
Battery Status Message
"""
from typing import Dict

from ._base import StandardMessage


class BatteryStatusMessage(StandardMessage):
    """
    Class representing a Battery Status USB-PD message.
    Contains one Battery Status Data Object (BSDO) which provides information about
    battery status including present capacity, time to empty/full, and charging status.

    BSDO format (32-bit):
    - Bits 31-16: Battery Present Capacity (0-0xFFFF, resolution 10mWh or 10%)
    - Bits 15-8:  Battery Information:
        - Bit 15: Reserved, shall be set to 0
        - Bit 14: Invalid Battery Reference, 1=invalid
        - Bit 13: Battery Is Present, 1=present
        - Bit 12: Reserved, shall be set to 0
        - Bits 11-8: Reserved, shall be set to 0
    - Bits 7-0:   Time to Empty/Full in minutes (0-0xFF, 0=unknown)
    """
    @property
    def name(self) -> str:
        return "Battery_Status"

    @classmethod
    def encode(cls, present_capacity: int, is_battery_present: bool = True,
               is_battery_reference_invalid: bool = False, time_to_empty_full: int = 0) -> bytes:
        """
        Creates a bytes representation of a Battery Status message.

        Args:
            present_capacity: Battery's present capacity in 10mWh or 10% units (0-0xFFFF)
            is_battery_present: Whether a battery is present
            is_battery_reference_invalid: Whether the battery reference is invalid
            time_to_empty_full: Time to empty/full in minutes (0-0xFF, 0=unknown)

        Returns:
            bytes: The encoded message body (4 bytes)
        """
        bsdo = 0
        bsdo |= (present_capacity & 0xFFFF) << 16
        bsdo |= (1 if is_battery_present else 0) << 13
        bsdo |= (1 if is_battery_reference_invalid else 0) << 14
        bsdo |= (time_to_empty_full & 0xFF)
        return bsdo.to_bytes(4, 'little')

    @property
    def present_capacity(self) -> int:
        """Returns the battery's present capacity in 10mWh or 10% units"""
        if len(self.body) < 4:
            return 0
        raw = int.from_bytes(self.body[0:4], byteorder='little')
        return (raw >> 16) & 0xFFFF

    @property
    def is_battery_present(self) -> bool:
        """Returns True if a battery is present"""
        if len(self.body) < 4:
            return False
        raw = int.from_bytes(self.body[0:4], byteorder='little')
        return bool((raw >> 13) & 0x1)

    @property
    def is_battery_reference_invalid(self) -> bool:
        """Returns True if the battery reference is invalid"""
        if len(self.body) < 4:
            return True
        raw = int.from_bytes(self.body[0:4], byteorder='little')
        return bool((raw >> 14) & 0x1)

    @property
    def time_to_empty_full(self) -> int:
        """Returns time to empty/full in minutes, 0 means unknown"""
        if len(self.body) < 4:
            return 0
        raw = int.from_bytes(self.body[0:4], byteorder='little')
        return raw & 0xFF

    @property
    def renderable_properties(self) -> Dict[str, str]:
        """Returns a dictionary of properties for display"""
        properties = super().renderable_properties

        capacity = self.present_capacity
        properties.update({
            "Present Capacity": f"{capacity} {'10%' if capacity <= 1000 else '10mWh'}",
            "Battery Present": str(self.is_battery_present),
            "Battery Reference": "Invalid" if self.is_battery_reference_invalid else "Valid",
            "Time to Empty/Full": f"{self.time_to_empty_full} minutes" if self.time_to_empty_full else "Unknown"
        })

        return properties
