"""
Get Battery Status (PD 3.x Extended)
"""
from typing import Dict

from ._base import ExtendedMessage


class GetBatteryStatusMessage(ExtendedMessage):
    """
    Extended request to query battery status.

    Typical payload contains a 1-byte Battery Reference (index).
    """

    @property
    def name(self) -> str:
        return "Get_Battery_Status"

    @property
    def battery_reference(self) -> int:
        b = self.payload_bytes
        return b[0] if len(b) >= 1 else 0

    @classmethod
    def encode(cls, battery_reference: int = 0) -> bytes:
        return bytes([battery_reference & 0xFF])

    @property
    def renderable_properties(self) -> Dict[str, str]:
        props = super().renderable_properties
        props.update(self.renderable_extended)
        props.update({
            "Battery Reference": f"{self.battery_reference}"
        })
        return props
