"""
Copyright (c) 2025 MTA, Inc.

This module defines the Header class for USB-PD messages, including the decoding of various fields
such as message type, port roles, and actors involved in the communication.
"""

import enum

from dataclasses import dataclass
from typing import Dict, Optional

from .sop import SOP, SOPType


class MessageCategory(enum.Enum):
    """
    Enum representing the category of a USB-PD message.
    """
    CONTROL = "Control"
    DATA = "Data"
    EXTENDED = "Extended"


class MessageType(enum.Enum):
    """
    Enum representing the different types of USB-PD messages, including
    standard control/data messages and PD 3.x extended messages.
    """

    # Control Messages

    GOOD_CRC = "GoodCRC"
    GOTO_MIN = "GotoMin"
    ACCEPT = "Accept"
    REJECT = "Reject"
    PING = "Ping"
    PS_RDY = "PS_RDY"
    GET_SOURCE_CAP = "Get_Source_Cap"
    GET_SINK_CAP = "Get_Sink_Cap"
    DR_SWAP = "DR_Swap"
    PR_SWAP = "PR_Swap"
    VCONN_SWAP = "VCONN_Swap"
    WAIT = "Wait"
    SOFT_RESET = "Soft_Reset"
    DATA_RESET = "Data_Reset"
    DATA_RESET_COMPLETE = "Data_Reset_Complete"
    NOT_SUPPORTED = "Not_Supported"
    GET_SOURCE_CAP_EXTENDED = "Get_Source_Cap_Extended"
    GET_STATUS = "Get_Status"
    FR_SWAP = "FR_Swap"
    GET_PPS_STATUS = "Get_PPS_Status"
    GET_COUNTRY_CODES = "Get_Country_Codes"
    GET_SINK_CAP_EXTENDED = "Get_Sink_Cap_Extended"
    GET_SOURCE_INFO = "Get_Source_Info"
    GET_REVISION = "Get_Revision"

    # Data Messages

    SOURCE_CAPABILITIES = "Source_Capabilities"
    REQUEST = "Request"
    BIST = "BIST"
    SINK_CAPABILITIES = "Sink_Capabilities"
    BATTERY_STATUS = "Battery_Status"
    ALERT = "Alert"
    GET_COUNTRY_INFORMATION = "Get_Country_Info"
    ENTER_USB = "Enter_USB"
    EPR_REQUEST = "EPR_Request"
    EPR_MODE = "EPR_Mode"
    SOURCE_INFORMATION = "Source_Info"
    REVISION = "Revision"
    VENDOR_DEFINED = "Vendor_Defined"

    # Extended Data Messages (PD 3.x)

    SOURCE_CAPABILITIES_EXTENDED = "Source_Capabilities_Extended"
    STATUS = "Status"
    GET_BATTERY_CAP = "Get_Battery_Cap"
    GET_BATTERY_STATUS = "Get_Battery_Status"
    BATTERY_CAPABILITIES = "Battery_Capabilities"
    GET_MANUFACTURER_INFO = "Get_Manufacturer_Info"
    MANUFACTURER_INFO = "Manufacturer_Info"
    SECURITY_REQUEST = "Security_Request"
    SECURITY_RESPONSE = "Security_Response"
    FIRMWARE_UPDATE_REQUEST = "Firmware_Update_Request"
    FIRMWARE_UPDATE_RESPONSE = "Firmware_Update_Response"
    PPS_STATUS = "PPS_Status"
    COUNTRY_INFO = "Country_Info"
    COUNTRY_CODES = "Country_Codes"
    SINK_CAPABILITIES_EXTENDED = "Sink_Capabilities_Extended"
    EXTENDED_CONTROL = "Extended_Control"
    EPR_SOURCE_CAPABILITIES = "EPR_Source_Capabilities"
    EPR_SINK_CAPABILITIES = "EPR_Sink_Capabilities"
    VENDOR_DEFINED_EXTENDED = "Vendor_Defined_Extended"

    # Reserved Messages

    RESERVED = "Reserved"

    @classmethod
    def from_header(cls, header_value: int, data_object_count: int, extended: bool = False) -> 'MessageType':
        """
        Determine the message type from the header value, data object count,
        and the Extended bit.

        Args:
            header_value (int): The header value from the USB-PD message (bits 0-4).
            data_object_count (int): The number of data objects in the message.
            extended (bool): Whether the message uses the Extended format.

        Returns:
            MessageType: The corresponding message type.
        """

        msg_bits = header_value & 0b11111

        if extended:
            extended_map = {
                0b0001: cls.SOURCE_CAPABILITIES_EXTENDED,
                0b0010: cls.STATUS,
                0b0011: cls.GET_BATTERY_CAP,
                0b0100: cls.GET_BATTERY_STATUS,
                0b0101: cls.BATTERY_CAPABILITIES,
                0b0110: cls.GET_MANUFACTURER_INFO,
                0b0111: cls.MANUFACTURER_INFO,
                0b1000: cls.SECURITY_REQUEST,
                0b1001: cls.SECURITY_RESPONSE,
                0b1010: cls.FIRMWARE_UPDATE_REQUEST,
                0b1011: cls.FIRMWARE_UPDATE_RESPONSE,
                0b1100: cls.PPS_STATUS,
                0b1101: cls.COUNTRY_INFO,
                0b1110: cls.COUNTRY_CODES,
                0b1111: cls.SINK_CAPABILITIES_EXTENDED,
                0b10000: cls.EXTENDED_CONTROL,
                0b10001: cls.EPR_SOURCE_CAPABILITIES,
                0b10010: cls.EPR_SINK_CAPABILITIES,
                0b10011: cls.VENDOR_DEFINED_EXTENDED,
            }
            return extended_map.get(msg_bits, cls.RESERVED)

        if data_object_count == 0:
            match msg_bits:
                case 0b00001:
                    return cls.GOOD_CRC
                case 0b00010:
                    return cls.GOTO_MIN
                case 0b00011:
                    return cls.ACCEPT
                case 0b00100:
                    return cls.REJECT
                case 0b00101:
                    return cls.PING
                case 0b00110:
                    return cls.PS_RDY
                case 0b00111:
                    return cls.GET_SOURCE_CAP
                case 0b01000:
                    return cls.GET_SINK_CAP
                case 0b01001:
                    return cls.DR_SWAP
                case 0b01010:
                    return cls.PR_SWAP
                case 0b01011:
                    return cls.VCONN_SWAP
                case 0b01100:
                    return cls.WAIT
                case 0b01101:
                    return cls.SOFT_RESET
                case 0b01110:
                    return cls.DATA_RESET
                case 0b01111:
                    return cls.DATA_RESET_COMPLETE
                case 0b10000:
                    return cls.NOT_SUPPORTED
                case 0b10001:
                    return cls.GET_SOURCE_CAP_EXTENDED
                case 0b10010:
                    return cls.GET_STATUS
                case 0b10011:
                    return cls.FR_SWAP
                case 0b10100:
                    return cls.GET_PPS_STATUS
                case 0b10101:
                    return cls.GET_COUNTRY_CODES
                case 0b10110:
                    return cls.GET_SINK_CAP_EXTENDED
                case 0b10111:
                    return cls.GET_SOURCE_INFO
                case 0b11000:
                    return cls.GET_REVISION
                case _:
                    return cls.RESERVED

        match msg_bits:
            case 0b0001:
                return cls.SOURCE_CAPABILITIES
            case 0b0010:
                return cls.REQUEST
            case 0b0011:
                return cls.BIST
            case 0b0100:
                return cls.SINK_CAPABILITIES
            case 0b0101:
                return cls.BATTERY_STATUS
            case 0b0110:
                return cls.ALERT
            case 0b0111:
                return cls.GET_COUNTRY_INFORMATION
            case 0b1000:
                return cls.ENTER_USB
            case 0b1001:
                return cls.EPR_REQUEST
            case 0b1010:
                return cls.EPR_MODE
            case 0b1011:
                return cls.SOURCE_INFORMATION
            case 0b1100:
                return cls.REVISION
            case 0b1111:
                return cls.VENDOR_DEFINED
            case _:
                return cls.RESERVED


