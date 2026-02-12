"""
Sink Capabilities Message
"""
from typing import List, Dict, Any

from ._base import StandardMessage
from ..data_objects import SinkPDO


class SinkCapabilitiesMessage(StandardMessage):
    """
    Class representing a Sink Capabilities USB-PD message.

    The message body is a sequence of 32-bit Sink PDO/APDO words (little-endian).
    This wrapper decodes each word into a `SinkPDO` subclass and provides a
    UI-friendly `renderable_properties` view.
    """

    @property
    def name(self) -> str:
        return "Sink_Capabilities"

    @classmethod
    def encode(cls, pdos: List[SinkPDO]) -> bytes:
        """
        Creates a bytes representation of a Sink Capabilities message.

        Args:
            pdos: List of SinkPDO objects to encode

        Returns:
            bytes: The encoded message body
        """
        body = []
        for pdo in pdos:
            raw_value = pdo.raw if hasattr(pdo, 'raw') else 0
            body.extend(raw_value.to_bytes(4, 'little'))
        return bytes(body)

    @property
    def sink_power_data_objects(self) -> List["SinkPDO"]:
        """
        Returns the list of Sink Power Data Objects (PDOs/APDOs) contained in the message.
        Each PDO is represented as a `SinkPDO` instance created from the raw 32-bit value.
        """
        pdo_list: List["SinkPDO"] = []
        # Body is a list of bytes; each PDO is 4 bytes (32 bits), little-endian
        for i in range(0, len(self.body), 4):
            if i + 3 < len(self.body):
                raw = int.from_bytes(
                    self.body[i:i + 4], byteorder="little", signed=False)
                pdo_list.append(SinkPDO.from_raw(raw))
        return pdo_list

    @property
    def renderable_properties(self) -> Dict[str, str]:
        """
        Build a dictionary suitable for UI rendering:
          - PDO Count
          - Pretty-printed details for each PDO/APDO via `to_dict()`
        """
        properties = super().renderable_properties

        pdos = self.sink_power_data_objects
        properties["PDO Count"] = str(len(pdos))

        if pdos:
            blocks: List[str] = []
            for idx, pdo in enumerate(pdos, start=1):
                d: Dict[str, Any] = pdo.to_dict()
                # Show the index first, then key/value pairs
                lines = [f"Sink PDO #{idx}"]
                lines.append(self._format_fields_block(d))
                blocks.append("\n".join(lines))
            properties["PDOs"] = "\n\n".join(blocks)
        else:
            properties["PDOs"] = "(none)"

        return properties
