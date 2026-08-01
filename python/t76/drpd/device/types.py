"""
Copyright (c) 2025 MTA, Inc.

Types and Enums for DRPD device communication.
"""

import enum

from dataclasses import dataclass, field
from decimal import Decimal
from typing import TypeAlias, Union

from t76.drpd.message.data_objects import SourcePDO


@dataclass
class DeviceInfo:
    """
    Represents the basic information of the device.
    """
    manufacturer: str
    model: str
    serial_number: str
    firmware_version: str
    hardware_revision: str | None = None


class DeviceStatusFlags(enum.Flag):
    """
    Represents the status flags of the device.
    """
    NONE = 0
    VBUS_STATUS_CHANGED = enum.auto()
    ROLE_CHANGED = enum.auto()
    CAPTURE_STATUS_CHANGED = enum.auto()
    CC_BUS_STATUS_CHANGED = enum.auto()
    TRIGGER_STATUS_CHANGED = enum.auto()
    SINK_PDO_LIST_CHANGED = enum.auto()
    SINK_STATUS_CHANGED = enum.auto()
    MESSAGE_RECEIVED = enum.auto()


class AnalogMonitorCCChannelStatus(enum.Enum):
    """
    Represents the status of the analog monitor CC channels.
    """
    UNKNOWN = "Unknown"
    SINK_TX_NG = "SinkTxNG"
    SINK_TX_OK = "SinkTxOK"
    V_CONN = "VConn"
    DISCONNECTED = "Disconnected"

    @staticmethod
    def status_from_voltage(voltage: float) -> 'AnalogMonitorCCChannelStatus':
        """
        Determine the status based on the voltage level.

        Args:
            voltage (float): The voltage level of the CC channel.

        Returns:
            AnalogMonitorCCChannelStatus: The corresponding status.
        """
        if voltage < 0.2:
            return AnalogMonitorCCChannelStatus.DISCONNECTED

        if voltage < 1.3:
            return AnalogMonitorCCChannelStatus.SINK_TX_NG

        if voltage < 2.2:
            return AnalogMonitorCCChannelStatus.SINK_TX_OK

        if voltage >= 2.7:
            return AnalogMonitorCCChannelStatus.V_CONN

        return AnalogMonitorCCChannelStatus.UNKNOWN


@dataclass
class AccumulatedMeasurements:
    """
    Represents accumulated VBUS charge and energy counters.
    """

    accumulation_elapsed_time_us: int
    accumulated_charge_mah: int
    accumulated_energy_mwh: int


@dataclass
class AnalogMonitorChannels:
    """
    Represents the analog monitor channels and their voltages.

    The VBUS capture timestamp is in microseconds when provided by the
    device firmware. Accumulation values are reported as elapsed time in
    microseconds plus absolute charge and energy counters.
    """
    vbus_timestamp_us: int | None
    dut_cc1: float
    dut_cc2: float
    usds_cc1: float
    usds_cc2: float
    vbus: float
    ibus: float
    adc_vref: float
    ground_ref: float
    current_vref: float
    accumulation_elapsed_time_us: int | None
    accumulated_charge_mah: int | None
    accumulated_energy_mwh: int | None

    @property
    def dut_cc1_status(self) -> AnalogMonitorCCChannelStatus:
        return AnalogMonitorCCChannelStatus.status_from_voltage(self.dut_cc1)

    @property
    def dut_cc2_status(self) -> AnalogMonitorCCChannelStatus:
        return AnalogMonitorCCChannelStatus.status_from_voltage(self.dut_cc2)

    @property
    def usds_cc1_status(self) -> AnalogMonitorCCChannelStatus:
        return AnalogMonitorCCChannelStatus.status_from_voltage(self.usds_cc1)

    @property
    def usds_cc2_status(self) -> AnalogMonitorCCChannelStatus:
        return AnalogMonitorCCChannelStatus.status_from_voltage(self.usds_cc2)


class Mode(enum.Enum):
    """
    Represents the mode of the device.
    """
    UNKNOWN = "UNKNOWN"
    DISABLED = "DISABLED"
    OBSERVER = "OBSERVER"
    SINK = "SINK"

    @classmethod
    def from_string(cls, mode_str: str) -> 'Mode':
        """
        Convert a string to a Mode enum.

        Args:
            mode_str (str): The string representation of the mode.

        Returns:
            Mode: The corresponding Mode enum.
        """
        try:
            return cls(mode_str.upper())
        except KeyError as exc:
            raise ValueError(f"Unknown mode: {mode_str}") from exc


