"""
Tests for STAT:DEV? interrupt status dispatch.
"""

import unittest
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock

from usb.core import Device as USBDevice

from t76.drpd.device.device import Device
from t76.drpd.device.device_sink import SinkInfo
from t76.drpd.device.device_vbus import VBusInfo
from t76.drpd.device.events import (
    CCBusStateChanged,
    CaptureStatusChanged,
    RoleChanged,
    SinkInfoChanged,
    SinkPDOListChanged,
    TriggerStatusChanged,
    VBusManagerStateChanged,
)
from t76.drpd.device.types import (
    CCBusState,
    DeviceStatusFlags,
    Mode,
    OnOffStatus,
    SinkState,
    TriggerSenderFilter,
    TriggerStatus,
    TriggerSyncMode,
    TriggerType,
    VBusState,
)
from t76.drpd.device.device_trigger import TriggerInfo


def make_device() -> Device:
    usb_device = SimpleNamespace(
        product="Test Device",
        serial_number="ABC123",
        idVendor=0x2E8A,
        idProduct=0x000A,
    )
    device = Device(cast(USBDevice, usb_device))
    device._internal.instrument = object()  # type: ignore[attr-defined]
    return device


class TestDeviceInterruptStatus(unittest.IsolatedAsyncioTestCase):
    """Verify status-register bits dispatch high-level events."""

    async def test_status_bits_dispatch_expected_events(self) -> None:
        device = make_device()
        device._internal.query_ascii_values_and_check = AsyncMock(  # type: ignore[attr-defined]
            return_value=[str(
                DeviceStatusFlags.VBUS_STATUS_CHANGED.value
                | DeviceStatusFlags.ROLE_CHANGED.value
                | DeviceStatusFlags.CAPTURE_STATUS_CHANGED.value
                | DeviceStatusFlags.CC_BUS_STATUS_CHANGED.value
                | DeviceStatusFlags.TRIGGER_STATUS_CHANGED.value
                | DeviceStatusFlags.SINK_PDO_LIST_CHANGED.value
                | DeviceStatusFlags.SINK_STATUS_CHANGED.value
            )]
        )
        device.vbus.get_info = AsyncMock(return_value=VBusInfo(
            state=VBusState.ENABLED,
            ovp_threshold=21.0,
            ocp_threshold=3.0,
            ovp_event_timestamp_us=None,
            ocp_event_timestamp_us=None,
        ))
        device.mode.get = AsyncMock(return_value=Mode.SINK)
        device.capture.get_status = AsyncMock(return_value=OnOffStatus.ON)
        device.mode.get_status = AsyncMock(return_value=CCBusState.ATTACHED)
        device.trigger.get_trigger_info = AsyncMock(return_value=TriggerInfo(
            status=TriggerStatus.IDLE,
            type=TriggerType.OFF,
            event_threshold=1,
            sender_filter=TriggerSenderFilter.ANY,
            autorepeat=OnOffStatus.OFF,
            event_count=0,
            sync_mode=TriggerSyncMode.PULSE_HIGH,
            sync_pulse_length=10,
            message_type_filters=[],
        ))
        device.sink.get_pdo_count = AsyncMock(return_value=0)
        device.sink.get_sink_info = AsyncMock(return_value=SinkInfo(
            status=SinkState.DISCONNECTED,
            negotiated_pdo=None,
            negotiated_voltage=0,
            negotiated_current=0,
            error_status=False,
        ))

        observed = []

        async def observer(event) -> None:
            observed.append(type(event))

        device.register_event_observer(observer)

        await device._process_interrupt()  # type: ignore[attr-defined]

        self.assertIn(VBusManagerStateChanged, observed)
        self.assertIn(RoleChanged, observed)
        self.assertIn(CaptureStatusChanged, observed)
        self.assertIn(CCBusStateChanged, observed)
        self.assertIn(TriggerStatusChanged, observed)
        self.assertIn(SinkPDOListChanged, observed)
        self.assertIn(SinkInfoChanged, observed)

    async def test_message_received_bit_fetches_extant_captures(self) -> None:
        device = make_device()
        device._internal.query_ascii_values_and_check = AsyncMock(  # type: ignore[attr-defined]
            return_value=[str(DeviceStatusFlags.MESSAGE_RECEIVED.value)]
        )
        device.capture.fetch_extant_captures = AsyncMock()

        await device._process_interrupt()  # type: ignore[attr-defined]

        device.capture.fetch_extant_captures.assert_awaited_once()
