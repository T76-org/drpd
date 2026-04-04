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
    SOURCE = "SOURCE"
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
    PE_SNK_EVALUATE_CAPABILITIY = "PE_SNK_EVALUATE_CAPABILITIY"
    PE_SNK_SELECT_CAPABILITY = "PE_SNK_SELECT_CAPABILITY"
    PE_SNK_TRANSITION_SINK = "PE_SNK_TRANSITION_SINK"
    PE_SNK_READY = "PE_SNK_READY"
    PE_SNK_GIVE_SINK_CAP = "PE_SNK_GIVE_SINK_CAP"
    PE_SNK_GET_SOURCE_CAP = "PE_SNK_GET_SOURCE_CAP"
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