class CCBusState(enum.Enum):
    """
    Represents the status of the CC bus on the device.
    """
    UNATTACHED = "UNATTACHED"
    SOURCE_FOUND = "SOURCE_FOUND"
    ATTACHED = "ATTACHED"

    @classmethod
    def from_string(cls, status_str: str) -> 'CCBusState':
        """
        Convert a string to a Status enum.

        Args:
            status_str (str): The string representation of the status.

        Returns:
            Status: The corresponding Status enum.
        """
        try:
            return cls(status_str.upper())
        except KeyError as exc:
            raise ValueError(f"Unknown status: {status_str}") from exc


class CCChannel(enum.Enum):
    """
    Represents the ports of the device.
    """
    DUT_CC1 = "DUTCC1"
    DUT_CC2 = "DUTCC2"
    USDS_CC1 = "USDSCC1"
    USDS_CC2 = "USDSCC2"
    NONE = "NONE"

    @classmethod
    def from_int(cls, port_int: int) -> 'CCChannel':
        """
        Convert an integer to a Port enum.

        Args:
            port_int (int): The integer representation of the port.

        Returns:
            Port: The corresponding Port enum.
        """
        mapping = {
            0: cls.DUT_CC1,
            1: cls.DUT_CC2,
            2: cls.USDS_CC1,
            3: cls.USDS_CC2,
        }

        try:
            return mapping[port_int]
        except KeyError:
            return cls.NONE

    @classmethod
    def from_string(cls, port_str: str) -> 'CCChannel':
        """
        Convert a string to a Port enum.

        Args:
            port_str (str): The string representation of the port.

        Returns:
            Port: The corresponding Port enum.
        """
        try:
            return cls(port_str.upper())
        except KeyError as exc:
            raise ValueError(f"Unknown port: {port_str}") from exc


class ResistorStatus(enum.Enum):
    """
    Represents the resistor status of a port.
    """
    UNKNOWN = "UNKNOWN"
    OBSERVER = "OBSERVER"
    CABLE = "CABLE"
    VCONN_5V = "VCONN_5V"
    VCONN_3V3 = "VCONN_3V3"
    SINK = "SINK"
    SOURCE_3A = "SOURCE_3A"
    SOURCE_1_5A = "SOURCE_1_5A"
    SOURCE_DEFAULT = "SOURCE_DEFAULT"

    @classmethod
    def from_string(cls, status_str: str) -> 'ResistorStatus':
        """
        Convert a string to a ResistorStatus enum.

        Args:
            status_str (str): The string representation of the resistor status.

        Returns:
            ResistorStatus: The corresponding ResistorStatus enum.
        """
        try:
            return cls(status_str.upper())
        except KeyError as exc:
            raise ValueError(f"Unknown resistor status: {status_str}") from exc


@dataclass
class MemoryUsage:
    """
    Represents the memory usage of the device, in bytes.
    """
    total: int
    free: int


class OnOffStatus(enum.Enum):
    """
    Represents the status of the capture.
    """
    ON = True
    OFF = False

    @classmethod
    def from_string(cls, status_str: str) -> 'OnOffStatus':
        """
        Convert a string to a CaptureStatus enum.

        Args:
            status_str (str): The string representation of the capture status.

        Returns:
            CaptureStatus: The corresponding CaptureStatus enum.
        """
        if status_str.lower() == "on":
            return cls.ON
        elif status_str.lower() == "off":
            return cls.OFF
        else:
            raise ValueError(f"Unknown on/off status: {status_str}")

    @classmethod
    def from_bool(cls, status_bool: bool) -> 'OnOffStatus':
        """
        Convert a boolean to an OnOffStatus enum.

        Args:
            status_bool (bool): The boolean representation of the status.

        Returns:
            OnOffStatus: The corresponding OnOffStatus enum.
        """
        return cls.ON if status_bool else cls.OFF


class TriggerStatus(enum.Enum):
    """
    Represents the trigger status of the device.
    """
    IDLE = "IDLE"
    ARMED = "ARMED"
    TRIGGERED = "TRIGGERED"

    @classmethod
    def from_string(cls, status_str: str) -> 'TriggerStatus':
        """
        Convert a string to a TriggerStatus enum.

        Args:
            status_str (str): The string representation of the trigger status.

        Returns:
            TriggerStatus: The corresponding TriggerStatus enum.
        """
        try:
            return cls(status_str.upper())
        except KeyError as exc:
            raise ValueError(f"Unknown trigger status: {status_str}") from exc


