"""
Copyright (c) 2025 MTA, Inc.

Vendor Data Objects (VDOs) module for USB Power Delivery message processing.
Provides access to various VDO classes for Unstructured VDM, Structured VDM, and Generic Payload VDOs.

NOTE: This file is intentionally display-first. It avoids speculative semantics where the spec
      is mode/SVID-dependent, but exposes stable, useful fields for UI and basic analysis.
"""

from dataclasses import dataclass
from enum import Flag, IntEnum, auto
from typing import Dict, Any, List

from .bit_helpers import _bits, _u32, _byte


class SvdmCommandType(IntEnum):
    """Command types for Structured VDM Header."""
    REQUEST = 0
    ACK = 1
    NAK = 2
    BUSY = 3

    @property
    def description(self) -> str:
        descriptions = {
            self.REQUEST: "Request Message",
            self.ACK: "Acknowledge",
            self.NAK: "Not Acknowledged",
            self.BUSY: "Device Busy"
        }
        return descriptions.get(self, self.name)


class SvdmCommand(IntEnum):
    """Standard commands for Structured VDM."""
    RESERVED = 0
    DISCOVER_IDENTITY = 1
    DISCOVER_SVIDS = 2
    DISCOVER_MODES = 3
    ENTER_MODE = 4
    EXIT_MODE = 5
    ATTENTION = 6
    # 7..15 Reserved for future use
    # 16..31 SVID-specific commands

    @property
    def description(self) -> str:
        descriptions = {
            self.RESERVED: "Reserved",
            self.DISCOVER_IDENTITY: "Discover Identity",
            self.DISCOVER_SVIDS: "Discover SVIDs",
            self.DISCOVER_MODES: "Discover Modes",
            self.ENTER_MODE: "Enter Mode",
            self.EXIT_MODE: "Exit Mode",
            self.ATTENTION: "Attention"
        }
        return descriptions.get(self, self.name)


class UsbCapability(Flag):
    """USB Capability flags for IDHeaderVDO."""
    NONE = 0
    USB_2_0_HOST = auto()      # Bit 0
    USB_2_0_DEVICE = auto()    # Bit 1
    USB_2_0_HUB = auto()       # Bit 2
    USB_3_2_CAPABLE = auto()   # Bit 3

    @property
    def description(self) -> str:
        if self == self.NONE:
            return "No USB capabilities"
        descriptions = []
        if self & self.USB_2_0_HOST:
            descriptions.append("USB 2.0 Host Support")
        if self & self.USB_2_0_DEVICE:
            descriptions.append("USB 2.0 Device Support")
        if self & self.USB_2_0_HUB:
            descriptions.append("USB 2.0 Hub Support")
        if self & self.USB_3_2_CAPABLE:
            descriptions.append("USB 3.2 Capable")
        return ", ".join(descriptions)


class ProductType(IntEnum):
    """Product Type codes for IDHeaderVDO."""
    UNDEFINED = 0
    PDUSB_HUB = 1
    PDUSB_PERIPHERAL = 2
    POWER_BRICK = 3
    AMC = 4  # Alternate Mode Controller
    AMA = 5  # Alternate Mode Adapter
    VCONN_POWERED = 6

    @property
    def description(self) -> str:
        descriptions = {
            self.UNDEFINED: "Undefined Product Type",
            self.PDUSB_HUB: "USB Power Delivery Hub",
            self.PDUSB_PERIPHERAL: "USB Power Delivery Peripheral",
            self.POWER_BRICK: "Power Brick",
            self.AMC: "Alternate Mode Controller",
            self.AMA: "Alternate Mode Adapter",
            self.VCONN_POWERED: "VCONN-Powered USB Device"
        }
        return descriptions.get(self, f"Unknown Type ({self.value})")


class CableSpeed(IntEnum):
    """USB Highest Speed field values used in cable-related VDOs."""
    USB2_ONLY = 0
    USB31_GEN1 = 1
    USB31_GEN2 = 2
    USB4_GEN3 = 3
    USB4_GEN4 = 4

    @property
    def description(self) -> str:
        descriptions = {
            self.USB2_ONLY: "USB 2.0 (480 Mbps)",
            self.USB31_GEN1: "USB 3.2 Gen1",
            self.USB31_GEN2: "USB 3.2/USB4 Gen2",
            self.USB4_GEN3: "USB4 Gen 3 (40 Gbps)",
            self.USB4_GEN4: "USB4 Gen 4 (80 Gbps)",
        }
        return descriptions.get(self, f"Unknown Speed ({self.value})")


