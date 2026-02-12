"""EPR Sink Capabilities (PD 3.x extended)."""

from typing import Dict, List, Any

from ._base import ExtendedMessage
from ..data_objects import SinkPDO


class EPRSinkCapabilitiesMessage(ExtendedMessage):
    """
    EPR_Sink_Capabilities wrapper (USB-PD 3.2 Section 6.5.15.3).
    Payload is a list of 32-bit Sink (A)PDOs in little-endian order.
    """

    @property
    def name(self) -> str:
        return "EPR_Sink_Capabilities"

    @property
    def sink_power_data_objects(self) -> List[SinkPDO]:
        if self.extended_header.chunked and not self.payload_complete:
            return []
        return [SinkPDO.from_raw(word) for word in self.payload_words_le]

    @property
    def renderable_properties(self) -> Dict[str, str]:
        props = super().renderable_properties
        props.update(self.renderable_extended)
        pdos = self.sink_power_data_objects
        props["PDO Count"] = str(len(pdos))
        if pdos:
            blocks = []
            for idx, pdo in enumerate(pdos, start=1):
                pdo_dict: Dict[str, Any] = pdo.to_dict()
                lines = [f"EPR Sink PDO #{idx}"]
                lines.append(self._format_fields_block(pdo_dict))
                blocks.append("\n".join(lines))
            props["PDOs"] = "\n\n".join(blocks)
        else:
            props["PDOs"] = "(none)"
        return props
