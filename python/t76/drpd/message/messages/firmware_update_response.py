"""
Firmware Update Response (PD 3.x Extended)
"""
from typing import Dict

from ._base import ExtendedMessage


class FirmwareUpdateResponseMessage(ExtendedMessage):
    """
    Extended message used to respond to firmware update actions.
    """

    @property
    def name(self) -> str:
        return "Firmware_Update_Response"

    @property
    def renderable_properties(self) -> Dict[str, str]:
        props = super().renderable_properties
        props.update(self.renderable_extended)
        return props
