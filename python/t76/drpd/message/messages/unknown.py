"""
Unknown Message
"""
from ._base import StandardMessage


class UnknownMessage(StandardMessage):
    """
    Class representing an unknown or unrecognized USB-PD message.
    It inherits from the StandardMessage class and does not add any additional functionality.
    """
    @property
    def name(self) -> str:
        return "Unknown"