class CableLatency(IntEnum):
    """Cable latency categories for Passive/Active cable VDOs."""
    RESERVED = 0
    LESS_THAN_10NS = 1
    BETWEEN_10NS_20NS = 2
    BETWEEN_20NS_30NS = 3
    BETWEEN_30NS_40NS = 4
    BETWEEN_40NS_50NS = 5
    BETWEEN_50NS_60NS = 6
    BETWEEN_60NS_70NS = 7
    MORE_THAN_70NS = 8
    ACTIVE_2000NS = 9
    ACTIVE_3000NS = 10

    @property
    def description(self) -> str:
        descriptions = {
            self.RESERVED: "Reserved",
            self.LESS_THAN_10NS: "<10ns (~1m)",
            self.BETWEEN_10NS_20NS: "10ns to 20ns (~2m)",
            self.BETWEEN_20NS_30NS: "20ns to 30ns (~3m)",
            self.BETWEEN_30NS_40NS: "30ns to 40ns (~4m)",
            self.BETWEEN_40NS_50NS: "40ns to 50ns (~5m)",
            self.BETWEEN_50NS_60NS: "50ns to 60ns (~6m)",
            self.BETWEEN_60NS_70NS: "60ns to 70ns (~7m)",
            self.MORE_THAN_70NS: ">70ns",
            self.ACTIVE_2000NS: "2000ns (~200m)",
            self.ACTIVE_3000NS: "3000ns (~300m)",
        }
        return descriptions.get(self, f"Unknown Latency ({self.value})")


def _usb_highest_speed_text(bits: int) -> str:
    try:
        return CableSpeed(bits).description
    except ValueError:
        return f"Reserved ({bits:03b}b)"


def _max_vbus_voltage_text(bits: int) -> str:
    mapping = {
        0b00: "20V",
        0b01: "30V (Deprecated; treat as 20V)",
        0b10: "40V (Deprecated; treat as 20V)",
        0b11: "50V",
    }
    return mapping.get(bits, f"Unknown ({bits:02b}b)")


class CableTermination(Flag):
    """Cable termination type flags."""
    NONE = 0
    DFP_D = auto()
    UFP_D = auto()
    VCONN_POWERED = auto()
    ACTIVE = auto()

    @property
    def description(self) -> str:
        if self == self.NONE:
            return "No termination support"
        descriptions = []
        if self & self.DFP_D:
            descriptions.append("Downstream Facing Port Support")
        if self & self.UFP_D:
            descriptions.append("Upstream Facing Port Support")
        if self & self.VCONN_POWERED:
            descriptions.append("VCONN Power Required")
        if self & self.ACTIVE:
            descriptions.append("Active Cable")
        return ", ".join(descriptions)


# ---------- Base VDO ----------

@dataclass(frozen=True)
class VDO:
    """
    Base class for a 32-bit Vendor Data Object (VDO).
    Subclasses provide typed accessors for header or payload fields.
    """
    raw: int

    def to_dict(self) -> Dict[str, Any]:
        """Minimal dictionary view (subclasses extend)."""
        r = _u32(self.raw)
        return {
            "Class": type(self).__name__,
            "Raw": f"0x{r:08X}",
        }

    def encode(self) -> bytes:
        """Encode the VDO as 4 bytes (little-endian)."""
        return self.raw.to_bytes(4, byteorder="little")

# ---------- Unstructured VDM Header ----------


@dataclass(frozen=True)
class UvdmHeaderVDO(VDO):
    """
    Unstructured VDM Header.
    Layout (stable across PD revisions):
      B31..16 : VID (USB Vendor ID)
      B15     : VDM Type = 0 (Unstructured)
      B14..0  : Vendor-defined (opaque)
    """

    @property
    def vid(self) -> int:
        """USB Vendor ID (VID), 16-bit (B31..16)."""
        return _bits(self.raw, 31, 16)

    @property
    def vdm_type(self) -> int:
        """VDM Type bit (B15). 0 for Unstructured."""
        return _bits(self.raw, 15, 15)

    @property
    def vendor_bits(self) -> int:
        """Vendor-defined field (B14..0), opaque to the spec."""
        return _u32(self.raw) & 0x7FFF  # bits 14..0

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update(
            vdm_type=self.vdm_type,
            vid=f"0x{self.vid:04X}",
            vendor_bits=f"0b{self.vendor_bits:015b}",
        )
        return d


