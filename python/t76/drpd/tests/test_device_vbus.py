"""
Unit tests for DeviceVBus expanded VBUS status parsing.
"""

import unittest
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock

from usb.core import Device as USBDevice

from t76.drpd.device.device import Device
from t76.drpd.device.device_vbus import DeviceVBus, VBusInfo
from t76.drpd.device.events import VBusManagerStateChanged
from t76.drpd.device.types import VBusState


class TestDeviceVBus(unittest.IsolatedAsyncioTestCase):
    """Tests for expanded BUS:VBUS:STAT? parsing."""

    async def test_get_info_parses_event_timestamps(self) -> None:
        internal = AsyncMock()
        internal.query_ascii_values_and_check.side_effect = [
            ["OVP", "123456", "NONE"],
            [21.0],
            [3.5],
        ]

        vbus = DeviceVBus(internal)
        info = await vbus.get_info()

        self.assertEqual(info.state, VBusState.OVP)
        self.assertEqual(info.ovp_threshold, 21.0)
        self.assertEqual(info.ocp_threshold, 3.5)
        self.assertEqual(info.ovp_event_timestamp_us, 123456)
        self.assertIsNone(info.ocp_event_timestamp_us)

    async def test_get_state_uses_expanded_status_response(self) -> None:
        internal = AsyncMock()
        internal.query_ascii_values_and_check.return_value = [
            "OCP", "NONE", "987654"]

        vbus = DeviceVBus(internal)

        self.assertEqual(await vbus.get_state(), VBusState.OCP)

    async def test_device_interrupt_dispatches_enriched_vbus_event(self) -> None:
        usb_device = SimpleNamespace(
            product="Test Device",
            serial_number="ABC123",
            idVendor=0x2E8A,
            idProduct=0x000A,
        )
        device = Device(cast(USBDevice, usb_device))
        device._internal.instrument = object()  # type: ignore[attr-defined]
        device._internal.query_ascii_values_and_check = AsyncMock(
            return_value=["1"])  # type: ignore[attr-defined]
        device.vbus.get_info = AsyncMock(return_value=VBusInfo(
            state=VBusState.OVP,
            ovp_threshold=21.0,
            ocp_threshold=3.5,
            ovp_event_timestamp_us=123456,
            ocp_event_timestamp_us=None,
        ))

        observed: list[VBusManagerStateChanged] = []

        async def observer(event) -> None:
            if isinstance(event, VBusManagerStateChanged):
                observed.append(event)

        device.register_event_observer(observer)
        await device._process_interrupt()  # type: ignore[attr-defined]

        self.assertEqual(len(observed), 1)
        self.assertEqual(observed[0].new_info.ovp_event_timestamp_us, 123456)
        self.assertIsNone(observed[0].new_info.ocp_event_timestamp_us)
