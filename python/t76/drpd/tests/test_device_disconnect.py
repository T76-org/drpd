"""
Unit tests for Device.disconnect() robustness.
"""

import asyncio
import threading
import unittest
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock, PropertyMock, patch

from usb.core import Device as USBDevice

from t76.drpd.device.device import Device
from t76.drpd.device.device_internal import DeviceInternal


class TestDeviceDisconnect(unittest.IsolatedAsyncioTestCase):
    """Tests that disconnect cleanup always runs."""

    async def test_disconnect_closes_internal_even_if_observer_fails(
            self) -> None:
        usb_device = SimpleNamespace(
            product="Test Device",
            serial_number="ABC123",
            idVendor=0x2E8A,
            idProduct=0x000A,
        )
        device = Device(cast(USBDevice, usb_device))
        device._internal.disconnect = AsyncMock()  # type: ignore[attr-defined]

        async def failing_observer(_event) -> None:
            raise RuntimeError("panel teardown failure")

        device.register_event_observer(failing_observer)

        await device.disconnect()

        device._internal.disconnect.assert_awaited_once()  # type: ignore[attr-defined]

    async def test_interrupt_handler_returns_immediately_while_disconnecting(
            self) -> None:
        usb_device = SimpleNamespace(
            product="Test Device",
            serial_number="ABC123",
            idVendor=0x2E8A,
            idProduct=0x000A,
        )
        device = Device(cast(USBDevice, usb_device))
        device._disconnecting = True  # type: ignore[attr-defined]

        with patch.object(device, "_process_interrupt",
                          new=AsyncMock()) as process_interrupt:
            device._interrupt_handler(None, None, None)  # type: ignore[arg-type]

        process_interrupt.assert_not_called()

    async def test_interrupt_handler_swallows_interrupt_processing_errors(
            self) -> None:
        usb_device = SimpleNamespace(
            product="Test Device",
            serial_number="ABC123",
            idVendor=0x2E8A,
            idProduct=0x000A,
        )
        device = Device(cast(USBDevice, usb_device))

        with patch.object(
            type(device._internal),
            "connected",
            new_callable=PropertyMock,
            return_value=True,
        ):
            with patch.object(
                device,
                "_process_interrupt",
                new=AsyncMock(side_effect=RuntimeError("transport error")),
            ) as process_interrupt:
                # Should not raise, even though _process_interrupt fails.
                device._interrupt_handler(None, None, None)  # type: ignore[arg-type]
                await asyncio.sleep(0)

        process_interrupt.assert_awaited()

    async def test_internal_disconnect_waits_for_active_command_lock(
            self) -> None:
        usb_device = SimpleNamespace(
            product="Test Device",
            serial_number="ABC123",
            idVendor=0x2E8A,
            idProduct=0x000A,
        )
        internal = DeviceInternal(cast(USBDevice, usb_device), lambda *_: None)
        cast(Any, internal).instrument = SimpleNamespace(
            disable_event=lambda *_: None,
            uninstall_handler=lambda *_: None,
            close=lambda: None,
        )
        cast(Any, internal)._resource_manager = SimpleNamespace(
            close=lambda: None)
        cast(Any, internal)._wrapped_interrupt_handler = object()
        disconnect_errors = []

        internal._lock.acquire()
        try:
            def run_disconnect() -> None:
                try:
                    asyncio.run(internal.disconnect())
                except Exception as exc:
                    disconnect_errors.append(exc)

            disconnect_thread = threading.Thread(target=run_disconnect)
            disconnect_thread.start()
            await asyncio.sleep(0.1)
            self.assertTrue(disconnect_thread.is_alive())
        finally:
            internal._lock.release()

        disconnect_thread.join(timeout=1.0)
        self.assertFalse(disconnect_thread.is_alive())
        self.assertEqual([], disconnect_errors)
        self.assertIsNone(internal.instrument)