class TriggerType(enum.Enum):
    """
    Represents the trigger types of the device.
    """
    OFF = "OFF"
    PREAMBLE_START = "PREAMBLE_START"
    SOP_START = "SOP_START"
    HEADER_START = "HEADER_START"
    DATA_START = "DATA_START"
    MESSAGE_COMPLETE = "MESSAGE_COMPLETE"
    HARD_RESET_RECEIVED = "HARD_RESET_RECEIVED"
    INVALID_KCODE = "INVALID_KCODE"
    CRC_ERROR = "CRC_ERROR"
    TIMEOUT_ERROR = "TIMEOUT_ERROR"
    RUNT_PULSE_ERROR = "RUNT_PULSE_ERROR"
    ANY_ERROR = "ANY_ERROR"

    @classmethod
    def from_string(cls, type_str: str) -> 'TriggerType':
        """
        Convert a string to a TriggerType enum.

        Args:
            type_str (str): The string representation of the trigger type.

        Returns:
            TriggerType: The corresponding TriggerType enum.
        """
        try:
            return cls(type_str.upper())
        except KeyError as exc:
            raise ValueError(f"Unknown trigger type: {type_str}") from exc


class TriggerSyncMode(enum.Enum):
    """
    Represents the trigger output modes of the device.
    """
    PULSE_HIGH = "PULSE_HIGH"
    PULSE_LOW = "PULSE_LOW"
    TOGGLE = "TOGGLE"
    PULL_DOWN = "PULL_DOWN"

    @classmethod
    def from_string(cls, mode_str: str) -> 'TriggerSyncMode':
        """
        Convert a string to a TriggerOutputMode enum.

        Args:
            mode_str (str): The string representation of the trigger output mode.

        Returns:
            TriggerOutputMode: The corresponding TriggerOutputMode enum.
        """
        try:
            return cls(mode_str.upper())
        except KeyError as exc:
            raise ValueError(
                f"Unknown trigger output mode: {mode_str}") from exc


class TriggerSenderFilter(enum.Enum):
    """
    Represents the trigger sender filter.
    """

    ANY = "ANY"
    SOURCE = "SOURCE"
    SINK = "SINK"
    CABLE = "CABLE"

    @classmethod
    def from_string(cls, filter_str: str) -> 'TriggerSenderFilter':
        try:
            return cls(filter_str.upper())
        except KeyError as exc:
            raise ValueError(
                f"Unknown trigger sender filter: {filter_str}") from exc


class TriggerMessageTypeFilterClass(enum.Enum):
    """
    Represents a trigger message-type filter class.
    """

    CONTROL = "CONTROL"
    DATA = "DATA"

    @classmethod
    def from_string(
            cls,
            class_str: str) -> 'TriggerMessageTypeFilterClass':
        try:
            return cls(class_str.upper())
        except KeyError as exc:
            raise ValueError(
                f"Unknown trigger message type class: {class_str}") from exc


@dataclass(frozen=True)
class TriggerMessageTypeFilter:
    """
    Represents one trigger message-type filter slot.
    """

    filter_class: TriggerMessageTypeFilterClass
    message_type_number: int

    @classmethod
    def from_string(cls, value: str) -> 'TriggerMessageTypeFilter':
        class_token, separator, number_token = value.partition(":")
        if not separator:
            raise ValueError(f"Invalid trigger message type filter: {value}")

        parsed_number = int(number_token)
        if parsed_number < 0 or parsed_number > 0x1f:
            raise ValueError(
                f"Invalid trigger message type number: {value}"
            )

        return cls(
            filter_class=TriggerMessageTypeFilterClass.from_string(
                class_token
            ),
            message_type_number=parsed_number,
        )

    def to_scpi(self) -> str:
        return f"{self.filter_class.value}:{self.message_type_number}"


class VBusState(enum.Enum):
    """
    Represents the VBus state of the device.
    """
    DISABLED = "DISABLED"
    ENABLED = "ENABLED"
    OVP = "OVP"
    OCP = "OCP"
    UNKNOWN = "UNKNOWN"

    @classmethod
    def from_string(cls, state_str: str) -> 'VBusState':
        """
        Convert a string to a VBusState enum.

        Args:
            state_str (str): The string representation of the VBus state.

        Returns:
            VBusState: The corresponding VBusState enum.
        """
        try:
            return cls(state_str.upper())
        except KeyError as exc:
            raise ValueError(f"Unknown VBus state: {state_str}") from exc