# ---------- Structured VDM Header ----------

@dataclass(frozen=True)
class SvdmHeaderVDO(VDO):
    """
    Structured VDM Header (SVDM).
    Common layout:
      B31..16 : SVID (Standard or Vendor ID)
      B15     : VDM Type = 1 (Structured)
      B14..13 : SVDM Version (Major)
      B12..11 : SVDM Version (Minor)
      B10..8  : Object Position
      B7..6   : Command Type (00=Request, 01=ACK, 10=NAK, 11=Busy)
      B5      : Reserved
      B4..0   : Command (0..31; 0..15 common, 16..31 SVID-specific)
    """

    @property
    def svid(self) -> int:
        """Standard or Vendor ID (SVID), 16-bit (B31..16)."""
        return _bits(self.raw, 31, 16)

    @property
    def vdm_type(self) -> int:
        """VDM Type bit (B15). 1 for Structured."""
        return _bits(self.raw, 15, 15)

    @property
    def svdm_version_major(self) -> int:
        """Structured VDM Version (Major), bits B14..13."""
        return _bits(self.raw, 14, 13)

    @property
    def svdm_version_minor(self) -> int:
        """Structured VDM Version (Minor), bits B12..11."""
        return _bits(self.raw, 12, 11)

    @property
    def object_position(self) -> int:
        """Object Position (B10..8)."""
        return _bits(self.raw, 10, 8)

    @property
    def command_type(self) -> int:
        """Command Type (B7..6): 00=Request, 01=ACK, 10=NAK, 11=Busy."""
        return _bits(self.raw, 7, 6)

    @property
    def command(self) -> int:
        """Command number (B4..0): 0..31."""
        return _bits(self.raw, 4, 0)

    # Convenience human-readable fields

    @property
    def is_structured(self) -> bool:
        """True if VDM Type == 1."""
        return self.vdm_type == 1

    @property
    def command_type_enum(self) -> SvdmCommandType:
        """Get the command type as an enum."""
        try:
            return SvdmCommandType(self.command_type)
        except ValueError:
            return SvdmCommandType.REQUEST  # Default to REQUEST if invalid

    @property
    def command_enum(self) -> SvdmCommand:
        """Get the command as an enum if it's a standard command."""
        if self.command <= 6:  # Standard commands
            try:
                return SvdmCommand(self.command)
            except ValueError:
                pass
        return SvdmCommand.RESERVED  # Default for SVID-specific or invalid

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        cmd_type = self.command_type_enum
        cmd = self.command_enum

        d.update({
            "VDM Type": f"{'Structured' if self.vdm_type else 'Unstructured'} VDM",
            "SVID": f"0x{self.svid:04X}",
            "SVDM Version": f"{self.svdm_version_major}.{self.svdm_version_minor}",
            "Object Position": self.object_position,
            "Command Type": cmd_type.description,
            "Command": (cmd.description if self.command <= 6 else f"SVID-specific ({self.command})"),
            "Command Type Raw": f"0b{self.command_type:02b}",
            "Command Raw": f"0x{self.command:02X}",
            "Version Raw": f"{self.svdm_version_major}.{self.svdm_version_minor}"
        })
        return d


# ---------- Generic payload VDOs ----------

@dataclass(frozen=True)
class GenericPayloadVDO(VDO):
    """
    Simple wrapper for a payload VDO that follows a VDM header.
    This class doesn’t attempt to interpret contents; it’s display-only.
    """
    index: int  # 0-based index within the payload list after the header

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        r = _u32(self.raw)
        d.update({
            "Index": self.index,
            "Word Hi16": f"0x{(r >> 16) & 0xFFFF:04X}",
            "Word Lo16": f"0x{r & 0xFFFF:04X}",
            "Bytes": f"[{_byte(r, 3):02X} {_byte(r, 2):02X} {_byte(r, 1):02X} {_byte(r, 0):02X}]",
        })
        return d


@dataclass(frozen=True)
class UnknownVDO(VDO):
    """Fallback VDO for any unexpected layout."""
    index: int

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        r = _u32(self.raw)
        d.update({
            "Index": self.index,
            "Word Hi16": f"0x{(r >> 16) & 0xFFFF:04X}",
            "Word Lo16": f"0x{r & 0xFFFF:04X}",
            "Bytes": f"[{_byte(r, 3):02X} {_byte(r, 2):02X} {_byte(r, 1):02X} {_byte(r, 0):02X}]",
        })
        return d