class PortPowerRole(enum.Enum):
    """
    Enum representing the power role of a USB-PD port.
    """
    SOURCE = "Source"
    SINK = "Sink"
    INVALID = "N/A"


class PortDataRole(enum.Enum):
    """
    Enum representing the data role of a USB-PD port.
    """
    UFP = "UFP"  # Upstream Facing Port
    DFP = "DFP"  # Downstream Facing Port
    INVALID = "N/A"


class CablePlug(enum.Enum):
    """
    Enum representing the type of cable plug in USB-PD communication.
    """
    UFPDFP = "UFP/DFP"
    CABLE_PLUG = "Cable Plug"
    INVALID = "N/A"


class SpecificationRevision(enum.Enum):
    """
    Enum representing the USB-PD specification revision.
    """
    REV1 = "1.0"
    REV2 = "2.0"
    REV3 = "3.x"
    RESERVED = "Reserved"


class Actor(enum.Enum):
    """
    Enum representing the actor in a USB-PD message.
    """
    SOURCE = "Source"
    SINK = "Sink"
    NEAR_CABLE_PLUG = "Near Plug"
    FAR_CABLE_PLUG = "Far Plug"
    UNKNOWN = "Unknown"


class Header:
    """
    Header decoder for a USB-PD message.
    """

    def __init__(self, sop: SOP, header_data: Optional[int] = None):
        """
        Initialize a Header instance. If header_data is not provided, sensible defaults are applied.
        Args:
            header_data (int, optional): Encoded header data. If None, defaults are used.
            sop (SOP, optional): SOP object. If None, a default SOP is used.
        """
        self.sop = sop

        if header_data is not None:
            self.header_data = header_data
        else:
            # Sensible defaults for a USB-PD header
            # GoodCRC, 0 data objects, message_id=0, spec_rev=REV2, source, DFP
            self.header_data = 0
            # Data Object Count (bits 12-14)
            self.header_data |= (0 & 0b111) << 12
            # Message ID (bits 9-11)
            self.header_data |= (0 & 0b111) << 9
            # Specification Revision (bits 6-7)
            self.header_data |= (1 & 0b11) << 6  # REV2
            # Port Power Role (bit 8)
            self.header_data |= (0 & 0b1) << 8  # Source
            # Port Data Role (bit 5)
            self.header_data |= (1 & 0b1) << 5  # DFP
            # Message Type (bits 0-4)
            self.header_data |= (1 & 0b11111)  # GoodCRC

    def __repr__(self):
        return f"Header(data={self.header_data:#010x}," + \
            f" SOP={self.sop.sop_type.value}, " + \
            f" Category={self.category.value}, " + \
            f" From={self.from_actor.value}, " + \
            f" To={self.to_actor.value}, " + \
            f" Extended={self.extended}, " + \
            f" ID={self.message_id}, " + \
            f" Type={self.message_type.value}, " + \
            f" DataObjects={self.data_object_count}, " + \
            f" PowerRole={self.port_power_role.value}, " + \
            f" DataRole={self.port_data_role.value}, " + \
            f" CablePlug={self.cable_plug.value}, " + \
            f" SpecRevision={self.specification_revision.value})"

    def to_dict(self) -> Dict:
        """
        Convert the header instance into a dictionary representation with human-readable keys.

        Returns:
            Dict: A dictionary containing all the header properties with human-friendly keys.
        """
        return {
            'Raw Data': f"{self.header_data:#010x}",
            'Extended': self.extended,
            'Category': self.category.value,
            'Data Objects': self.data_object_count,
            'Message ID': f"0x{self.message_id:X}",
            'Message Type': self.message_type.value,
            'Message Type Number': f"0x{self.message_type_number:02X}",
            'Power Role': self.port_power_role.value,
            'Data Role': self.port_data_role.value,
            'Cable Plug': self.cable_plug.value,
            'Specification': self.specification_revision.value,
            'SOP Type': f"{self.sop.sop_type.value} ({' '.join(f'0x{k:02X}' for k in self.sop.kcodes)})",
        }

    def encode(self) -> bytes:
        """
        Output the encoded header as bytes, starting with the four SOP entries (one byte each),
        followed by the header as two bytes (little-endian).

        Returns:
            bytes: The encoded header as bytes.
        """
        # SOP: expects self.sop.kcodes to be a list/tuple of 4 integers (0-255)
        sop_bytes = bytes(self.sop.kcodes[:4])

        return sop_bytes + self.header_data.to_bytes(2, byteorder='little')

    @property
    def extended(self) -> bool:
        """
        Check if the header is extended.

        Returns:
            bool: True if the header is extended, False otherwise.
        """
        return self.header_data & 0x8000 != 0

    @property
    def category(self) -> MessageCategory:
        """
        Get the category of the message (Control or Data).

        Returns:
            MessageCategory: The category of the USB-PD message.
        """
        if self.extended:
            return MessageCategory.EXTENDED

        if self.data_object_count == 0:
            return MessageCategory.CONTROL

        return MessageCategory.DATA

    @property
    def data_object_count(self) -> int:
        """
        Get the number of data objects in the message.

        Returns:
            int: The number of data objects.
        """
        return (self.header_data >> 12) & 0b111

    @property
    def message_id(self) -> int:
        """
        Get the message ID from the header data.

        Returns:
            int: The message ID.
        """
        return (self.header_data >> 9) & 0b111

    @property
    def message_type_number(self) -> int:
        """
        Get the message type number from the header data.

        Returns:
            int: The message type number.
        """
        return self.header_data & 0b11111

    @property
    def message_type(self) -> MessageType:
        """
        Get the message type based on the header data and SOP.

        Returns:
            MessageType: The type of the USB-PD message.
        """
        return MessageType.from_header(self.header_data & 0b11111, self.data_object_count, self.extended)

    @property
    def port_power_role(self) -> PortPowerRole:
        """
        Get the port power role from the header data.

        Returns:
            PortPowerRole: The port power role (0 for source, 1 for sink).
        """
        if self.sop.sop_type == SOPType.SOP:
            if (self.header_data >> 8) & 0b1:
                return PortPowerRole.SOURCE
            else:
                return PortPowerRole.SINK

        return PortPowerRole.INVALID

    @property
    def port_data_role(self) -> PortDataRole:
        """
        Get the port data role from the header data.

        Returns:
            PortDataRole: The port data role (0 for UFP, 1 for DFP).
        """
        if self.sop.sop_type == SOPType.SOP:
            if (self.header_data >> 5) & 0b1:
                return PortDataRole.DFP
            else:
                return PortDataRole.UFP

        return PortDataRole.INVALID

    @property
    def cable_plug(self) -> CablePlug:
        """
        Get the cable plug type from the header data.

        Returns:
            CablePlug: The type of cable plug (UFP/DFP).
        """
        if self.sop.sop_type in [SOPType.SOP_PRIME, SOPType.SOP_DOUBLE_PRIME]:
            if (self.header_data >> 8) & 0b1:
                return CablePlug.UFPDFP
            else:
                return CablePlug.CABLE_PLUG

        return CablePlug.INVALID

    @property
    def specification_revision(self) -> SpecificationRevision:
        """
        Get the USB-PD specification revision from the header data.

        Returns:
            SpecificationRevision: The USB-PD specification revision.
        """
        match self.header_data >> 6 & 0b11:
            case 0b00:
                return SpecificationRevision.REV1
            case 0b01:
                return SpecificationRevision.REV2
            case 0b10:
                return SpecificationRevision.REV3
            case _:
                return SpecificationRevision.RESERVED

    @property
    def from_actor(self) -> Actor:
        """
        Determine the actor (Source, Sink, Cable, Unknown) based on the SOP type and port roles.

        Returns:
            Actor: The actor of the message.
        """
        if self.sop.sop_type == SOPType.SOP:
            match self.port_power_role:
                case PortPowerRole.SOURCE:
                    return Actor.SOURCE
                case PortPowerRole.SINK:
                    return Actor.SINK
                case _:
                    return Actor.UNKNOWN

        if self.sop.sop_type in [SOPType.SOP_PRIME, SOPType.SOP_DOUBLE_PRIME]:
            match self.cable_plug:
                case CablePlug.UFPDFP:
                    return Actor.SOURCE
                case CablePlug.CABLE_PLUG:
                    if self.sop.sop_type == SOPType.SOP_PRIME:
                        return Actor.NEAR_CABLE_PLUG

                    return Actor.FAR_CABLE_PLUG
                case _:
                    return Actor.UNKNOWN

        return Actor.UNKNOWN

    @property
    def to_actor(self) -> Actor:
        """
        Determine the recipient actor (Source, Sink, Cable, Unknown) based on the SOP type and port roles.

        Returns:
            Actor: The recipient actor of the message.
        """
        if self.sop.sop_type == SOPType.SOP:
            match self.port_power_role:
                case PortPowerRole.SOURCE:
                    return Actor.SINK
                case PortPowerRole.SINK:
                    return Actor.SOURCE
                case _:
                    return Actor.UNKNOWN

        if self.sop.sop_type in [SOPType.SOP_PRIME, SOPType.SOP_DOUBLE_PRIME]:
            match self.cable_plug:
                case CablePlug.UFPDFP:
                    match self.sop.sop_type:
                        case SOPType.SOP_PRIME:
                            return Actor.NEAR_CABLE_PLUG
                        case SOPType.SOP_DOUBLE_PRIME:
                            return Actor.FAR_CABLE_PLUG
                        case _:
                            return Actor.UNKNOWN
                case CablePlug.CABLE_PLUG:
                    return Actor.SOURCE

                case _:
                    return Actor.UNKNOWN

        return Actor.UNKNOWN

    @classmethod
    def from_fields(
        cls,
        sop: SOP,
        message_type: MessageType,
        data_object_count: int = 0,
        message_id: int = 0,
        specification_revision: SpecificationRevision = SpecificationRevision.REV2,
        port_power_role: PortPowerRole = PortPowerRole.SOURCE,
        port_data_role: PortDataRole = PortDataRole.DFP,
        cable_plug: CablePlug = CablePlug.UFPDFP,
        extended: bool = False
    ) -> "Header":
        """
        Create a Header instance from explicit field values.

        Args:
            sop (SOP): SOP object.
            message_type (MessageType): Type of the USB-PD message.
            data_object_count (int): Number of data objects (0-7).
            message_id (int): Message ID (0-7).
            specification_revision (SpecificationRevision): USB-PD spec revision.
            port_power_role (PortPowerRole): Power role.
            port_data_role (PortDataRole): Data role.
            cable_plug (CablePlug): Cable plug type.
            extended (bool): Extended header flag.

        Returns:
            Header: Constructed Header instance.
        """
        header_data = 0
        # Data Object Count (bits 12-14)
        header_data |= (data_object_count & 0b111) << 12
        # Message ID (bits 9-11)
        header_data |= (message_id & 0b111) << 9
        # Specification Revision (bits 6-7)
        spec_rev_map = {
            SpecificationRevision.REV1: 0b00,
            SpecificationRevision.REV2: 0b01,
            SpecificationRevision.REV3: 0b10,
            SpecificationRevision.RESERVED: 0b11,
        }
        header_data |= (spec_rev_map.get(
            specification_revision, 0b01) & 0b11) << 6

        # Port Power Role (bit 8)
        if sop.sop_type == SOPType.SOP:
            header_data |= (1 if port_power_role ==
                            PortPowerRole.SOURCE else 0) << 8
            # Port Data Role (bit 5)
            header_data |= (1 if port_data_role ==
                            PortDataRole.DFP else 0) << 5
        elif sop.sop_type in [SOPType.SOP_PRIME, SOPType.SOP_DOUBLE_PRIME]:
            header_data |= (1 if cable_plug == CablePlug.UFPDFP else 0) << 8

        # Message Type (bits 0-4)
        # For extended messages, use the PD 3.x extended mapping.
        # Otherwise choose the control or data mapping based on the DO count.
        if extended:
            extended_map = {
                MessageType.SOURCE_CAPABILITIES_EXTENDED: 0b0001,
                MessageType.STATUS: 0b0010,
                MessageType.GET_BATTERY_CAP: 0b0011,
                MessageType.GET_BATTERY_STATUS: 0b0100,
                MessageType.BATTERY_CAPABILITIES: 0b0101,
                MessageType.GET_MANUFACTURER_INFO: 0b0110,
                MessageType.MANUFACTURER_INFO: 0b0111,
                MessageType.SECURITY_REQUEST: 0b1000,
                MessageType.SECURITY_RESPONSE: 0b1001,
                MessageType.FIRMWARE_UPDATE_REQUEST: 0b1010,
                MessageType.FIRMWARE_UPDATE_RESPONSE: 0b1011,
                MessageType.PPS_STATUS: 0b1100,
                MessageType.COUNTRY_INFO: 0b1101,
                MessageType.COUNTRY_CODES: 0b1110,
                MessageType.SINK_CAPABILITIES_EXTENDED: 0b1111,
                MessageType.EXTENDED_CONTROL: 0b10000,
                MessageType.EPR_SOURCE_CAPABILITIES: 0b10001,
                MessageType.EPR_SINK_CAPABILITIES: 0b10010,
                MessageType.VENDOR_DEFINED_EXTENDED: 0b10011,
            }
            msg_type_num = extended_map.get(message_type, 0)
        elif data_object_count == 0:
            control_map = {
                MessageType.GOOD_CRC: 0b00001,
                MessageType.GOTO_MIN: 0b00010,
                MessageType.ACCEPT: 0b00011,
                MessageType.REJECT: 0b00100,
                MessageType.PING: 0b00101,
                MessageType.PS_RDY: 0b00110,
                MessageType.GET_SOURCE_CAP: 0b00111,
                MessageType.GET_SINK_CAP: 0b01000,
                MessageType.DR_SWAP: 0b01001,
                MessageType.PR_SWAP: 0b01010,
                MessageType.VCONN_SWAP: 0b01011,
                MessageType.WAIT: 0b01100,
                MessageType.SOFT_RESET: 0b01101,
                MessageType.DATA_RESET: 0b01110,
                MessageType.DATA_RESET_COMPLETE: 0b01111,
                MessageType.NOT_SUPPORTED: 0b10000,
                MessageType.GET_SOURCE_CAP_EXTENDED: 0b10001,
                MessageType.GET_STATUS: 0b10010,
                MessageType.FR_SWAP: 0b10011,
                MessageType.GET_PPS_STATUS: 0b10100,
                MessageType.GET_COUNTRY_CODES: 0b10101,
                MessageType.GET_SINK_CAP_EXTENDED: 0b10110,
                MessageType.GET_SOURCE_INFO: 0b10111,
                MessageType.GET_REVISION: 0b11000,
            }
            msg_type_num = control_map.get(message_type, 0)
        else:
            data_map = {
                MessageType.SOURCE_CAPABILITIES: 0b0001,
                MessageType.REQUEST: 0b0010,
                MessageType.BIST: 0b0011,
                MessageType.SINK_CAPABILITIES: 0b0100,
                MessageType.BATTERY_STATUS: 0b0101,
                MessageType.ALERT: 0b0110,
                MessageType.GET_COUNTRY_INFORMATION: 0b0111,
                MessageType.ENTER_USB: 0b1000,
                MessageType.EPR_REQUEST: 0b1001,
                MessageType.EPR_MODE: 0b1010,
                MessageType.SOURCE_INFORMATION: 0b1011,
                MessageType.REVISION: 0b1100,
                MessageType.VENDOR_DEFINED: 0b1111,
            }
            msg_type_num = data_map.get(message_type, 0)
        header_data |= (msg_type_num & 0b11111)

        # Extended (bit 15)
        if extended:
            header_data |= 0x8000

        return cls(sop=sop, header_data=header_data)