class SinkState(enum.Enum):
    """
    Represents the Sink state of the device.
    """

    DISCONNECTED = "DISCONNECTED"
    PE_SNK_STARTUP = "PE_SNK_STARTUP"
    PE_SNK_DISCOVERY = "PE_SNK_DISCOVERY"
    PE_SNK_WAIT_FOR_CAPABILITIES = "PE_SNK_WAIT_FOR_CAPABILITIES"
    PE_SNK_EVALUATE_CAPABILITY = "PE_SNK_EVALUATE_CAPABILITY"
    PE_SNK_SELECT_CAPABILITY = "PE_SNK_SELECT_CAPABILITY"
    PE_SNK_TRANSITION_SINK = "PE_SNK_TRANSITION_SINK"
    PE_SNK_READY = "PE_SNK_READY"
    PE_SNK_SEND_EPR_MODE_ENTRY = "PE_SNK_SEND_EPR_MODE_ENTRY"
    PE_SNK_EPR_MODE_WAIT_FOR_RESPONSE = "PE_SNK_EPR_MODE_WAIT_FOR_RESPONSE"
    PE_SNK_SEND_EPR_MODE_EXIT = "PE_SNK_SEND_EPR_MODE_EXIT"
    PE_SNK_GIVE_SINK_CAP = "PE_SNK_GIVE_SINK_CAP"
    PE_SNK_GET_SOURCE_CAP = "PE_SNK_GET_SOURCE_CAP"
    PE_SNK_GET_PPS_STATUS = "PE_SNK_GET_PPS_STATUS"
    PE_SNK_INQUIRY = "PE_SNK_INQUIRY"
    PE_SNK_EPR_KEEPALIVE = "PE_SNK_EPR_KEEPALIVE"
    PE_SNK_HARD_RESET = "PE_SNK_HARD_RESET"
    PE_SNK_TRANSITION_TO_DEFAULT = "PE_SNK_TRANSITION_TO_DEFAULT"
    ERROR = "ERROR"

    @classmethod
    def from_string(cls, state_str: str) -> 'SinkState':
        """
        Convert a string to a SinkState enum.

        Args:
            state_str (str): The string representation of the Sink state.

        Returns:
            SinkState: The corresponding SinkState enum.
        """
        try:
            return cls(state_str.upper())
        except KeyError as exc:
            raise ValueError(f"Unknown Sink state: {state_str}") from exc


class SinkRequestOutcome(enum.Enum):
    """
    Represents a SINK:REQUEST:STATUS? outcome token.
    """

    NONE = "NONE"
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    WAIT = "WAIT"
    NOT_SUPPORTED = "NOT_SUPPORTED"
    TIMEOUT = "TIMEOUT"

    @classmethod
    def from_string(cls, outcome_str: str) -> 'SinkRequestOutcome':
        try:
            return cls(outcome_str.upper())
        except KeyError as exc:
            raise ValueError(
                f"Unknown sink request outcome: {outcome_str}") from exc


@dataclass(frozen=True)
class SinkRequestStatus:
    """
    Represents the most recent SINK:PDO request outcome.
    """

    outcome: SinkRequestOutcome
    index: int | None
    voltage_mv: int | None
    current_ma: int | None


class SinkInquiryType(enum.Enum):
    """Supported Sink-to-Source inquiry message types."""

    GET_SOURCE_CAP = "GET_SOURCE_CAP"
    GET_SOURCE_CAP_EXTENDED = "GET_SOURCE_CAP_EXTENDED"
    GET_STATUS = "GET_STATUS"
    GET_REVISION = "GET_REVISION"
    GET_SOURCE_INFO = "GET_SOURCE_INFO"
    GET_PPS_STATUS = "GET_PPS_STATUS"
    GET_MANUFACTURER_INFO = "GET_MANUFACTURER_INFO"
    GET_COUNTRY_CODES = "GET_COUNTRY_CODES"
    GET_COUNTRY_INFO = "GET_COUNTRY_INFO"
    GET_BATTERY_CAP = "GET_BATTERY_CAP"
    GET_BATTERY_STATUS = "GET_BATTERY_STATUS"
    DISCOVER_IDENTITY = "DISCOVER_IDENTITY"
    DISCOVER_SVIDS = "DISCOVER_SVIDS"
    DISCOVER_MODES = "DISCOVER_MODES"


