"""
Alert Message
"""
from typing import List, Dict, Optional

from ._base import StandardMessage
from ..data_objects import AlertDataObject, ExtendedADO


class AlertMessage(StandardMessage):
    """
    Class representing a USB-PD Alert data message.

    Per the USB-PD spec, Alert is a standard data message and does not use the
    Extended Message format. When the `Extended Alert Event` bit is set in the
    ADO, any additional alert information is conveyed via subsequent 32-bit
    words in the same standard message body (i.e., additional ADO/Extended ADO
    words), not via an Extended Header + payload.
    """
    @property
    def name(self) -> str:
        return "Alert"

    @classmethod
    def encode(cls, ado: AlertDataObject, extended_alert_data: Optional[List[ExtendedADO]] = None) -> bytes:
        """
        Creates a bytes representation of an Alert message.

        Args:
            ado: AlertDataObject to encode
            extended_alert_data: Optional list of additional 32-bit alert words
                (e.g., ExtendedADO objects) to append after the primary ADO.

        Returns:
            bytes: The encoded message body
        """
        body = []

        # Add the main ADO (4 bytes)
        ado_raw = getattr(ado, 'raw_value', 0)
        body.extend(ado_raw.to_bytes(4, 'little'))

        # Append any additional 32-bit alert words (no Extended Header involved)
        if extended_alert_data:
            for eado in extended_alert_data:
                eado_raw = getattr(eado, 'raw_value', 0)
                body.extend(eado_raw.to_bytes(4, 'little'))

        return bytes(body)

    @property
    def alert_data_object(self) -> AlertDataObject:
        """
        Returns the Alert Data Object from the message body.
        """
        if len(self.body) < 4:
            # If message is too short, return empty ADO
            return AlertDataObject(0)

        ado_raw = int.from_bytes(
            self.body[0:4], byteorder="little", signed=False)
        return AlertDataObject(ado_raw)

    @property
    def extended_alert_data(self) -> List[ExtendedADO]:
        """
        Returns additional 32-bit alert words following the primary ADO.
        If the `Extended Alert Event` bit is not set, this will be empty.
        """
        ado = self.alert_data_object
        if not ado.extended_alert_event:
            return []

        # Parse subsequent 32-bit words from the standard body (after first 4 bytes)
        words: List[int] = []
        for i in range(4, len(self.body), 4):
            if i + 3 >= len(self.body):
                break
            words.append(int.from_bytes(
                self.body[i:i+4], 'little', signed=False))
        return [ExtendedADO.from_raw(w) for w in words]

    @property
    def renderable_properties(self) -> Dict[str, str]:
        """
        Returns a dictionary of properties that can be rendered for display.
        Includes the Alert Data Object fields and any Extended Alert Data.
        """
        properties = super().renderable_properties

        # Add ADO info as a block
        ado = self.alert_data_object
        ado_dict = ado.to_dict()
        properties["Alert Data Object"] = self._format_fields_block(ado_dict)

        # Add additional alert words (if present) as Extended ADOs
        extended_alerts = self.extended_alert_data
        if extended_alerts:
            blocks: List[str] = []
            for i, eado in enumerate(extended_alerts, 1):
                d = eado.to_dict()
                lines = [f"Extended ADO #{i}"]
                lines.append(self._format_fields_block(d))
                blocks.append("\n".join(lines))
            properties["Extended Alert Data"] = "\n\n".join(blocks)
        else:
            properties["Extended Alert Data"] = "(none)"

        return properties
