"""
Battery Capabilities (PD 3.x Extended)
"""
from typing import Dict, Optional

from ._base import ExtendedMessage


class BatteryCapabilitiesMessage(ExtendedMessage):
    """
    Extended response describing battery capabilities.
    USB-PD 3.2 Section 6.5.5 / Table 6.59 (9-byte BCDB).
    """

    @property
    def name(self) -> str:
        return "Battery_Capabilities"

    def _u8(self, offset: int) -> Optional[int]:
        b = self.payload_bytes
        if offset < len(b):
            return b[offset]
        return None

    def _u16(self, offset: int) -> Optional[int]:
        b = self.payload_bytes
        end = offset + 2
        if end <= len(b):
            return int.from_bytes(b[offset:end], "little", signed=False)
        return None

    @property
    def vid(self) -> Optional[int]:
        return self._u16(0)

    @property
    def pid(self) -> Optional[int]:
        return self._u16(2)

    @property
    def battery_design_capacity_wh_10x(self) -> Optional[int]:
        return self._u16(4)

    @property
    def battery_last_full_charge_wh_10x(self) -> Optional[int]:
        return self._u16(6)

    @property
    def battery_type_raw(self) -> Optional[int]:
        return self._u8(8)

    @property
    def renderable_properties(self) -> Dict[str, str]:
        props = super().renderable_properties
        props.update(self.renderable_extended)
        if self.vid is not None:
            props["VID"] = f"0x{self.vid:04X}"
        if self.pid is not None:
            props["PID"] = f"0x{self.pid:04X}"
        if self.battery_design_capacity_wh_10x is not None:
            value = self.battery_design_capacity_wh_10x
            if value == 0x0000:
                props["Battery Design Capacity"] = "Battery not present"
            elif value == 0xFFFF:
                props["Battery Design Capacity"] = "Unknown"
            else:
                props["Battery Design Capacity"] = f"{value / 10:.1f}Wh"
        if self.battery_last_full_charge_wh_10x is not None:
            value = self.battery_last_full_charge_wh_10x
            if value == 0x0000:
                props["Last Full Charge Capacity"] = "Battery not present"
            elif value == 0xFFFF:
                props["Last Full Charge Capacity"] = "Unknown"
            else:
                props["Last Full Charge Capacity"] = f"{value / 10:.1f}Wh"
        if self.battery_type_raw is not None:
            props["Invalid Battery Reference"] = (
                "Yes" if (self.battery_type_raw & 0x1) else "No"
            )
        return props
