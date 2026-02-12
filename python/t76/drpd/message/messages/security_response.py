"""
Security Response (PD 3.x Extended)
"""
from typing import Dict

from ._base import ExtendedMessage


class SecurityResponseMessage(ExtendedMessage):
    """
    Extended message for security/authentication response payloads.
    """

    @property
    def name(self) -> str:
        return "Security_Response"

    @property
    def renderable_properties(self) -> Dict[str, str]:
        props = super().renderable_properties
        props.update(self.renderable_extended)
        return props