class ManufacturerInfoTarget(enum.Enum):
    """Semantic Manufacturer_Info target."""

    PORT = "PORT"
    BATTERY = "BATTERY"


class BatteryReferenceKind(enum.Enum):
    """Meaning of a USB-PD battery reference."""

    FIXED = "FIXED"
    HOT_SWAPPABLE = "HOT_SWAPPABLE"


def _validate_battery_reference(reference: int) -> None:
    if isinstance(reference, bool) or not isinstance(reference, int):
        raise ValueError("battery_reference must be an integer from 0 to 7")
    if not 0 <= reference <= 7:
        raise ValueError("battery_reference must be an integer from 0 to 7")


def battery_reference_kind(reference: int) -> BatteryReferenceKind:
    """Map references 0..3 to fixed and 4..7 to hot-swappable."""
    _validate_battery_reference(reference)
    return (
        BatteryReferenceKind.FIXED
        if reference < 4
        else BatteryReferenceKind.HOT_SWAPPABLE
    )


@dataclass(frozen=True)
class GetSourceCapabilitiesInquiryRequest:
    """Request current SPR Source Capabilities."""

    type: SinkInquiryType = field(
        default=SinkInquiryType.GET_SOURCE_CAP, init=False
    )


@dataclass(frozen=True)
class GetExtendedSourceCapabilitiesInquiryRequest:
    """Request the PD 3.x Source Capabilities Extended data block."""

    type: SinkInquiryType = field(
        default=SinkInquiryType.GET_SOURCE_CAP_EXTENDED, init=False
    )


@dataclass(frozen=True)
class GetStatusInquiryRequest:
    """Request the PD 3.x Source Status data block."""

    type: SinkInquiryType = field(
        default=SinkInquiryType.GET_STATUS, init=False
    )


@dataclass(frozen=True)
class GetRevisionInquiryRequest:
    """Semantic request for the Source's USB-PD Revision data message."""

    type: SinkInquiryType = field(
        default=SinkInquiryType.GET_REVISION,
        init=False,
    )


@dataclass(frozen=True)
class GetSourceInfoInquiryRequest:
    """Request the PD 3.x Source Info data object."""

    type: SinkInquiryType = field(
        default=SinkInquiryType.GET_SOURCE_INFO, init=False
    )


@dataclass(frozen=True)
class GetPPSStatusInquiryRequest:
    """Request PPS Status; firmware validates active SPR PPS applicability."""

    type: SinkInquiryType = field(
        default=SinkInquiryType.GET_PPS_STATUS, init=False
    )


@dataclass(frozen=True)
class GetManufacturerInfoInquiryRequest:
    """Request Port or Battery manufacturer information."""

    target: ManufacturerInfoTarget = ManufacturerInfoTarget.PORT
    battery_reference: int | None = None
    type: SinkInquiryType = field(
        default=SinkInquiryType.GET_MANUFACTURER_INFO, init=False
    )

    def __post_init__(self) -> None:
        if self.target == ManufacturerInfoTarget.PORT:
            if self.battery_reference is not None:
                raise ValueError(
                    "battery_reference must be omitted for PORT target"
                )
            return
        if self.battery_reference is None or not 0 <= self.battery_reference <= 7:
            raise ValueError(
                "BATTERY target requires battery_reference between 0 and 7"
            )


@dataclass(frozen=True)
class GetCountryCodesInquiryRequest:
    """Request supported ISO 3166 alpha-2 country codes."""

    type: SinkInquiryType = field(
        default=SinkInquiryType.GET_COUNTRY_CODES, init=False
    )


@dataclass(frozen=True)
class GetCountryInfoInquiryRequest:
    """Request information for one ISO 3166 alpha-2 country code."""

    country_code: str
    type: SinkInquiryType = field(
        default=SinkInquiryType.GET_COUNTRY_INFO, init=False
    )

    def __post_init__(self) -> None:
        normalized = self.country_code.upper()
        if (
            len(normalized) != 2
            or not normalized.isascii()
            or not normalized.isalpha()
        ):
            raise ValueError(
                "country_code must contain exactly two ASCII letters"
            )
        object.__setattr__(self, "country_code", normalized)


