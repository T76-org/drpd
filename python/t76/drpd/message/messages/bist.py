"""
BIST (Built-in Self Test) Message
"""
from typing import List, Dict, Any

from ._base import StandardMessage
from ..data_objects import BistDataObject


class BISTMessage(StandardMessage):
    """
    Class representing a USB-PD BIST message.

    The BIST message body contains one or seven 32-bit BIST Data Objects (BDOs).
    This class extracts each 32-bit BDO, decodes it into the proper subclass,
    and exposes convenient renderable properties.
    """

    @property
    def name(self) -> str:
        """Human-readable message name."""
        return "BIST"

    @classmethod
    def encode(cls, bdos: List[BistDataObject]) -> bytes:
        """
        Creates a bytes representation of a BIST message.

        Args:
            bdos: List of BistDataObject objects to encode

        Returns:
            bytes: The encoded message body
        """
        body = []
        for bdo in bdos:
            raw_value = bdo.raw if hasattr(bdo, 'raw') else 0
            body.extend(raw_value.to_bytes(4, 'little'))
        return bytes(body)

    # ---- Parsing helpers ----

    @property
    def data_objects_raw(self) -> List[int]:
        """
        Return all 32-bit words parsed little-endian from the message body.
        Any trailing bytes < 4 are ignored.
        """
        raw_list: List[int] = []
        for i in range(0, len(self.body), 4):
            if i + 3 >= len(self.body):
                break
            raw_list.append(int.from_bytes(
                self.body[i:i+4], byteorder="little", signed=False))
        return raw_list

    @property
    def bist_data_objects(self) -> List["BistDataObject"]:
        """
        Decode each raw 32-bit word into a typed BistDataObject subclass.
        """
        return [BistDataObject.from_raw(x) for x in self.data_objects_raw]

    @property
    def primary_bdo(self) -> "BistDataObject | None":
        """
        Convenience accessor: the first BDO if present, else None.
        """
        objs = self.bist_data_objects
        return objs[0] if objs else None

    @property
    def renderable_properties(self) -> Dict[str, str]:
        """
        A dictionary of stringified properties suitable for UI rendering.

        Includes:
            - Count of BDOs
            - Each BDO pretty-printed via to_dict()
        """
        properties = super().renderable_properties

        objs = self.bist_data_objects
        properties["BDO Count"] = str(len(objs))

        blocks: List[str] = []
        for i, bdo in enumerate(objs, start=1):
            d: Dict[str, Any] = bdo.to_dict()
            blocks.append(f"BDO #{i}\n{self._format_fields_block(d)}")

        properties["BIST Data Objects"] = "\n\n".join(
            blocks) if blocks else "(none)"
        return properties