# ---------- Discover Identity — common VDOs ----------

@dataclass(frozen=True)
class IdHeaderVDO(VDO):
    """
    Identity Header VDO (first payload VDO in Discover Identity response).
    USB-PD 3.2 Table 6.33.
    """

    @property
    def usb_host_capable(self) -> bool:
        """B31: USB Communications Capable as USB Host."""
        return bool(_bits(self.raw, 31, 31))

    @property
    def usb_device_capable(self) -> bool:
        """B30: USB Communications Capable as USB Device."""
        return bool(_bits(self.raw, 30, 30))

    @property
    def sop_ufp_product_type(self) -> int:
        """B29..27: SOP Product Type (UFP)."""
        return _bits(self.raw, 29, 27)

    @property
    def sop_prime_cable_vpd_product_type(self) -> int:
        """B29..27: SOP' Product Type (Cable Plug/VPD)."""
        return _bits(self.raw, 29, 27)

    @property
    def modal_operation_supported(self) -> bool:
        """B26: Modal Operation Supported."""
        return bool(_bits(self.raw, 26, 26))

    @property
    def sop_dfp_product_type(self) -> int:
        """B25..23: SOP Product Type (DFP)."""
        return _bits(self.raw, 25, 23)

    @property
    def connector_type(self) -> int:
        """B22..21: Connector Type."""
        return _bits(self.raw, 22, 21)

    @property
    def usb_vendor_id(self) -> int:
        """B15..0: USB Vendor ID."""
        return _bits(self.raw, 15, 0)

    @staticmethod
    def _ufp_product_type_text(bits: int) -> str:
        mapping = {
            0b000: "Not a UFP",
            0b001: "PDUSB Hub",
            0b010: "PDUSB Peripheral",
            0b011: "PSD",
        }
        return mapping.get(bits, "Reserved")

    @staticmethod
    def _cable_vpd_product_type_text(bits: int) -> str:
        mapping = {
            0b000: "Not a Cable Plug/VPD",
            0b011: "Passive Cable",
            0b100: "Active Cable",
            0b110: "VCONN Powered USB Device (VPD)",
        }
        return mapping.get(bits, "Reserved")

    @staticmethod
    def _dfp_product_type_text(bits: int) -> str:
        mapping = {
            0b000: "Not a DFP",
            0b001: "PDUSB Hub",
            0b010: "PDUSB Host",
            0b011: "Power Brick",
        }
        return mapping.get(bits, "Reserved")

    @staticmethod
    def _connector_type_text(bits: int) -> str:
        mapping = {
            0b10: "USB Type-C Receptacle",
            0b11: "USB Type-C Plug",
        }
        return mapping.get(bits, "Reserved")

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update({
            "USB Host Capable": "Yes" if self.usb_host_capable else "No",
            "USB Device Capable": "Yes" if self.usb_device_capable else "No",
            "SOP UFP Product Type":
                self._ufp_product_type_text(self.sop_ufp_product_type),
            "SOP' Cable/VPD Product Type":
                self._cable_vpd_product_type_text(
                    self.sop_prime_cable_vpd_product_type
                ),
            "Modal Operation Supported":
                "Yes" if self.modal_operation_supported else "No",
            "SOP DFP Product Type":
                self._dfp_product_type_text(self.sop_dfp_product_type),
            "Connector Type": self._connector_type_text(self.connector_type),
            "USB Vendor ID": f"0x{self.usb_vendor_id:04X}",
            "SOP UFP Product Type Raw":
                f"0b{self.sop_ufp_product_type:03b}",
            "SOP' Cable/VPD Product Type Raw":
                f"0b{self.sop_prime_cable_vpd_product_type:03b}",
            "SOP DFP Product Type Raw":
                f"0b{self.sop_dfp_product_type:03b}",
            "Connector Type Raw": f"0b{self.connector_type:02b}",
        })
        return d


@dataclass(frozen=True)
class CertStatVDO(VDO):
    """
    Certification Status VDO.
    Traditionally carries an XID (32-bit). Display as hex and split halves.
    """

    @property
    def xid(self) -> int:
        return _u32(self.raw)

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        r = _u32(self.raw)
        d.update({
            "XID": f"0x{r:08X}",
        })
        return d


