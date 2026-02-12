"""
Get Country Info Message
"""
from typing import Dict

from ._base import StandardMessage


class GetCountryInfoMessage(StandardMessage):
    """
    Class representing a Get Country Info USB-PD message.
    Contains one Country Info Data Object (CIDO) which specifies the range
    of country codes to retrieve from a port partner.

    CIDO format (32-bit):
    - Bits 31-16: Last Country Code (0-0xFFFF)
    - Bits 15-0:  First Country Code (0-0xFFFF)

    Country codes are specified according to ISO 3166-1 numeric standard.
    """
    @property
    def name(self) -> str:
        return "Get_Country_Info"

    @classmethod
    def encode(cls, first_country_code: int, last_country_code: int) -> bytes:
        """
        Creates a bytes representation of a Get Country Info message.

        Args:
            first_country_code: First country code in the requested range (0-0xFFFF)
            last_country_code: Last country code in the requested range (0-0xFFFF)

        Returns:
            bytes: The encoded message body (4 bytes)
        """
        cido = 0
        cido |= (first_country_code & 0xFFFF)
        cido |= (last_country_code & 0xFFFF) << 16
        return cido.to_bytes(4, 'little')

    @property
    def first_country_code(self) -> int:
        """Returns the first country code in the requested range"""
        if len(self.body) < 4:
            return 0
        raw = int.from_bytes(self.body[0:4], byteorder='little')
        return raw & 0xFFFF

    @property
    def last_country_code(self) -> int:
        """Returns the last country code in the requested range"""
        if len(self.body) < 4:
            return 0
        raw = int.from_bytes(self.body[0:4], byteorder='little')
        return (raw >> 16) & 0xFFFF

    @property
    def renderable_properties(self) -> Dict[str, str]:
        """Returns a dictionary of properties for display"""
        properties = super().renderable_properties

        properties.update({
            "First Country Code": f"{self.first_country_code} (0x{self.first_country_code:04X})",
            "Last Country Code": f"{self.last_country_code} (0x{self.last_country_code:04X})"
        })

        return properties
