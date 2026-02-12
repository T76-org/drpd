"""
Control Message
"""
from typing import List

from ._base import StandardMessage
from ..header import MessageType


class ControlMessage(StandardMessage):
    """
    Class representing a control USB-PD message.
    It inherits from the StandardMessage class and does not add any additional functionality.
    """

    def __init__(self, body: List[int], message_type: MessageType):
        super().__init__(body)
        self._message_type = message_type

    @property
    def name(self) -> str:
        return self._message_type.value
