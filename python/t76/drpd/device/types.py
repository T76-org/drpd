"""
Copyright (c) 2025 MTA, Inc.

Types and Enums for DRPD device communication.
"""

import enum

from dataclasses import dataclass


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
    PE_SNK_SEND_RESPONSE = "PE_SNK_SEND_RESPONSE"
    PE_SNK_READY = "PE_SNK_READY"
    PE_SNK_SEND_EPR_MODE_ENTRY = "PE_SNK_SEND_EPR_MODE_ENTRY"
    PE_SNK_EPR_MODE_WAIT_FOR_RESPONSE = "PE_SNK_EPR_MODE_WAIT_FOR_RESPONSE"
    PE_SNK_SEND_EPR_MODE_EXIT = "PE_SNK_SEND_EPR_MODE_EXIT"
    PE_SNK_GIVE_SINK_CAP = "PE_SNK_GIVE_SINK_CAP"
    PE_SNK_GET_SOURCE_CAP = "PE_SNK_GET_SOURCE_CAP"
    PE_SNK_GET_PPS_STATUS = "PE_SNK_GET_PPS_STATUS"
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