# ---------- Extended Header (2 bytes at start of body) ----------

@dataclass(frozen=True)
class ExtendedHeader:
    """
    USB-PD Extended Message Header (first 2 bytes of the body, little-endian).

    Field layout (per USB PD R3.2, Section 6.4 Data Message):
      - Bits 0-8   (Data Size): Number of data bytes that follow the extended header.
      - Bits 9-10  (Reserved): Shall be zero; non-zero indicates a malformed header.
      - Bits 11-13 (Chunk Number): 0 for the first chunk, increments for subsequent chunks.
      - Bit  14    (Request Chunk, RCH): Set by a receiver to ask the sender for the chunk
                    indicated by Chunk Number.
      - Bit  15    (Chunked, CH): When set, the message is chunked; when clear, the entire
                    data block is contained in a single, unchunked message.
    """

    raw: int  # 16-bit extended header word

    @property
    def data_size_bytes(self) -> int:
        """Number of data bytes that follow the 2-byte extended header."""
        return self.raw & 0x01FF

    @property
    def reserved_bits(self) -> int:
        """Reserved bits (bits 9-10); should always be zero in valid PD traffic."""
        return (self.raw >> 9) & 0b11

    @property
    def chunk_number(self) -> int:
        """Chunk number (bits 11-13); 0 for the first chunk in a chunked transfer."""
        return (self.raw >> 11) & 0b111

    @property
    def request_chunk(self) -> bool:
        """Request Chunk flag (bit 14); True when the sender is requesting chunk chunk_number."""
        return bool((self.raw >> 14) & 0x1)

    @property
    def chunked(self) -> bool:
        """Chunked flag (bit 15); True when the extended message uses chunking."""
        return bool((self.raw >> 15) & 0x1)

    def to_dict(self) -> Dict[str, object]:
        return {
            "Raw Extended Header": f"0x{self.raw:04X}",
            "Data Size (bytes)": self.data_size_bytes,
            "Reserved Bits (9-10)": self.reserved_bits,
            "Reserved Bits Non-Zero": self.reserved_bits != 0,
            "Chunk Number": self.chunk_number,
            "Request Chunk": self.request_chunk,
            "Chunked": self.chunked,
        }
