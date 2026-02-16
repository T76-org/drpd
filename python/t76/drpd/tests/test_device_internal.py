"""
Unit tests for DeviceInternal transport cleanup.
"""

from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock

import pyvisa

from t76.drpd.device.device_internal import DeviceInternal


class TestDeviceInternalDisconnect(unittest.IsolatedAsyncioTestCase):
    """Tests for resource cleanup in disconnect()."""

    def setUp(self) -> None:
        usb_device = SimpleNamespace(
            product="Test Device",
            serial_number="ABC123",
            idVendor=0x2E8A,
            idProduct=0x000A,
        )
        self.device_internal = DeviceInternal(
            usb_device=usb_device,
            interrupt_handler=MagicMock(),
        )

    async def test_disconnect_closes_instrument_and_resource_manager(
            self) -> None:
        instrument = MagicMock()
        resource_manager = MagicMock()
        self.device_internal.instrument = instrument
        self.device_internal._resource_manager = resource_manager

        await self.device_internal.disconnect()

        instrument.close.assert_called_once()
        resource_manager.close.assert_called_once()
        self.assertIsNone(self.device_internal.instrument)
        self.assertIsNone(self.device_internal._resource_manager)

    async def test_disconnect_ignores_visa_close_errors(self) -> None:
        instrument = MagicMock()
        resource_manager = MagicMock()
        instrument.close.side_effect = pyvisa.errors.VisaIOError(-1)
        resource_manager.close.side_effect = pyvisa.errors.VisaIOError(-1)
        self.device_internal.instrument = instrument
        self.device_internal._resource_manager = resource_manager

        await self.device_internal.disconnect()

        self.assertIsNone(self.device_internal.instrument)
        self.assertIsNone(self.device_internal._resource_manager)

    async def test_disconnect_is_idempotent_when_already_disconnected(
            self) -> None:
        self.device_internal.instrument = None
        self.device_internal._resource_manager = None

        await self.device_internal.disconnect()

        self.assertIsNone(self.device_internal.instrument)
        self.assertIsNone(self.device_internal._resource_manager)
