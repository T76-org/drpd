"""
Generic Extended Message
"""
from typing import List, Dict

from ._base import ExtendedMessage
from ..header import MessageType


class GenericExtendedMessage(ExtendedMessage):
    """
    Minimal wrapper for PD extended messages when no specialized
    subclass exists yet.
    """

    def __init__(self, body: List[int], message_type: MessageType):
        super().__init__(body)
        self._message_type = message_type

    @property
    def name(self) -> str:
        return self._message_type.value

    @property
    def renderable_properties(self) -> Dict[str, str]:
        props = super().renderable_properties
        props.update(self.renderable_extended)
        return props