@dataclass(frozen=True)
class GetBatteryCapabilitiesInquiryRequest:
    """Request capabilities for fixed ref 0..3 or hot-swappable ref 4..7."""

    battery_reference: int
    type: SinkInquiryType = field(
        default=SinkInquiryType.GET_BATTERY_CAP, init=False
    )

    def __post_init__(self) -> None:
        _validate_battery_reference(self.battery_reference)

    @property
    def reference_kind(self) -> BatteryReferenceKind:
        return battery_reference_kind(self.battery_reference)

    @property
    def slot_index(self) -> int:
        return self.battery_reference if self.battery_reference < 4 else (
            self.battery_reference - 4
        )


@dataclass(frozen=True)
class GetBatteryStatusInquiryRequest:
    """Request live status for fixed ref 0..3 or hot-swappable ref 4..7."""

    battery_reference: int
    type: SinkInquiryType = field(
        default=SinkInquiryType.GET_BATTERY_STATUS, init=False
    )

    def __post_init__(self) -> None:
        _validate_battery_reference(self.battery_reference)

    @property
    def reference_kind(self) -> BatteryReferenceKind:
        return battery_reference_kind(self.battery_reference)

    @property
    def slot_index(self) -> int:
        return self.battery_reference if self.battery_reference < 4 else (
            self.battery_reference - 4
        )


@dataclass(frozen=True)
class DiscoverIdentityInquiryRequest:
    """Diagnostic Identity request from current UFP/Sink to SOP partner."""

    type: SinkInquiryType = field(
        default=SinkInquiryType.DISCOVER_IDENTITY, init=False
    )


@dataclass(frozen=True)
class DiscoverSVIDsInquiryRequest:
    """Optional UFP-initiated SVID discovery of the SOP Port Partner."""

    type: SinkInquiryType = field(
        default=SinkInquiryType.DISCOVER_SVIDS, init=False
    )


@dataclass(frozen=True)
class DiscoverModesInquiryRequest:
    """Optional UFP-initiated Modes discovery for one partner SVID."""

    svid: int
    type: SinkInquiryType = field(
        default=SinkInquiryType.DISCOVER_MODES, init=False
    )

    def __post_init__(self) -> None:
        if isinstance(self.svid, bool) or not isinstance(self.svid, int):
            raise ValueError("svid must be an integer from 1 to 65535")
        if not 1 <= self.svid <= 0xFFFF:
            raise ValueError("svid must be an integer from 1 to 65535")


# New categories extend this discriminated union with bounded semantic
# parameter dataclasses. Callers never construct PD headers directly.
SinkInquiryRequest: TypeAlias = Union[
    GetSourceCapabilitiesInquiryRequest,
    GetExtendedSourceCapabilitiesInquiryRequest,
    GetStatusInquiryRequest,
    GetRevisionInquiryRequest,
    GetSourceInfoInquiryRequest,
    GetPPSStatusInquiryRequest,
    GetManufacturerInfoInquiryRequest,
    GetCountryCodesInquiryRequest,
    GetCountryInfoInquiryRequest,
    GetBatteryCapabilitiesInquiryRequest,
    GetBatteryStatusInquiryRequest,
    DiscoverIdentityInquiryRequest,
    DiscoverSVIDsInquiryRequest,
    DiscoverModesInquiryRequest,
]


class SinkInquiryOutcome(enum.Enum):
    """Represents a SINK:INQuiry:STATus? outcome token."""

    NONE = "NONE"
    PENDING = "PENDING"
    RESPONSE = "RESPONSE"
    NOT_SUPPORTED = "NOT_SUPPORTED"
    REJECTED = "REJECTED"
    WAIT = "WAIT"
    GOODCRC_TIMEOUT = "GOODCRC_TIMEOUT"
    RESPONSE_TIMEOUT = "RESPONSE_TIMEOUT"
    PROTOCOL_ERROR = "PROTOCOL_ERROR"
    MALFORMED_RESPONSE = "MALFORMED_RESPONSE"
    RESPONSE_TOO_LARGE = "RESPONSE_TOO_LARGE"
    ABORTED = "ABORTED"
    NAK = "NAK"
    BUSY = "BUSY"

    @classmethod
    def from_string(cls, outcome_str: str) -> "SinkInquiryOutcome":
        try:
            return cls(outcome_str.upper())
        except ValueError as exc:
            raise ValueError(
                f"Unknown sink inquiry outcome: {outcome_str}"
            ) from exc


@dataclass(frozen=True)
class SinkInquiryStatus:
    """Most recent Sink-to-Source inquiry status."""

    outcome: SinkInquiryOutcome
    request_id: int
    type: SinkInquiryType
    response_class: int
    response_type: int
    response_length: int


