"""
EPR (Extended Power Range) Mode Message
"""
from enum import IntEnum
from typing import Dict

from ._base import StandardMessage


class EPRModeAction(IntEnum):
    """Action values from USB-PD 3.2 Table 6.50."""

    ENTER = 0x01
    ENTER_ACKNOWLEDGED = 0x02
    ENTER_SUCCEEDED = 0x03
    ENTER_FAILED = 0x04
    EXIT = 0x05


class EPRModeEnterFailedReason(IntEnum):
    """Enter Failed Data field values from USB-PD 3.2 Table 6.50."""

    UNKNOWN = 0x00
    CABLE_NOT_EPR_CAPABLE = 0x01
    SOURCE_FAILED_BECOME_VCONN_SOURCE = 0x02
    EPR_CAPABLE_RDO_BIT_NOT_SET = 0x03
    SOURCE_UNABLE_TO_ENTER_EPR = 0x04
    EPR_CAPABLE_PDO_BIT_NOT_SET = 0x05


class EPRModeMessage(StandardMessage):
    """
    EPR_Mode message wrapper with EPRMDO decoding (USB-PD 3.2 Table 6.50).
    - B31..24: Action
    - B23..16: Data
    - B15..0: Reserved
    """
    @property
    def name(self) -> str:
        return "EPR_Mode"

    @classmethod
    def encode(cls, action: int, data: int = 0) -> bytes:
        """
        Create a 4-byte EPRMDO.

        Args:
            action: EPR_Mode action (B31..24)
            data: EPR_Mode data (B23..16)

        Returns:
            bytes: The encoded message body (4 bytes)
        """
        eprmdo = ((action & 0xFF) << 24) | ((data & 0xFF) << 16)
        return eprmdo.to_bytes(4, "little")

    @property
    def eprmdo(self) -> int:
        """Return the raw EPRMDO word or zero if payload is too short."""
        if len(self.body) < 4:
            return 0
        return int.from_bytes(self.body[0:4], byteorder="little")

    @property
    def action(self) -> int:
        """Action field (B31..24)."""
        return (self.eprmdo >> 24) & 0xFF

    @property
    def data(self) -> int:
        """Data field (B23..16)."""
        return (self.eprmdo >> 16) & 0xFF

    @property
    def reserved(self) -> int:
        """Reserved field (B15..0)."""
        return self.eprmdo & 0xFFFF

    @property
    def action_text(self) -> str:
        """Human-readable action text."""
        mapping = {
            EPRModeAction.ENTER: "Enter",
            EPRModeAction.ENTER_ACKNOWLEDGED: "Enter Acknowledged",
            EPRModeAction.ENTER_SUCCEEDED: "Enter Succeeded",
            EPRModeAction.ENTER_FAILED: "Enter Failed",
            EPRModeAction.EXIT: "Exit",
        }
        try:
            return mapping[EPRModeAction(self.action)]
        except ValueError:
            return "Reserved/Unknown"

    @property
    def data_text(self) -> str:
        """Human-readable data text based on Action."""
        if self.action == EPRModeAction.ENTER:
            return f"Sink Operational PDP = {self.data}"
        if self.action in (
            EPRModeAction.ENTER_ACKNOWLEDGED,
            EPRModeAction.ENTER_SUCCEEDED,
            EPRModeAction.EXIT,
        ):
            return "0x00 (required)"
        if self.action == EPRModeAction.ENTER_FAILED:
            mapping = {
                EPRModeEnterFailedReason.UNKNOWN: "Unknown cause",
                EPRModeEnterFailedReason.CABLE_NOT_EPR_CAPABLE:
                    "Cable not EPR Capable",
                EPRModeEnterFailedReason.SOURCE_FAILED_BECOME_VCONN_SOURCE:
                    "Source failed to become VCONN Source",
                EPRModeEnterFailedReason.EPR_CAPABLE_RDO_BIT_NOT_SET:
                    "EPR Capable bit not set in RDO",
                EPRModeEnterFailedReason.SOURCE_UNABLE_TO_ENTER_EPR:
                    "Source unable to enter EPR Mode",
                EPRModeEnterFailedReason.EPR_CAPABLE_PDO_BIT_NOT_SET:
                    "EPR Capable bit not set in PDO",
            }
            try:
                reason = mapping[EPRModeEnterFailedReason(self.data)]
            except ValueError:
                reason = "Reserved/Unknown"
            return reason
        return "Reserved/Unknown"

    @property
    def renderable_properties(self) -> Dict[str, str]:
        """Returns a dictionary of properties for display"""
        properties = super().renderable_properties

        properties.update({
            "Action": self.action_text,
            "Details": self.data_text,
        })

        return properties
