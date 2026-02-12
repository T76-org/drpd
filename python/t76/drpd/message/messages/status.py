"""
Status (PD 3.x Extended)
"""
from typing import Dict, Any

from ._base import ExtendedMessage


class StatusMessage(ExtendedMessage):
    """
    PD 3.x Extended Status message (USB-PD 3.2 Section 6.5.2).
    Decodes:
    - SOP Status Data Block (7 bytes, Table 6.55)
    - SOP'/SOP'' Status Data Block (2 bytes, Table 6.56)
    """

    @property
    def name(self) -> str:
        return "Status"

    def _decode_sop_sdb(self) -> Dict[str, Any]:
        b = self.payload_bytes
        temp = b[0]
        present_input = b[1]
        present_battery = b[2]
        event_flags = b[3]
        temp_status = b[4]
        power_status = b[5]
        power_state = b[6]

        temp_text = (
            "Feature not supported" if temp == 0
            else "< 2C" if temp == 1
            else f"{temp}C"
        )
        temp_status_text = {
            0b00: "Not supported",
            0b01: "Normal",
            0b10: "Warning",
            0b11: "Over temperature",
        }.get((temp_status >> 1) & 0b11, "Reserved")

        new_power_state = power_state & 0b111
        new_power_state_text = {
            0: "Status not supported",
            1: "S0",
            2: "Modern Standby",
            3: "S3",
            4: "S4",
            5: "S5",
            6: "G3",
        }.get(new_power_state, "Reserved")

        indicator = (power_state >> 3) & 0b111
        indicator_text = {
            0: "Off LED",
            1: "On LED",
            2: "Blinking LED",
            3: "Breathing LED",
        }.get(indicator, "Reserved")

        return {
            "Status Data Block Type": "SOP",
            "SDB Type": "SOP",
            "Internal Temp": temp_text,
            "Present Input External": "Yes" if present_input & (1 << 1) else "No",
            "Present Input External Type": (
                "AC"
                if (present_input & (1 << 1)) and (present_input & (1 << 2))
                else "DC"
                if (present_input & (1 << 1))
                else "N/A"
            ),
            "Present Input Battery": "Yes" if present_input & (1 << 3) else "No",
            "Present Input Non-Battery Internal": (
                "Yes" if present_input & (1 << 4) else "No"
            ),
            "Present Battery Input": (
                "Available" if present_battery else "Not available"
            ),
            "Event OCP": "Yes" if event_flags & (1 << 1) else "No",
            "Event OTP": "Yes" if event_flags & (1 << 2) else "No",
            "Event OVP": "Yes" if event_flags & (1 << 3) else "No",
            "Event CL/CV Mode": "CL" if event_flags & (1 << 4) else "CV",
            "Temperature Status": temp_status_text,
            "Power Limited by Cable Current": (
                "Yes" if power_status & (1 << 1) else "No"
            ),
            "Power Limited by Multi-port": (
                "Yes" if power_status & (1 << 2) else "No"
            ),
            "Power Limited by External Power": (
                "Yes" if power_status & (1 << 3) else "No"
            ),
            "Power Limited by Event": (
                "Yes" if power_status & (1 << 4) else "No"
            ),
            "Power Limited by Temperature": (
                "Yes" if power_status & (1 << 5) else "No"
            ),
            "New Power State": new_power_state_text,
            "Power State Indicator": indicator_text,
        }

    def _decode_spdb(self) -> Dict[str, Any]:
        b = self.payload_bytes
        temp = b[0]
        flags = b[1]
        temp_text = (
            "Feature not supported" if temp == 0
            else "< 2C" if temp == 1
            else f"{temp}C"
        )
        return {
            "Status Data Block Type": "SOP'/SOP''",
            "SDB Type": "SOP'/SOP''",
            "Internal Temp": temp_text,
            "Thermal Shutdown": "Yes" if (flags & 0x1) else "No",
        }

    @property
    def decoded_status(self) -> Dict[str, Any]:
        if len(self.payload_bytes) >= 7:
            return self._decode_sop_sdb()
        if len(self.payload_bytes) >= 2:
            return self._decode_spdb()
        return {
            "Status Data Block Type": "Unavailable",
            "SDB Type": "Unavailable",
        }

    @property
    def renderable_properties(self) -> Dict[str, str]:
        props = super().renderable_properties
        props.update(self.renderable_extended)
        for key, value in self.decoded_status.items():
            props[key] = str(value)
        return props
