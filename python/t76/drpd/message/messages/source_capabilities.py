"""
Source Capabilities Message
"""
from typing import List, Dict, Optional

from ._base import StandardMessage
from ..data_objects import SourcePDO


class SourceCapabilitiesMessage(StandardMessage):
    """
    Class representing a Source Capabilities USB-PD message.
    It inherits from the StandardMessage class and does not add any additional functionality.
    """
    @property
    def name(self) -> str:
        return "Source_Capabilities"

    @classmethod
    def encode(cls, pdos: List[SourcePDO]) -> bytes:
        """
        Creates a bytes representation of a Source Capabilities message.

        Args:
            pdos: List of SourcePDO objects to encode

        Returns:
            bytes: The encoded message body
        """
        body = []
        for pdo in pdos:
            raw_value = pdo.raw if hasattr(pdo, 'raw') else 0
            body.extend(raw_value.to_bytes(4, 'little'))
        return bytes(body)

    @property
    def power_data_objects(self) -> List[SourcePDO]:
        """
        Returns the list of Power Data Objects (PDOs) in the Source Capabilities message.
        Each PDO is represented as a SourcePDO instance, which is created from the
        raw 32-bit unsigned integer in the message body.
        """
        # Our body is a list of integers, each representing a byte in the message.
        # Each PDO is 4 bytes (32 bits), so we need to group the body into chunks of 4.
        pdo_list = []

        for i in range(0, len(self.body), 4):
            if i + 3 < len(self.body):
                pdo_value = int.from_bytes(
                    self.body[i:i+4], byteorder='little')
                pdo = SourcePDO.from_raw(pdo_value)
                pdo_list.append(pdo)

        return pdo_list

    @property
    def renderable_properties(self) -> Dict[str, str]:
        properties = super().renderable_properties

        pdos = []

        for pdo in self.power_data_objects:
            pdos.append(self._format_fields_block(pdo.to_dict()))
        properties["PDOs"] = "\n\n".join(pdos)

        return properties

    def best_fit_pdo_for_need(self, voltage: float, current: float) -> Optional[SourcePDO]:
        """
        Finds the best-fit Power Data Object (PDO) for the specified power needs.

        Args:
            voltage_min (float): Minimum voltage requirement.
            voltage_max (float): Maximum voltage requirement.
            current_min (float): Minimum current requirement.
            current_max (float): Maximum current requirement.

        Returns:
            Optional[SourcePDO]: The best-fit PDO or None if no suitable PDO is found.
        """
        for pdo in self.power_data_objects:
            if pdo.supports(voltage, current):
                return pdo

        return None
