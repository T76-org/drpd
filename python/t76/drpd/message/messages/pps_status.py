"""
PPS Status (PD 3.x Extended)
"""
from typing import Dict

from ._base import ExtendedMessage


class PPSStatusMessage(ExtendedMessage):
    """
    Extended PPS Status message.

    We provide a general view and a simple attempt to decode the first two
    bytes as a voltage code (20 mV units) and next two as a current code
    (50 mA units). When payload doesn't match, fields show 0.
    """

    @property
    def name(self) -> str:
        return "PPS_Status"

    @property
    def voltage_mv(self) -> int:
        b = self.payload_bytes
        if len(b) >= 2:
            return int.from_bytes(b[0:2], "little") * 20
        return 0

    @property
    def current_ma(self) -> int:
        b = self.payload_bytes
        if len(b) >= 4:
            return int.from_bytes(b[2:4], "little") * 50
        return 0

    @property
    def renderable_properties(self) -> Dict[str, str]:
        props = super().renderable_properties
        props.update(self.renderable_extended)
        props.update({
            "Voltage": f"{self.voltage_mv} mV" if self.voltage_mv else "(unknown)",
            "Current": f"{self.current_ma} mA" if self.current_ma else "(unknown)",
        })
        return props
