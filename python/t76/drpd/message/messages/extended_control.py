"""Extended Control (PD 3.x extended)."""

from typing import Dict

from ._base import ExtendedMessage


class ExtendedControlMessage(ExtendedMessage):
    """
    Extended_Control wrapper (USB-PD 3.2 Section 6.5.14, Table 6.66).

    ECDB layout:
    - Byte 0: Type
    - Byte 1: Data (set to zero when not used for current defined types)
    """

    _TYPE_NAMES = {
        0x01: "EPR_Get_Source_Cap",
        0x02: "EPR_Get_Sink_Cap",
        0x03: "EPR_KeepAlive",
        0x04: "EPR_KeepAlive_Ack",
    }

    @property
    def name(self) -> str:
        return "Extended_Control"

    @property
    def ecdb_type(self) -> int:
        payload = self.payload_bytes
        if not payload:
            return 0
        return payload[0]

    @property
    def ecdb_data(self) -> int:
        payload = self.payload_bytes
        if len(payload) < 2:
            return 0
        return payload[1]

    @property
    def ecdb_size_valid(self) -> bool:
        """
        ECDB is fixed at 2 bytes (Type + Data) per USB-PD 3.2 Table 6.66.
        """
        return (
            self.payload_expected_length == 2
            and self.payload_complete
            and len(self.payload_bytes) == 2
        )

    @property
    def ecdb_type_name(self) -> str:
        if not self.ecdb_size_valid:
            return "Unavailable"
        return self._TYPE_NAMES.get(self.ecdb_type, "Reserved")

    @property
    def ecdb_data_must_be_zero(self) -> bool:
        """Known currently-defined ECDB types require Data=0x00."""
        return self.ecdb_type in self._TYPE_NAMES

    @property
    def ecdb_data_valid(self) -> bool:
        """True when ECDB Data field is valid for the decoded type."""
        if not self.ecdb_size_valid:
            return False
        if self.ecdb_data_must_be_zero:
            return self.ecdb_data == 0
        return True

    @property
    def renderable_properties(self) -> Dict[str, str]:
        props = super().renderable_properties
        props.update(self.renderable_extended)
        props["Extended Control Type"] = f"0x{self.ecdb_type:02X}"
        props["Extended Control Name"] = self.ecdb_type_name
        props["Extended Control Data"] = f"0x{self.ecdb_data:02X}"
        props["ECDB Size Valid"] = "Yes" if self.ecdb_size_valid else "No"
        props["ECDB Data Is Zero"] = "Yes" if self.ecdb_data == 0 else "No"
        props["ECDB Data Valid"] = "Yes" if self.ecdb_data_valid else "No"
        return props
