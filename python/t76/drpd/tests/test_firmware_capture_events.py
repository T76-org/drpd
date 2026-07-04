"""
Tests for firmware-originated capture events.
"""

import asyncio
import unittest
from types import SimpleNamespace
from typing import cast

from usb.core import Device as USBDevice

from t76.drpd.device.device import Device
from t76.drpd.device.events import FirmwareEventCaptured
from t76.drpd.message.bmc_sequence import (
    FIRMWARE_EVENT_DECODE_RESULT,
    FIRMWARE_EVENT_SYNC_TRIGGER,
    FirmwareCaptureEvent,
    BMCSequence,
)


def build_firmware_event_payload(
    event_type: int = 1,
    event_text_value: str = "VBUS OVP event",
) -> list[int]:
    event_text = event_text_value.encode("utf-8")
    data = bytearray(8 + 8 + 4 + 4 + 4 + 4 + 4 + len(event_text))
    data[0:8] = (123456).to_bytes(8, "little")
    data[8:16] = (123456).to_bytes(8, "little")
    data[16:20] = FIRMWARE_EVENT_DECODE_RESULT.to_bytes(4, "little")
    data[24:28] = (0).to_bytes(4, "little")
    data[28:32] = (4 + len(event_text)).to_bytes(4, "little")
    data[32:36] = event_type.to_bytes(4, "little")
    data[36:] = event_text
    return list(data)


class TestFirmwareCaptureEvents(unittest.IsolatedAsyncioTestCase):
    """Verify firmware capture records are surfaced as events."""

    def test_bmc_sequence_parser_returns_firmware_event(self) -> None:
        record = BMCSequence.from_scpi_response(
            build_firmware_event_payload(),
            1e-9,
        )

        self.assertIsInstance(record, FirmwareCaptureEvent)
        assert isinstance(record, FirmwareCaptureEvent)
        self.assertEqual(record.timestamp, 123456)
        self.assertEqual(record.event_type, 1)
        self.assertEqual(record.event_text, "VBUS OVP event")

    def test_bmc_sequence_parser_returns_sync_trigger_event(self) -> None:
        record = BMCSequence.from_scpi_response(
            build_firmware_event_payload(
                FIRMWARE_EVENT_SYNC_TRIGGER,
                "Sync trigger",
            ),
            1e-9,
        )

        self.assertIsInstance(record, FirmwareCaptureEvent)
        assert isinstance(record, FirmwareCaptureEvent)
        self.assertEqual(record.event_type, FIRMWARE_EVENT_SYNC_TRIGGER)
        self.assertEqual(record.event_text, "Sync trigger")

    async def test_device_dispatches_firmware_event_capture(self) -> None:
        usb_device = SimpleNamespace(
            product="Test Device",
            serial_number="ABC123",
            idVendor=0x2E8A,
            idProduct=0x000A,
        )
        device = Device(cast(USBDevice, usb_device))
        observed: list[FirmwareEventCaptured] = []

        async def observer(event) -> None:
            if isinstance(event, FirmwareEventCaptured):
                observed.append(event)

        device.register_event_observer(observer)
        record = FirmwareCaptureEvent(
            timestamp=123456,
            event_type=1,
            event_text="VBUS OVP event",
            event_text_bytes=b"VBUS OVP event",
        )

        device._capture_fetched_callback(record)  # type: ignore[attr-defined]
        await asyncio.sleep(0)

        self.assertEqual(len(observed), 1)
        self.assertEqual(observed[0].event.event_type, 1)
