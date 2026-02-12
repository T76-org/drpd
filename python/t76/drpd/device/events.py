"""
Copyright (c) 2025 MTA, Inc.

Events raised by the DRPD device.
"""

from typing import TYPE_CHECKING, List
from t76.drpd.device.device_sink import SinkInfo
from t76.drpd.device.device_sink_pdos import DeviceSinkPDO
from t76.drpd.device.device_trigger import TriggerInfo
from t76.drpd.device.device_vbus import VBusInfo
from t76.drpd.device.types import AnalogMonitorChannels, CCBusState, Mode, OnOffStatus
from t76.drpd.message.bmc_sequence import BMCSequence

if TYPE_CHECKING:
    from t76.drpd.device.device import Device


class DeviceEvent:
    def __init__(self, device: "Device"):
        self.device = device


class InterruptReceived(DeviceEvent):
    pass


class DeviceConnected(DeviceEvent):
    pass


class DeviceDisconnected(DeviceEvent):
    pass


class TriggerStatusChanged(DeviceEvent):
    def __init__(self, device: "Device", new_status: TriggerInfo):
        super().__init__(device)
        self.new_status = new_status


class CCBusStateChanged(DeviceEvent):
    def __init__(self, device: "Device", new_state: CCBusState):
        super().__init__(device)
        self.new_state = new_state


class RoleChanged(DeviceEvent):
    def __init__(self, device: "Device", new_role: Mode):
        super().__init__(device)
        self.new_role = new_role


class VBusManagerStateChanged(DeviceEvent):
    def __init__(self, device: "Device", new_info: VBusInfo):
        super().__init__(device)
        self.new_info = new_info


class CaptureStatusChanged(DeviceEvent):
    def __init__(self, device: "Device", is_capturing: OnOffStatus):
        super().__init__(device)
        self.is_capturing = is_capturing


class SinkPDOListChanged(DeviceEvent):
    def __init__(self, device: "Device", new_pdos: List[DeviceSinkPDO]):
        super().__init__(device)
        self.new_pdos = new_pdos


class SinkInfoChanged(DeviceEvent):
    def __init__(self, device: "Device", new_info: SinkInfo):
        super().__init__(device)
        self.new_info = new_info


class BMCSequenceCaptured(DeviceEvent):
    def __init__(self, device: "Device", message: BMCSequence):
        super().__init__(device)
        self.message = message


class AnalogMonitorStatusChanged(DeviceEvent):
    def __init__(self, device: "Device", status: AnalogMonitorChannels):
        super().__init__(device)
        self.status = status