@dataclass(frozen=True)
class ProductVDO(VDO):
    """
    Product VDO (Table 6.38):
      - B31..16 : USB Product ID
      - B15..0  : bcdDevice
    """

    @property
    def pid(self) -> int:
        return _bits(self.raw, 31, 16)

    @property
    def bcd_device(self) -> int:
        return _bits(self.raw, 15, 0)

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update({
            "PID": f"0x{self.pid:04X}",
            "BCD Device": f"0x{self.bcd_device:04X}",
        })
        return d


# ---------- Product-type VDOs (exact one branch per identity) ----------

@dataclass(frozen=True)
class ProductTypeUfpVDO(VDO):
    """
    UFP VDO (Table 6.39).
    """

    @property
    def vdo_version(self) -> int:
        return _bits(self.raw, 31, 29)

    @property
    def device_capability(self) -> int:
        return _bits(self.raw, 27, 24)

    @property
    def vconn_power(self) -> int:
        return _bits(self.raw, 10, 8)

    @property
    def vconn_required(self) -> bool:
        return bool(_bits(self.raw, 7, 7))

    @property
    def vbus_required(self) -> bool:
        # Per spec: 0 means Yes, 1 means No.
        return _bits(self.raw, 6, 6) == 0

    @property
    def alternate_modes(self) -> int:
        return _bits(self.raw, 5, 3)

    @property
    def usb_highest_speed(self) -> int:
        return _bits(self.raw, 2, 0)

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update({
            "VDO Version": f"0b{self.vdo_version:03b}",
            "Device Capability": f"0b{self.device_capability:04b}",
            "VCONN Power": f"0b{self.vconn_power:03b}",
            "VCONN Required": "Yes" if self.vconn_required else "No",
            "VBUS Required": "Yes" if self.vbus_required else "No",
            "Alternate Modes": f"0b{self.alternate_modes:03b}",
            "USB Highest Speed":
                _usb_highest_speed_text(self.usb_highest_speed),
            "USB Highest Speed Raw":
                f"0b{self.usb_highest_speed:03b}",
        })
        return d


@dataclass(frozen=True)
class ProductTypeDfpVDO(VDO):
    """
    DFP VDO (Table 6.40).
    """

    @property
    def vdo_version(self) -> int:
        return _bits(self.raw, 31, 29)

    @property
    def host_capability(self) -> int:
        return _bits(self.raw, 26, 24)

    @property
    def port_number(self) -> int:
        return _bits(self.raw, 4, 0)

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update({
            "VDO Version": f"0b{self.vdo_version:03b}",
            "Host Capability": f"0b{self.host_capability:03b}",
            "Port Number": self.port_number,
        })
        return d


@dataclass(frozen=True)
class PassiveCableVDO(VDO):
    """
    Passive Cable VDO (Table 6.41).
    """
    @property
    def usb_highest_speed_bits(self) -> int:
        return _bits(self.raw, 2, 0)

    @property
    def usb_speed(self) -> CableSpeed:
        """Get the USB Highest Speed field."""
        speed_bits = self.usb_highest_speed_bits
        try:
            return CableSpeed(speed_bits)
        except ValueError:
            return CableSpeed.USB2_ONLY

    @property
    def latency(self) -> CableLatency:
        """Get cable latency category from B16..13."""
        latency_bits = _bits(self.raw, 16, 13)
        try:
            return CableLatency(latency_bits)
        except ValueError:
            return CableLatency.RESERVED

    @property
    def vconn_required(self) -> bool:
        return _bits(self.raw, 12, 11) == 0b01

    @property
    def epr_capable(self) -> bool:
        return bool(_bits(self.raw, 17, 17))

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        termination_bits = _bits(self.raw, 12, 11)
        current_bits = _bits(self.raw, 6, 5)
        current_text = {
            0b01: "3A",
            0b10: "5A",
        }.get(current_bits, "Reserved")
        d.update({
            "HW Version": f"0x{_bits(self.raw, 31, 28):X}",
            "FW Version": f"0x{_bits(self.raw, 27, 24):X}",
            "VDO Version": f"0b{_bits(self.raw, 23, 21):03b}",
            "Cable Type": {
                0b10: "USB Type-C",
                0b11: "Captive",
            }.get(_bits(self.raw, 19, 18), "Reserved"),
            "EPR Capable": "Yes" if self.epr_capable else "No",
            "Cable Latency": self.latency.description,
            "Cable Termination Type": {
                0b00: "VCONN not required",
                0b01: "VCONN required",
            }.get(termination_bits, "Reserved"),
            "Maximum VBUS Voltage":
                _max_vbus_voltage_text(_bits(self.raw, 10, 9)),
            "VBUS Current Handling": current_text,
            "USB Highest Speed":
                _usb_highest_speed_text(self.usb_highest_speed_bits),
            "Latency Raw": f"0b{_bits(self.raw, 16, 13):04b}",
            "Termination Raw": f"0b{termination_bits:02b}",
            "Current Capability Raw": f"0b{current_bits:02b}",
            "USB Highest Speed Raw":
                f"0b{self.usb_highest_speed_bits:03b}",
        })
        return d


