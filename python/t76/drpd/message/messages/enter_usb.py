"""
Enter USB Message
"""
from typing import Dict

from ._base import StandardMessage


class EnterUSBMessage(StandardMessage):
    """
    Class representing an Enter USB USB-PD message.
    Contains one Enter USB Data Object (EUDO) which specifies USB4 parameters and state.

    EUDO format (32-bit):
    - Bits 31-28: Reserved, shall be set to 0
    - Bits 27-24: Host Present Data Operation Rate (0-15)
    - Bits 23:    USB4 DRD supported, 1=yes
    - Bits 22:    USB3 DRD supported, 1=yes
    - Bits 21:    USB4 Device supported, 1=yes
    - Bits 20:    USB3 Device supported, 1=yes
    - Bits 19:    USB4 Host supported, 1=yes
    - Bits 18:    USB3 Host supported, 1=yes
    - Bits 17-16: Cable Speed Support
    - Bits 15-8:  Reserved, shall be set to 0
    - Bits 7-0:   Reserved, shall be set to 0
    """
    @property
    def name(self) -> str:
        return "Enter_USB"

    @classmethod
    def encode(cls, host_data_rate: int = 0, usb4_drd_supported: bool = False,
               usb3_drd_supported: bool = False, usb4_device_supported: bool = False,
               usb3_device_supported: bool = False, usb4_host_supported: bool = False,
               usb3_host_supported: bool = False, cable_speed: int = 0) -> bytes:
        """
        Creates a bytes representation of an Enter USB message.

        Args:
            host_data_rate: Host Present Data Operation Rate (0-15)
            usb4_drd_supported: Whether USB4 DRD is supported
            usb3_drd_supported: Whether USB3 DRD is supported
            usb4_device_supported: Whether USB4 Device mode is supported
            usb3_device_supported: Whether USB3 Device mode is supported
            usb4_host_supported: Whether USB4 Host mode is supported
            usb3_host_supported: Whether USB3 Host mode is supported
            cable_speed: Cable Speed Support value (0-3)

        Returns:
            bytes: The encoded message body (4 bytes)
        """
        eudo = 0
        eudo |= (host_data_rate & 0xF) << 24
        eudo |= (1 if usb4_drd_supported else 0) << 23
        eudo |= (1 if usb3_drd_supported else 0) << 22
        eudo |= (1 if usb4_device_supported else 0) << 21
        eudo |= (1 if usb3_device_supported else 0) << 20
        eudo |= (1 if usb4_host_supported else 0) << 19
        eudo |= (1 if usb3_host_supported else 0) << 18
        eudo |= (cable_speed & 0x3) << 16
        return eudo.to_bytes(4, 'little')

    @property
    def host_data_rate(self) -> int:
        """Returns the Host Present Data Operation Rate (0-15)"""
        if len(self.body) < 4:
            return 0
        raw = int.from_bytes(self.body[0:4], byteorder='little')
        return (raw >> 24) & 0xF

    @property
    def usb4_drd_supported(self) -> bool:
        """Returns True if USB4 DRD is supported"""
        if len(self.body) < 4:
            return False
        raw = int.from_bytes(self.body[0:4], byteorder='little')
        return bool((raw >> 23) & 0x1)

    @property
    def usb3_drd_supported(self) -> bool:
        """Returns True if USB3 DRD is supported"""
        if len(self.body) < 4:
            return False
        raw = int.from_bytes(self.body[0:4], byteorder='little')
        return bool((raw >> 22) & 0x1)

    @property
    def usb4_device_supported(self) -> bool:
        """Returns True if USB4 Device mode is supported"""
        if len(self.body) < 4:
            return False
        raw = int.from_bytes(self.body[0:4], byteorder='little')
        return bool((raw >> 21) & 0x1)

    @property
    def usb3_device_supported(self) -> bool:
        """Returns True if USB3 Device mode is supported"""
        if len(self.body) < 4:
            return False
        raw = int.from_bytes(self.body[0:4], byteorder='little')
        return bool((raw >> 20) & 0x1)

    @property
    def usb4_host_supported(self) -> bool:
        """Returns True if USB4 Host mode is supported"""
        if len(self.body) < 4:
            return False
        raw = int.from_bytes(self.body[0:4], byteorder='little')
        return bool((raw >> 19) & 0x1)

    @property
    def usb3_host_supported(self) -> bool:
        """Returns True if USB3 Host mode is supported"""
        if len(self.body) < 4:
            return False
        raw = int.from_bytes(self.body[0:4], byteorder='little')
        return bool((raw >> 18) & 0x1)

    @property
    def cable_speed(self) -> int:
        """Returns the Cable Speed Support value (0-3)"""
        if len(self.body) < 4:
            return 0
        raw = int.from_bytes(self.body[0:4], byteorder='little')
        return (raw >> 16) & 0x3

    @property
    def renderable_properties(self) -> Dict[str, str]:
        """Returns a dictionary of properties for display"""
        properties = super().renderable_properties

        # Map cable speed values to descriptive strings
        speed_map = {
            0: "USB 3.2 Gen 1x1",
            1: "USB 3.2 Gen 2x1",
            2: "USB 3.2 Gen 2x2",
            3: "USB4 Gen 3x2"
        }

        properties.update({
            "Host Data Rate": f"{self.host_data_rate}",
            "Cable Speed": speed_map.get(self.cable_speed, f"Unknown ({self.cable_speed})"),
            "USB4 DRD Mode": "✓ Supported" if self.usb4_drd_supported else "✗ Not Supported",
            "USB3 DRD Mode": "✓ Supported" if self.usb3_drd_supported else "✗ Not Supported",
            "USB4 Device Mode": "✓ Supported" if self.usb4_device_supported else "✗ Not Supported",
            "USB3 Device Mode": "✓ Supported" if self.usb3_device_supported else "✗ Not Supported",
            "USB4 Host Mode": "✓ Supported" if self.usb4_host_supported else "✗ Not Supported",
            "USB3 Host Mode": "✓ Supported" if self.usb3_host_supported else "✗ Not Supported"
        })

        return properties
