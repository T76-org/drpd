"""Sink Capabilities Extended (PD 3.x)."""

from typing import Dict, Optional, Any

from ._base import ExtendedMessage


class SinkCapabilitiesExtendedMessage(ExtendedMessage):
    """Decode SKEDB per USB-PD 3.2 Section 6.5.13 / Table 6.65."""

    SKEDB_LENGTH_BYTES = 24

    @property
    def name(self) -> str:
        return "Sink_Capabilities_Extended"

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

    def _u32(self, offset: int) -> Optional[int]:
        b = self.payload_bytes
        end = offset + 4
        if end <= len(b):
            return int.from_bytes(b[offset:end], "little", signed=False)
        return None

    @staticmethod
    def _load_step_text(bits: int) -> str:
        return {
            0b00: "150 mA/us",
            0b01: "500 mA/us",
        }.get(bits, "Reserved")

    @staticmethod
    def _touch_temp_text(value: int) -> str:
        return {
            0: "Not applicable",
            1: "IEC 60950-1",
            2: "IEC 62368-1 TS1",
            3: "IEC 62368-1 TS2",
        }.get(value, "Reserved")

    @property
    def parsed_fields(self) -> Dict[str, Any]:
        sink_load = self._u16(12)
        sink_modes = self._u8(17)
        load_step = self._u8(11)
        compliance = self._u8(14)
        battery_info = self._u8(16)
        touch_temp = self._u8(15)

        overload_percent = None
        overload_period_ms = None
        duty_cycle_percent = None
        can_tolerate_vdroop = None
        if sink_load is not None:
            overload_bits = min(sink_load & 0x1F, 25)
            overload_percent = overload_bits * 10
            overload_period_ms = ((sink_load >> 5) & 0x3F) * 20
            duty_cycle_percent = ((sink_load >> 11) & 0x0F) * 5
            can_tolerate_vdroop = bool((sink_load >> 15) & 0x1)

        return {
            "payload_length": len(self.payload_bytes),
            "payload_expected_length": self.SKEDB_LENGTH_BYTES,
            "vid": self._u16(0),
            "pid": self._u16(2),
            "xid": self._u32(4),
            "fw_version": self._u8(8),
            "hw_version": self._u8(9),
            "skedb_version": self._u8(10),
            "load_step_raw": load_step,
            "load_step_slew_bits": (
                (load_step & 0b11) if load_step is not None else None
            ),
            "load_step_slew_rate": (
                self._load_step_text(load_step & 0b11)
                if load_step is not None else "Unavailable"
            ),
            "sink_load_raw": sink_load,
            "overload_percent": overload_percent,
            "overload_period_ms": overload_period_ms,
            "duty_cycle_percent": duty_cycle_percent,
            "can_tolerate_vbus_droop": can_tolerate_vdroop,
            "compliance_raw": compliance,
            "requires_lps": (
                bool(compliance & 0b001) if compliance is not None else None
            ),
            "requires_ps1": (
                bool(compliance & 0b010) if compliance is not None else None
            ),
            "requires_ps2": (
                bool(compliance & 0b100) if compliance is not None else None
            ),
            "touch_temp_raw": touch_temp,
            "touch_temp": (
                self._touch_temp_text(touch_temp)
                if touch_temp is not None else "Unavailable"
            ),
            "battery_info_raw": battery_info,
            "hot_swappable_battery_slots": (
                ((battery_info >> 4) & 0x0F)
                if battery_info is not None else None
            ),
            "fixed_batteries": (
                (battery_info & 0x0F) if battery_info is not None else None
            ),
            "sink_modes_raw": sink_modes,
            "pps_charging_supported": (
                bool(sink_modes & (1 << 0))
                if sink_modes is not None else None
            ),
            "vbus_powered": (
                bool(sink_modes & (1 << 1))
                if sink_modes is not None else None
            ),
            "ac_supply_powered": (
                bool(sink_modes & (1 << 2))
                if sink_modes is not None else None
            ),
            "battery_powered": (
                bool(sink_modes & (1 << 3))
                if sink_modes is not None else None
            ),
            "battery_essentially_unlimited": (
                bool(sink_modes & (1 << 4))
                if sink_modes is not None else None
            ),
            "avs_supported": (
                bool(sink_modes & (1 << 5))
                if sink_modes is not None else None
            ),
            "spr_sink_minimum_pdp_w": self._u8(18),
            "spr_sink_operational_pdp_w": self._u8(19),
            "spr_sink_maximum_pdp_w": self._u8(20),
            "epr_sink_minimum_pdp_w": self._u8(21),
            "epr_sink_operational_pdp_w": self._u8(22),
            "epr_sink_maximum_pdp_w": self._u8(23),
        }

    @property
    def renderable_properties(self) -> Dict[str, str]:
        props = super().renderable_properties
        props.update(self.renderable_extended)

        parsed = self.parsed_fields
        if parsed["vid"] is not None:
            props["VID"] = f"0x{parsed['vid']:04X}"
        if parsed["pid"] is not None:
            props["PID"] = f"0x{parsed['pid']:04X}"
        if parsed["xid"] is not None:
            props["XID"] = f"0x{parsed['xid']:08X}"
        if parsed["fw_version"] is not None:
            props["FW Version"] = str(parsed["fw_version"])
        if parsed["hw_version"] is not None:
            props["HW Version"] = str(parsed["hw_version"])
        if parsed["skedb_version"] is not None:
            props["Data Block Version"] = str(parsed["skedb_version"])
            props["SKEDB Version"] = str(parsed["skedb_version"])
        if parsed["load_step_raw"] is not None:
            props["Load Step Slew Rate"] = parsed["load_step_slew_rate"]
        if parsed["sink_load_raw"] is not None:
            props["Sink Overload Percent"] = f"{parsed['overload_percent']}%"
            props["Sink Overload Period"] = (
                f"{parsed['overload_period_ms']} ms"
            )
            props["Sink Duty Cycle"] = f"{parsed['duty_cycle_percent']}%"
            props["VBUS Droop Tolerated"] = (
                "Yes" if parsed["can_tolerate_vbus_droop"] else "No"
            )
        if parsed["compliance_raw"] is not None:
            props["Requires LPS Source"] = (
                "Yes" if parsed["requires_lps"] else "No"
            )
            props["Requires PS1 Source"] = (
                "Yes" if parsed["requires_ps1"] else "No"
            )
            props["Requires PS2 Source"] = (
                "Yes" if parsed["requires_ps2"] else "No"
            )
        if parsed["touch_temp_raw"] is not None:
            props["Touch Temperature Standard"] = parsed["touch_temp"]
        if parsed["battery_info_raw"] is not None:
            props["Hot-swappable Battery Slots"] = str(
                parsed["hot_swappable_battery_slots"]
            )
            props["Fixed Batteries"] = str(parsed["fixed_batteries"])
        if parsed["sink_modes_raw"] is not None:
            props["PPS Charging Supported"] = (
                "Yes" if parsed["pps_charging_supported"] else "No"
            )
            props["VBUS Powered"] = "Yes" if parsed["vbus_powered"] else "No"
            props["AC Supply Powered"] = (
                "Yes" if parsed["ac_supply_powered"] else "No"
            )
            props["Battery Powered"] = (
                "Yes" if parsed["battery_powered"] else "No"
            )
            props["Battery Essentially Unlimited"] = (
                "Yes" if parsed["battery_essentially_unlimited"] else "No"
            )
            props["AVS Supported"] = (
                "Yes" if parsed["avs_supported"] else "No"
            )

        pdp_labels = {
            "spr_sink_minimum_pdp_w": "SPR Minimum Power",
            "spr_sink_operational_pdp_w": "SPR Operating Power",
            "spr_sink_maximum_pdp_w": "SPR Maximum Power",
            "epr_sink_minimum_pdp_w": "EPR Minimum Power",
            "epr_sink_operational_pdp_w": "EPR Operating Power",
            "epr_sink_maximum_pdp_w": "EPR Maximum Power",
        }
        for key, label in pdp_labels.items():
            if parsed[key] is not None:
                props[label] = f"{parsed[key]} W"
                props[key.replace("_", " ").upper()] = f"{parsed[key]}W"

        props["Payload Size"] = (
            f"{parsed['payload_length']} bytes "
            f"(expected {parsed['payload_expected_length']})"
        )
        return props