@dataclass(frozen=True)
class ActiveCableVDO1(VDO):
    """
    Active Cable VDO1 (Table 6.42).
    """
    @property
    def usb_highest_speed_bits(self) -> int:
        return _bits(self.raw, 2, 0)

    @property
    def usb_speed(self) -> CableSpeed:
        """Get the USB Highest Speed field."""
        speed_bits = self.usb_highest_speed_bits
        try:
            return CableSpeed(speed_bits)
        except ValueError:
            return CableSpeed.USB2_ONLY

    @property
    def latency(self) -> CableLatency:
        """Get cable latency category from B16..13."""
        latency_bits = _bits(self.raw, 16, 13)
        try:
            return CableLatency(latency_bits)
        except ValueError:
            return CableLatency.RESERVED

    @property
    def epr_capable(self) -> bool:
        return bool(_bits(self.raw, 17, 17))

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        termination_bits = _bits(self.raw, 12, 11)
        current_bits = _bits(self.raw, 6, 5)
        current_text = {
            0b01: "3A",
            0b10: "5A",
        }.get(current_bits, "Reserved")
        d.update({
            "HW Version": f"0x{_bits(self.raw, 31, 28):X}",
            "FW Version": f"0x{_bits(self.raw, 27, 24):X}",
            "VDO Version": f"0b{_bits(self.raw, 23, 21):03b}",
            "Cable Type": {
                0b10: "USB Type-C",
                0b11: "Captive",
            }.get(_bits(self.raw, 19, 18), "Reserved"),
            "EPR Capable": "Yes" if self.epr_capable else "No",
            "Cable Latency": self.latency.description,
            "Cable Termination Type": {
                0b10: "One end active, one end passive",
                0b11: "Both ends active",
            }.get(termination_bits, "Reserved"),
            "Maximum VBUS Voltage":
                _max_vbus_voltage_text(_bits(self.raw, 10, 9)),
            "SBU Supported": "Yes" if _bits(self.raw, 8, 8) == 0 else "No",
            "SBU Type": "Active" if _bits(self.raw, 7, 7) else "Passive",
            "VBUS Current Handling": current_text,
            "VBUS Through Cable": "Yes" if _bits(self.raw, 4, 4) else "No",
            "SOP'' Controller Present":
                "Yes" if _bits(self.raw, 3, 3) else "No",
            "USB Highest Speed":
                _usb_highest_speed_text(self.usb_highest_speed_bits),
            "Latency Raw": f"0b{_bits(self.raw, 16, 13):04b}",
            "Termination Raw": f"0b{termination_bits:02b}",
            "Current Capability Raw": f"0b{current_bits:02b}",
            "USB Highest Speed Raw":
                f"0b{self.usb_highest_speed_bits:03b}",
        })
        return d