@dataclass(frozen=True)
class SourceCapabilitiesInquiryData:
    """Decoded Source_Capabilities logical body."""

    pdos: tuple[SourcePDO, ...]


@dataclass(frozen=True)
class ExtendedSourceCapabilitiesInquiryData:
    """Decoded Source Capabilities Extended data block."""

    payload_length: int
    vendor_id: int
    product_id: int
    xid: int
    firmware_version: int
    hardware_version: int
    voltage_regulation: int
    holdup_time_ms: int
    compliance: int
    touch_current: int
    peak_current: tuple[int, int, int]
    touch_temperature: int
    source_inputs: int
    hot_swappable_battery_slots: int
    fixed_batteries: int
    spr_source_pdp_w: int
    epr_source_pdp_w: int | None
    has_epr_source_pdp: bool


@dataclass(frozen=True)
class SourceStatusInquiryData:
    """Decoded SOP Status data block."""

    payload_length: int
    internal_temperature: int
    present_input: int
    present_battery_input: int
    event_flags: int
    temperature_status: int
    power_status: int
    power_state: int | None
    has_power_state_change: bool
    over_current_event: bool
    over_temperature_event: bool
    over_voltage_event: bool
    operating_in_current_limit: bool


@dataclass(frozen=True)
class RevisionInquiryData:
    """Decoded Revision Message data object."""

    revision_major: int
    revision_minor: int
    version_major: int
    version_minor: int


@dataclass(frozen=True)
class SourceInfoInquiryData:
    """Decoded Source Info data object; PDP values are watts."""

    port_type: int
    port_maximum_pdp_w: int
    port_present_pdp_w: int
    port_reported_pdp_w: int


@dataclass(frozen=True)
class PPSStatusInquiryData:
    """Decoded four-byte PPS Status data block."""

    output_voltage_mv: int | None
    output_current_ma: int | None
    present_temperature_flag: int
    operating_in_current_limit: bool
    real_time_flags: int


@dataclass(frozen=True)
class ManufacturerInfoInquiryData:
    """Decoded Manufacturer Info data block."""

    vendor_id: int
    product_id: int
    manufacturer_string: str
    manufacturer_string_bytes: bytes


@dataclass(frozen=True)
class CountryCodesInquiryData:
    """Decoded Country Codes data block."""

    country_codes: tuple[str, ...]


@dataclass(frozen=True)
class CountryInfoInquiryData:
    """Decoded Country Info data block correlated to its request."""

    country_code: str
    country_specific_data: bytes


class BatteryCapacityMeaning(enum.Enum):
    """Meaning of a 0.1 Wh Battery_Capabilities capacity field."""

    VALUE = "VALUE"
    BATTERY_NOT_PRESENT = "BATTERY_NOT_PRESENT"
    UNKNOWN = "UNKNOWN"


@dataclass(frozen=True)
class BatteryCapacity:
    """Exact Battery_Capabilities capacity value and sentinel meaning."""

    raw_tenths_wh: int
    meaning: BatteryCapacityMeaning

    @property
    def watt_hours(self) -> Decimal | None:
        if self.meaning != BatteryCapacityMeaning.VALUE:
            return None
        return Decimal(self.raw_tenths_wh) / Decimal(10)


@dataclass(frozen=True)
class BatteryCapabilitiesInquiryData:
    """Decoded nine-byte Battery Capabilities data block."""

    vendor_id: int
    product_id: int
    design_capacity: BatteryCapacity
    last_full_charge_capacity: BatteryCapacity
    battery_type_raw: int
    invalid_battery_reference: bool
    battery_present: bool


class BatteryChargingState(enum.Enum):
    """Battery_Status charging-state field."""

    CHARGING = 0
    DISCHARGING = 1
    IDLE = 2
    RESERVED = 3


@dataclass(frozen=True)
class BatteryStatusInquiryData:
    """Decoded Battery Status Data Object."""

    present_capacity_raw_tenths_wh: int
    present_capacity_meaning: BatteryCapacityMeaning
    present_capacity_wh: Decimal | None
    invalid_battery_reference: bool
    battery_present: bool
    charging_state: BatteryChargingState


@dataclass(frozen=True)
class StructuredVDMHeaderData:
    """Validated Structured VDM ACK header."""

    raw: int
    svid: int
    version_major: int
    version_minor: int
    command: int


@dataclass(frozen=True)
class StructuredVDMNegativeResponseData:
    """Validated raw NAK or BUSY Structured VDM header."""

    header: StructuredVDMHeaderData
    outcome: SinkInquiryOutcome


