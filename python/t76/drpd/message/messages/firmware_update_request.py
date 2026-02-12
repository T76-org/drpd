"""
Firmware Update Request (PD 3.x Extended)
"""
from typing import Dict

from ._base import ExtendedMessage


class FirmwareUpdateRequestMessage(ExtendedMessage):
    """
    Extended message used to request firmware update actions.
    """

    @property
    def name(self) -> str:
        return "Firmware_Update_Request"

    @property
    def renderable_properties(self) -> Dict[str, str]:
        props = super().renderable_properties
        props.update(self.renderable_extended)
        return props
