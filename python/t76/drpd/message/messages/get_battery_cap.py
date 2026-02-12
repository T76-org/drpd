"""
Get Battery Capabilities (PD 3.x Extended)
"""
from typing import Dict

from ._base import ExtendedMessage


class GetBatteryCapabilitiesMessage(ExtendedMessage):
    """
    Extended request to query battery capabilities.

    Typical payload contains a 1-byte Battery Reference (index). If empty,
    the request may be for all batteries.
    """

    @property
    def name(self) -> str:
        return "Get_Battery_Cap"

    @property
    def battery_reference(self) -> int:
        b = self.payload_bytes
        return b[0] if len(b) >= 1 else 0

    @classmethod
    def encode(cls, battery_reference: int = 0) -> bytes:
        # Extended header is added by upper layers; we return payload only.
        return bytes([battery_reference & 0xFF])

    @property
    def renderable_properties(self) -> Dict[str, str]:
        props = super().renderable_properties
        props.update(self.renderable_extended)
        props.update({
            "Battery Reference": f"{self.battery_reference}"
        })
        return props
