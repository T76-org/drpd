"""EPR (Extended Power Range) Request Message."""

from typing import Dict, Any

from ._base import StandardMessage
from ..data_objects import RequestDO, SourcePDO


class EPRRequestMessage(StandardMessage):
    """
    Decode wrapper for EPR_Request (USB-PD 3.2 Section 6.4.9).

    The EPR_Request message carries an RDO whose layout follows the same
    RDO family used by Request messages, with EPR-specific use in EPR mode.
    """

    @property
    def name(self) -> str:
        return "EPR_Request"

    @classmethod
    def encode(cls, rdo: RequestDO | int) -> bytes:
        """
        Encode an EPR_Request body from an RDO object or a raw 32-bit word.
        """
        if isinstance(rdo, RequestDO):
            return rdo.encode()
        return int(rdo & 0xFFFFFFFF).to_bytes(4, "little")

    @property
    def raw_rdo(self) -> int:
        if len(self.body) < 4:
            return 0
        return int.from_bytes(self.body[0:4], byteorder="little", signed=False)

    @property
    def rdo(self) -> RequestDO:
        pdo = self.requested_pdo_copy
        if pdo is None:
            return RequestDO.guess_from_raw(self.raw_rdo)
        return RequestDO.from_raw_and_pdo(self.raw_rdo, pdo)

    @property
    def raw_requested_pdo_copy(self) -> int:
        if len(self.body) < 8:
            return 0
        return int.from_bytes(self.body[4:8], byteorder="little", signed=False)

    @property
    def requested_pdo_copy(self) -> SourcePDO | None:
        if len(self.body) < 8:
            return None
        return SourcePDO.from_raw(self.raw_requested_pdo_copy)

    @property
    def renderable_properties(self) -> Dict[str, str]:
        properties = super().renderable_properties
        rdo_dict: Dict[str, Any] = self.rdo.to_dict()
        block = self._format_fields_block(rdo_dict)
        properties["Request Data Object"] = block
        properties["RDO"] = block
        pdo = self.requested_pdo_copy
        if pdo is not None:
            properties["Requested PDO Copy"] = self._format_fields_block(pdo.to_dict())
        return properties
