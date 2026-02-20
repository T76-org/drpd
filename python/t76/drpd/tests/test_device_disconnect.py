"""
Unit tests for Device.disconnect() robustness.
"""

import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, PropertyMock, patch

from t76.drpd.device.device import Device


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
        device = Device(usb_device)
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
        device = Device(usb_device)
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
        device = Device(usb_device)

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