@dataclass(frozen=True)
class DiscoverIdentityInquiryData:
    """Ordered raw Identity VDOs following the ACK header."""

    header: StructuredVDMHeaderData
    identity_vdos: tuple[int, ...]


@dataclass(frozen=True)
class DiscoverSVIDsInquiryData:
    """Ordered raw SVID VDOs plus stable first-occurrence deduplication."""

    header: StructuredVDMHeaderData
    svid_vdos: tuple[int, ...]
    svids: tuple[int, ...]
    complete: bool


@dataclass(frozen=True)
class DiscoverModesInquiryData:
    """Ordered raw Mode VDOs correlated to selected SVID."""

    header: StructuredVDMHeaderData
    svid: int
    mode_vdos: tuple[int, ...]


SinkInquiryDecodedData: TypeAlias = Union[
    SourceCapabilitiesInquiryData,
    ExtendedSourceCapabilitiesInquiryData,
    SourceStatusInquiryData,
    RevisionInquiryData,
    SourceInfoInquiryData,
    PPSStatusInquiryData,
    ManufacturerInfoInquiryData,
    CountryCodesInquiryData,
    CountryInfoInquiryData,
    BatteryCapabilitiesInquiryData,
    BatteryStatusInquiryData,
    DiscoverIdentityInquiryData,
    DiscoverSVIDsInquiryData,
    DiscoverModesInquiryData,
    StructuredVDMNegativeResponseData,
]


@dataclass(frozen=True)
class SinkInquiryResult:
    """Correlated terminal inquiry result retained by the host runner."""

    request: SinkInquiryRequest
    status: SinkInquiryStatus
    raw_response: bytes | None
    decoded: SinkInquiryDecodedData | None = None


class CountryInquiryFailureAction(enum.Enum):
    """Guided country-workflow handling for a terminal non-response."""

    RETRY = "RETRY"
    CONTINUE = "CONTINUE"
    STOP = "STOP"


@dataclass(frozen=True)
class CountryInquiryWorkflowResult:
    """Host-retained result of a guided country-information workflow."""

    country_codes_result: SinkInquiryResult
    country_info_results: tuple[SinkInquiryResult, ...]
    stopped_early: bool


class BatteryInquiryFailureAction(enum.Enum):
    """Guided battery-survey handling for a terminal non-response."""

    RETRY = "RETRY"
    CONTINUE = "CONTINUE"
    STOP = "STOP"


@dataclass(frozen=True)
class BatterySurveyResult:
    """Serialized Battery Capabilities/Status survey results."""

    battery_references: tuple[int, ...]
    inquiry_results: tuple[SinkInquiryResult, ...]
    used_extended_source_counts: bool
    stopped_early: bool


class VDMDiscoveryFailureAction(enum.Enum):
    """Guided VDM discovery handling for NAK/BUSY/other non-ACK results."""

    RETRY = "RETRY"
    CONTINUE = "CONTINUE"
    STOP = "STOP"


@dataclass(frozen=True)
class VDMDiscoveryWorkflowResult:
    """Serialized Identity, SVID, and Modes discovery history."""

    identity_results: tuple[SinkInquiryResult, ...]
    svid_results: tuple[SinkInquiryResult, ...]
    mode_results: tuple[SinkInquiryResult, ...]
    selected_svids: tuple[int, ...]
    stopped_early: bool


class DiagnosticCCRole(enum.Enum):
    """
    Represents TEST:CCROLE role values.
    """

    SOURCE_DEFAULT = "SOURCE_DEFAULT"
    SOURCE_1_5A = "SOURCE_1_5A"
    SOURCE_3_0A = "SOURCE_3_0A"
    SINK = "SINK"
    EMARKER = "EMARKER"
    VCONN = "VCONN"
    OFF = "OFF"

    @classmethod
    def from_string(cls, role_str: str) -> 'DiagnosticCCRole':
        try:
            return cls(role_str.upper())
        except KeyError as exc:
            raise ValueError(f"Unknown test CC role: {role_str}") from exc


class DiagnosticCCChannel(enum.Enum):
    """
    Represents TEST:CCBUS channel selections.
    """

    CC1 = "CC1"
    CC2 = "CC2"

    @classmethod
    def from_string(cls, channel_str: str) -> 'DiagnosticCCChannel':
        try:
            return cls(channel_str.upper())
        except KeyError as exc:
            raise ValueError(
                f"Unknown test CC channel: {channel_str}") from exc