@dataclass(frozen=True)
class ActiveCableVDO2(VDO):
    """
    Active Cable VDO2 (Table 6.43).
    """

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        u3_cld_bits = _bits(self.raw, 14, 12)
        d.update({
            "Max Operating Temp (C)": _bits(self.raw, 31, 24),
            "Shutdown Temp (C)": _bits(self.raw, 23, 16),
            "U3/CLd Power": {
                0b000: ">10mW",
                0b001: "5-10mW",
                0b010: "1-5mW",
                0b011: "0.5-1mW",
                0b100: "0.2-0.5mW",
                0b101: "50-200uW",
                0b110: "<50uW",
            }.get(u3_cld_bits, "Reserved"),
            "U3 to U0 Transition": (
                "U3 to U0 through U3S"
                if _bits(self.raw, 11, 11) else "U3 to U0 direct"
            ),
            "Physical Connection":
                "Optical" if _bits(self.raw, 10, 10) else "Copper",
            "Active Element":
                "Re-timer" if _bits(self.raw, 9, 9) else "Re-driver",
            "USB4 Supported":
                "No" if _bits(self.raw, 8, 8) else "Yes",
            "USB2 Hub Hops Consumed": _bits(self.raw, 7, 6),
            "USB 2.0 Supported":
                "No" if _bits(self.raw, 5, 5) else "Yes",
            "USB 3.2 Supported":
                "No" if _bits(self.raw, 4, 4) else "Yes",
            "USB Lanes Supported":
                "Two lanes" if _bits(self.raw, 3, 3) else "One lane",
            "Optically Isolated Cable":
                "Yes" if _bits(self.raw, 2, 2) else "No",
            "USB4 Asymmetric Mode":
                "Yes" if _bits(self.raw, 1, 1) else "No",
            "USB Gen":
                "Gen 2 or higher" if _bits(self.raw, 0, 0) else "Gen 1",
            "U3/CLd Power Raw": f"0b{u3_cld_bits:03b}",
        })
        return d


@dataclass(frozen=True)
class ActiveCableVDO3(VDO):
    """
    Active Cable VDO #3 (extensions for newer capabilities).
    """

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        return d


@dataclass(frozen=True)
class AmaVDO(VDO):
    """
    Alternate Mode Adapter (AMA) VDO.
    """

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        return d


@dataclass(frozen=True)
class VpdVDO(VDO):
    """
    VCONN-Powered Device (VPD) VDO (Table 6.44).
    """

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        charge_through = bool(_bits(self.raw, 0, 0))
        d.update({
            "HW Version": f"0x{_bits(self.raw, 31, 28):X}",
            "FW Version": f"0x{_bits(self.raw, 27, 24):X}",
            "VDO Version": f"0b{_bits(self.raw, 23, 21):03b}",
            "Maximum VBUS Voltage":
                _max_vbus_voltage_text(_bits(self.raw, 16, 15)),
            "Charge Through Current":
                "5A" if _bits(self.raw, 14, 14) else "3A/Reserved",
            "VBUS Impedance (2mOhm units)":
                _bits(self.raw, 12, 7) if charge_through else 0,
            "Ground Impedance (1mOhm units)":
                _bits(self.raw, 6, 1) if charge_through else 0,
            "Charge Through Supported":
                "Yes" if charge_through else "No",
        })
        return d


# ---------- Discover SVIDs ----------

@dataclass(frozen=True)
class SvidsVDO(VDO):
    """
    SVIDs VDO: packs up to two 16-bit SVIDs per VDO.
      - B15..0  : SVID0
      - B31..16 : SVID1
    """

    @property
    def svid0(self) -> int:
        return _bits(self.raw, 15, 0)

    @property
    def svid1(self) -> int:
        return _bits(self.raw, 31, 16)

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        s0, s1 = self.svid0, self.svid1
        d.update({
            "SVID0": f"0x{s0:04X}" if s0 else "0x0000",
            "SVID1": f"0x{s1:04X}" if s1 else "0x0000",
        })
        return d


# ---------- Discover Modes (per SVID) ----------

@dataclass(frozen=True)
class ModesVDO(VDO):
    """
    Modes VDO: commonly conveys a compact list of mode numbers for a given SVID.
    The exact packing can vary; for display we expose six 4-bit nibbles plus raw bytes.
    """

    @property
    def mode_nibbles(self) -> List[int]:
        """Return six 4-bit values (nibbles 0..5) extracted from the 32-bit word."""
        return [(_u32(self.raw) >> (n * 4)) & 0xF for n in range(6)]

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update({
            "Modes": [m for m in self.mode_nibbles if m != 0]
        })
        return d


# ---------- Enter/Exit Mode (optional wrappers — display only) ----------

@dataclass(frozen=True)
class EnterModePayloadVDO(VDO):
    """Enter Mode payload (usually header-only; this is a display wrapper if present)."""

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        return d


@dataclass(frozen=True)
class ExitModePayloadVDO(VDO):
    """Exit Mode payload (usually header-only; this is a display wrapper if present)."""

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        return d


# ---------- Attention (mode-specific; keep generic) ----------

@dataclass(frozen=True)
class AttentionVDO(VDO):
    """Attention payload VDO (SVID/mode specific — shown generically)."""

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        return d
