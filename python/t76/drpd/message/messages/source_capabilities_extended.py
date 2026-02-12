"""
Source Capabilities Extended (PD 3.x)
"""
from typing import Dict, Optional, Any

from ._base import ExtendedMessage


class SourceCapabilitiesExtendedMessage(ExtendedMessage):
    """
    PD 3.x Extended message providing the 25-byte Source Capabilities Extended
    Data Block (SCEDB) defined in USB PD R3.2 Section 6.5.1.

    This implementation decodes every defined field and exposes both a
    human-friendly summary (renderable_properties) and a structured view
    (to_dict).
    """

    SCEDB_LENGTH_BYTES = 25

    @property
    def name(self) -> str:
        return "Source_Capabilities_Extended"

    @property
    def payload_size(self) -> int:
        return len(self.payload_bytes)

    # ---------- helpers ----------
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
    def _load_step_slew_rate(bits: int) -> str:
        mapping = {
            0b00: "150 mA/us (default)",
            0b01: "500 mA/us",
            0b10: "Reserved",
            0b11: "Reserved",
        }
        return mapping.get(bits & 0b11, "Reserved")

    @staticmethod
    def _load_step_magnitude(bit: int) -> str:
        return "25% IoC (default)" if bit == 0 else "90% IoC"

    @staticmethod
    def _touch_temp_meaning(value: Optional[int]) -> str:
        if value is None:
            return "Unavailable"
        mapping = {
            0: "IEC 60950-1",
            1: "IEC 62368-1 TS1",
            2: "IEC 62368-1 TS2",
        }
        return mapping.get(value, "Reserved")

    @staticmethod
    def _peak_current_fields(raw: Optional[int]) -> Dict[str, Any]:
        if raw is None:
            return {
                "raw": None,
                "percent_overload": None,
                "overload_period_ms": None,
                "duty_cycle_percent": None,
                "vbus_voltage_droop": None,
            }
        percent_overload = min(raw & 0x1F, 25) * 10
        overload_period_ms = ((raw >> 5) & 0x3F) * 20
        duty_cycle_percent = ((raw >> 11) & 0x0F) * 5
        return {
            "raw": raw,
            "percent_overload": percent_overload,
            "overload_period_ms": overload_period_ms,
            "duty_cycle_percent": duty_cycle_percent,
            "vbus_voltage_droop": bool((raw >> 15) & 0x1),
        }

    def _voltage_regulation_fields(self, raw: Optional[int]) -> Dict[str, Any]:
        if raw is None:
            return {
                "raw": None,
                "load_step_slew_rate_bits": None,
                "load_step_slew_rate": "Unavailable",
                "load_step_magnitude_bit": None,
                "load_step_magnitude": "Unavailable",
                "reserved": None,
            }
        load_step_bits = raw & 0b11
        magnitude_bit = (raw >> 2) & 0b1
        reserved = (raw >> 3) & 0x1F
        return {
            "raw": raw,
            "load_step_slew_rate_bits": load_step_bits,
            "load_step_slew_rate": self._load_step_slew_rate(load_step_bits),
            "load_step_magnitude_bit": magnitude_bit,
            "load_step_magnitude": self._load_step_magnitude(magnitude_bit),
            "reserved": reserved,
        }

    def _compliance_fields(self, raw: Optional[int]) -> Dict[str, Any]:
        if raw is None:
            return {
                "raw": None,
                "lps_compliant": None,
                "ps1_compliant": None,
                "ps2_compliant": None,
                "reserved": None,
            }
        return {
            "raw": raw,
            "lps_compliant": bool(raw & 0b00000001),
            "ps1_compliant": bool(raw & 0b00000010),
            "ps2_compliant": bool(raw & 0b00000100),
            "reserved": (raw >> 3) & 0x1F,
        }

    def _touch_current_fields(self, raw: Optional[int]) -> Dict[str, Any]:
        if raw is None:
            return {
                "raw": None,
                "low_touch_current_eps": None,
                "ground_pin_supported": None,
                "ground_pin_protective_earth": None,
                "reserved": None,
            }
        return {
            "raw": raw,
            "low_touch_current_eps": bool(raw & 0b00000001),
            "ground_pin_supported": bool(raw & 0b00000010),
            "ground_pin_protective_earth": bool(raw & 0b00000100),
            "reserved": (raw >> 3) & 0x1F,
        }

    def _source_input_fields(self, raw: Optional[int]) -> Dict[str, Any]:
        if raw is None:
            return {
                "raw": None,
                "external_supply_present": None,
                "external_supply_unconstrained": None,
                "internal_battery_present": None,
                "reserved": None,
            }
        external_supply_present = bool(raw & 0b00000001)
        external_supply_unconstrained = (
            bool(raw & 0b00000010) if external_supply_present else False
        )
        return {
            "raw": raw,
            "external_supply_present": external_supply_present,
            "external_supply_unconstrained": external_supply_unconstrained,
            "internal_battery_present": bool(raw & 0b00000100),
            "reserved": (raw >> 3) & 0x1F,
        }

    def _battery_slots_fields(self, raw: Optional[int]) -> Dict[str, Any]:
        if raw is None:
            return {
                "raw": None,
                "hot_swappable_slots": None,
                "fixed_batteries": None,
            }
        return {
            "raw": raw,
            "hot_swappable_slots": (raw >> 4) & 0x0F,
            "fixed_batteries": raw & 0x0F,
        }

    @property
    def parsed_fields(self) -> Dict[str, Any]:
        return {
            "payload_expected_length": self.SCEDB_LENGTH_BYTES,
            "payload_length": len(self.payload_bytes),
            "vid": {
                "value": self._u16(0),
                "meaning": "USB-IF Vendor ID; 0xFFFF when vendor has no VID",
            },
            "pid": {
                "value": self._u16(2),
                "meaning": "Product ID assigned by the vendor",
            },
            "xid": {
                "value": self._u32(4),
                "meaning": "USB-IF assigned XID (0 if unavailable)",
            },
            "fw_version": {
                "value": self._u8(8),
                "meaning": "Firmware version number",
            },
            "hw_version": {
                "value": self._u8(9),
                "meaning": "Hardware version number",
            },
            "voltage_regulation": self._voltage_regulation_fields(self._u8(10)),
            "holdup_time_ms": {
                "value": self._u8(11),
                "meaning": "Holdup time in ms; 0 indicates not supported",
            },
            "compliance": self._compliance_fields(self._u8(12)),
            "touch_current": self._touch_current_fields(self._u8(13)),
            "peak_current_1": self._peak_current_fields(self._u16(14)),
            "peak_current_2": self._peak_current_fields(self._u16(16)),
            "peak_current_3": self._peak_current_fields(self._u16(18)),
            "touch_temperature": {
                "value": self._u8(20),
                "meaning": self._touch_temp_meaning(self._u8(20)),
            },
            "source_inputs": self._source_input_fields(self._u8(21)),
            "battery_slots": self._battery_slots_fields(self._u8(22)),
            "spr_source_pdp_rating_w": {
                "value": self._u8(23),
                "meaning": "Integer PDP rating when in SPR mode",
            },
            "epr_source_pdp_rating_w": {
                "value": self._u8(24),
                "meaning": "Integer PDP rating when in EPR mode (0 for SPR-only sources)",
            },
        }

    # ---------- rendering & serialization ----------
    @staticmethod
    def _fmt_optional_int(value: Optional[int], fmt: str = "{}") -> str:
        return fmt.format(value) if value is not None else "(missing)"

    def _format_peak(self, peak: Dict[str, Any]) -> str:
        if peak.get("raw") is None:
            return "(missing)"
        return (
            f"Overload={peak['percent_overload']}%\n"
            f"Period={peak['overload_period_ms']} ms\n"
            f"Duty={peak['duty_cycle_percent']}%\n"
            f"VBUS droop={'yes' if peak['vbus_voltage_droop'] else 'no'}"
        )

    @property
    def renderable_properties(self) -> Dict[str, str]:
        props = super().renderable_properties
        props.update(self.renderable_extended)

        fields = self.parsed_fields
        vr = fields["voltage_regulation"]
        compliance = fields["compliance"]
        touch = fields["touch_current"]
        inputs = fields["source_inputs"]
        battery_slots = fields["battery_slots"]

        props.update({
            "Payload Size": f"{self.payload_size} bytes (expected {self.SCEDB_LENGTH_BYTES})",
            "IDs": (
                f"VID=0x{self._fmt_optional_int(fields['vid']['value'], '{:04X}')} "
                f"PID=0x{self._fmt_optional_int(fields['pid']['value'], '{:04X}')} "
                f"XID=0x{self._fmt_optional_int(fields['xid']['value'], '{:08X}')}"
            ),
            "FW / HW Version": (
                f"FW {self._fmt_optional_int(fields['fw_version']['value'])}, "
                f"HW {self._fmt_optional_int(fields['hw_version']['value'])}"
            ),
            "Voltage Regulation": (
                f"Slew={vr['load_step_slew_rate']}\n"
                f"Magnitude={vr['load_step_magnitude']}"
                if vr["raw"] is not None else "(missing)"
            ),
            "Holdup Time": (
                f"{fields['holdup_time_ms']['value']} ms"
                if fields['holdup_time_ms']['value'] is not None else "(missing)"
            ),
            "Compliance": (
                f"LPS={compliance['lps_compliant']} PS1={compliance['ps1_compliant']} "
                f"PS2={compliance['ps2_compliant']}"
                if compliance["raw"] is not None else "(missing)"
            ),
            "Touch Current": (
                f"LowTouch={touch['low_touch_current_eps']} Ground={touch['ground_pin_supported']} "
                f"PE={touch['ground_pin_protective_earth']}"
                if touch["raw"] is not None else "(missing)"
            ),
            "Peak Current 1": self._format_peak(fields["peak_current_1"]),
            "Peak Current 2": self._format_peak(fields["peak_current_2"]),
            "Peak Current 3": self._format_peak(fields["peak_current_3"]),
            "Touch Temperature": (
                fields['touch_temperature']['meaning']
            ),
            "Source Inputs": (
                f"External={inputs['external_supply_present']} (unconstrained={inputs['external_supply_unconstrained']})\n"
                f"Internal Battery={inputs['internal_battery_present']}"
                if inputs["raw"] is not None else "(missing)"
            ),
            "Batteries/Slots": (
                f"Hot-swappable={battery_slots['hot_swappable_slots']} "
                f"Fixed={battery_slots['fixed_batteries']}"
                if battery_slots["raw"] is not None else "(missing)"
            ),
            "SPR Source PDP Rating": (
                f"{self._fmt_optional_int(fields['spr_source_pdp_rating_w']['value'])} W"
            ),
            "EPR Source PDP Rating": (
                f"{self._fmt_optional_int(fields['epr_source_pdp_rating_w']['value'])} W"
            ),
        })
        return props

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "extended_header": self.extended_header.to_dict(),
            "payload_size_bytes": self.payload_size,
            "payload_hex": self.payload_bytes.hex(" ").upper() if self.payload_bytes else "(empty)",
            "payload_words_le": [f"0x{w:08X}" for w in self.payload_words_le],
            "fields": self.parsed_fields,
        }
