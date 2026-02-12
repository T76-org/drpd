"""
Get Manufacturer Info (PD 3.x Extended)
"""
from typing import Dict

from ._base import ExtendedMessage


class GetManufacturerInfoMessage(ExtendedMessage):
    """
    Extended request to read manufacturer information.

    Typical payload: an Info Type selector and optional string index.
    We expose the first two bytes as type and index when present.
    """

    @property
    def name(self) -> str:
        return "Get_Manufacturer_Info"

    @property
    def info_type(self) -> int:
        b = self.payload_bytes
        return b[0] if len(b) >= 1 else 0

    @property
    def string_index(self) -> int:
        b = self.payload_bytes
        return b[1] if len(b) >= 2 else 0

    @classmethod
    def encode(cls, info_type: int = 0, string_index: int = 0) -> bytes:
        return bytes([info_type & 0xFF, string_index & 0xFF])

    @property
    def renderable_properties(self) -> Dict[str, str]:
        props = super().renderable_properties
        props.update(self.renderable_extended)
        props.update({
            "Info Type": f"0x{self.info_type:02X}",
            "String Index": f"0x{self.string_index:02X}",
        })
        return props
