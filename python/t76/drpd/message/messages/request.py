"""
Request Message
"""
from typing import List, Dict, Tuple, Any

from ._base import StandardMessage
from ..data_objects import RequestDO, SourcePDO


class RequestMessage(StandardMessage):
    """
    Class representing a USB-PD Request message.

    The Request message body contains exactly one 32-bit Request Data Object (RDO/ARDO).
    This class extracts that RDO, exposes it as a typed object, and can optionally
    resolve/validate it against the advertised Source PDO/APDO list.
    """

    @property
    def name(self) -> str:
        """Human-readable message name."""
        return "Request"

    @classmethod
    def from_rdo(cls, rdo: RequestDO) -> 'RequestMessage':
        """
        Creates a Request message from a given RDO.

        Args:
            rdo: RequestDO object to encode

        Returns:
            RequestMessage: The encoded message body
        """
        return cls([rdo.raw])

    @property
    def rdo_raw(self) -> int:
        """
        The 32-bit raw Request Data Object (little-endian) extracted from the message body.
        Returns 0 if fewer than 4 bytes are present.
        """
        if len(self.body) < 4:
            return 0
        return int.from_bytes(self.body[0:4], byteorder="little", signed=False)

    @property
    def request_data_object(self) -> "RequestDO":
        """
        The Request Data Object as a best-effort typed instance.

        Note:
            Without the referenced PDO, we cannot *guarantee* exact subclass disambiguation
            for APDO requests (e.g., PPS vs AVS EPR). This uses RequestDO.guess_from_raw().
            For precise typing, use `resolved_request(pdos)` which inspects the referenced PDO.
        """
        return RequestDO.guess_from_raw(self.rdo_raw)

    def resolved_request(
        self, pdos: List["SourcePDO"]
    ) -> Tuple["SourcePDO", "RequestDO", bool]:
        """
        Resolve this Request against the advertised Source PDOs and validate it.

        Args:
            pdos: The Source_Capabilities PDO/APDO list in 1-based order.

        Returns:
            A tuple of (referenced_pdo, typed_rdo, is_compatible).

        Raises:
            IndexError: if the referenced PDO index is out of range.
        """
        # Get a preliminary RDO to read the object position
        prelim_rdo = self.request_data_object
        idx = prelim_rdo.object_position  # 1-based index
        if idx <= 0 or idx > len(pdos):
            raise IndexError(
                f"Referenced PDO index {idx} out of range (have {len(pdos)}).")

        pdo = pdos[idx - 1]
        # Build the precise RDO subclass using the referenced PDO type
        rdo = RequestDO.from_raw_and_pdo(self.rdo_raw, pdo)
        ok = rdo.is_compatible_with(pdo)
        return pdo, rdo, ok

    @property
    def renderable_properties(self) -> Dict[str, str]:
        """
        A dictionary of stringified properties suitable for UI rendering.

        Includes object position and decoded request details.
        """
        properties = super().renderable_properties

        rdo = self.request_data_object
        rdo_dict: Dict[str, Any] = rdo.to_dict()

        # Pretty-print decoded RDO fields from the available payload.
        properties.update(
            {
                "Referenced Power Data Object": str(rdo.object_position),
                "Request Data Object": self._format_fields_block(rdo_dict),
                "RDO": self._format_fields_block(rdo_dict),
            }
        )
        return properties
