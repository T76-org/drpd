"""
Manufacturer Info (PD 3.x Extended)
"""
from typing import Dict

from ._base import ExtendedMessage


class ManufacturerInfoMessage(ExtendedMessage):
    """
    Extended response with manufacturer information.

    Payload often contains ASCII/UTF-8 strings and/or structured fields.
    We expose both raw words and an attempted textual decode.
    """

    @property
    def name(self) -> str:
        return "Manufacturer_Info"

    @property
    def decoded_text(self) -> str:
        b = self.payload_bytes
        try:
            s = b.decode("utf-8", errors="ignore").strip()
            return s if s else "(none)"
        except UnicodeDecodeError:
            return "(none)"

    @property
    def renderable_properties(self) -> Dict[str, str]:
        props = super().renderable_properties
        props.update(self.renderable_extended)
        props.update({
            "Decoded Text": self.decoded_text,
        })
        return props
