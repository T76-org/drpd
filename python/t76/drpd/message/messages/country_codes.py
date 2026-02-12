"""
Country Codes (PD 3.x Extended)
"""
from typing import Dict, List

from ._base import ExtendedMessage


class CountryCodesMessage(ExtendedMessage):
    """
    Extended response listing supported country codes.

    Payload is a sequence of 16-bit codes (ISO 3166-1 numeric).
    """

    @property
    def name(self) -> str:
        return "Country_Codes"

    @property
    def codes(self) -> List[int]:
        b = self.payload_bytes
        out: List[int] = []
        for i in range(0, len(b), 2):
            if i + 2 <= len(b):
                out.append(int.from_bytes(b[i:i+2], "little"))
        return out

    @property
    def renderable_properties(self) -> Dict[str, str]:
        props = super().renderable_properties
        props.update(self.renderable_extended)
        if self.codes:
            props.update({
                "Country Codes": ", ".join(f"{c} (0x{c:04X})" for c in self.codes)
            })
        return props
