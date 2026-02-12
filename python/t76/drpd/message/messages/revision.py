"""
Revision Message
"""
from typing import Dict

from ._base import StandardMessage


class RevisionMessage(StandardMessage):
    """
    Class representing a Revision USB-PD message.
    Contains one Revision Data Object (RDO) which indicates the supported
    USB-PD specification version information.

    RDO format (32-bit):
    - Bits 31-16: Reserved, shall be set to 0
    - Bits 15-12: Major Version Number (1-3)
    - Bits 11-8:  Minor Version Number (0-9)
    - Bits 7-0:   Reserved, shall be set to 0
    """
    @property
    def name(self) -> str:
        return "Revision"

    @classmethod
    def encode(cls, major_version: int = 3, minor_version: int = 1) -> bytes:
        """
        Creates a bytes representation of a Revision message.

        Args:
            major_version: Major version number (1-3)
            minor_version: Minor version number (0-9)

        Returns:
            bytes: The encoded message body (4 bytes)
        """
        rdo = 0
        rdo |= (major_version & 0xF) << 12
        rdo |= (minor_version & 0xF) << 8
        return rdo.to_bytes(4, 'little')

    @property
    def major_version(self) -> int:
        """Returns the major version number (1-3)"""
        if len(self.body) < 4:
            return 0
        raw = int.from_bytes(self.body[0:4], byteorder='little')
        return (raw >> 12) & 0xF

    @property
    def minor_version(self) -> int:
        """Returns the minor version number (0-9)"""
        if len(self.body) < 4:
            return 0
        raw = int.from_bytes(self.body[0:4], byteorder='little')
        return (raw >> 8) & 0xF

    @property
    def version_string(self) -> str:
        """Returns the version as a string in format 'major.minor'"""
        return f"{self.major_version}.{self.minor_version}"

    @property
    def renderable_properties(self) -> Dict[str, str]:
        """Returns a dictionary of properties for display"""
        properties = super().renderable_properties

        properties.update({
            "PD Specification Version": self.version_string,
            "Major Version": str(self.major_version),
            "Minor Version": str(self.minor_version)
        })

        return properties
