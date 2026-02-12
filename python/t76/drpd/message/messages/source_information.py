"""
Source Information Message
"""
from typing import Dict

from ._base import StandardMessage


class SourceInformationMessage(StandardMessage):
    """
    Class representing a Source Information USB-PD message.
    Contains one Source Information Data Object (SIDO) which provides additional
    information about the source's power capabilities and characteristics.

    SIDO format (32-bit):
    - Bits 31-25: Reserved, shall be set to 0
    - Bits 24:    Dual-Role Power, 1=yes
    - Bits 23:    USB Suspend Supported, 1=yes
    - Bits 22:    Unconstrained Power, 1=yes
    - Bits 21:    USB Communications Capable, 1=yes
    - Bits 20:    Dual-Role Data, 1=yes
    - Bits 19-16: Highest Source-Vbus Voltage in 4V units (e.g., 0x5=20V)
    - Bits 15-0:  Reserved, shall be set to 0
    """
    @property
    def name(self) -> str:
        return "Source_Info"

    @classmethod
    def encode(cls, dual_role_power: bool = False, usb_suspend_supported: bool = False,
               unconstrained_power: bool = False, usb_comms_capable: bool = False,
               dual_role_data: bool = False, highest_voltage_v: int = 5) -> bytes:
        """
        Creates a bytes representation of a Source Information message.

        Args:
            dual_role_power: Whether source supports dual-role power
            usb_suspend_supported: Whether source supports USB Suspend
            unconstrained_power: Whether source provides unconstrained power
            usb_comms_capable: Whether source supports USB communications
            dual_role_data: Whether source supports dual-role data
            highest_voltage_v: Highest source Vbus voltage in volts (will be converted to 4V units)

        Returns:
            bytes: The encoded message body (4 bytes)
        """
        sido = 0
        sido |= (1 if dual_role_power else 0) << 24
        sido |= (1 if usb_suspend_supported else 0) << 23
        sido |= (1 if unconstrained_power else 0) << 22
        sido |= (1 if usb_comms_capable else 0) << 21
        sido |= (1 if dual_role_data else 0) << 20
        # Convert voltage to 4V units
        voltage_units = highest_voltage_v // 4
        sido |= (voltage_units & 0xF) << 16
        return sido.to_bytes(4, 'little')

    @property
    def dual_role_power(self) -> bool:
        """Returns True if source supports dual-role power"""
        if len(self.body) < 4:
            return False
        raw = int.from_bytes(self.body[0:4], byteorder='little')
        return bool((raw >> 24) & 0x1)

    @property
    def usb_suspend_supported(self) -> bool:
        """Returns True if source supports USB Suspend"""
        if len(self.body) < 4:
            return False
        raw = int.from_bytes(self.body[0:4], byteorder='little')
        return bool((raw >> 23) & 0x1)

    @property
    def unconstrained_power(self) -> bool:
        """Returns True if source provides unconstrained power"""
        if len(self.body) < 4:
            return False
        raw = int.from_bytes(self.body[0:4], byteorder='little')
        return bool((raw >> 22) & 0x1)

    @property
    def usb_comms_capable(self) -> bool:
        """Returns True if source supports USB communications"""
        if len(self.body) < 4:
            return False
        raw = int.from_bytes(self.body[0:4], byteorder='little')
        return bool((raw >> 21) & 0x1)

    @property
    def dual_role_data(self) -> bool:
        """Returns True if source supports dual-role data"""
        if len(self.body) < 4:
            return False
        raw = int.from_bytes(self.body[0:4], byteorder='little')
        return bool((raw >> 20) & 0x1)

    @property
    def highest_voltage_v(self) -> int:
        """Returns the highest source Vbus voltage in volts"""
        if len(self.body) < 4:
            return 0
        raw = int.from_bytes(self.body[0:4], byteorder='little')
        voltage_units = (raw >> 16) & 0xF  # Get bits 19-16
        return voltage_units * 4  # Convert 4V units to actual volts

    @property
    def renderable_properties(self) -> Dict[str, str]:
        """Returns a dictionary of properties for display"""
        properties = super().renderable_properties

        properties.update({
            "Dual-Role Power": "Yes" if self.dual_role_power else "No",
            "USB Suspend Support": "Yes" if self.usb_suspend_supported else "No",
            "Power Type": "Unconstrained" if self.unconstrained_power else "Constrained",
            "USB Communications": "Capable" if self.usb_comms_capable else "Not Capable",
            "Dual-Role Data": "Yes" if self.dual_role_data else "No",
            "Highest Vbus Voltage": f"{self.highest_voltage_v}V"
        })

        return properties
