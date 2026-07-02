"""
Unit tests for firmware event display in the message panel.
"""

import unittest
from types import SimpleNamespace

from textual.app import App, ComposeResult

from t76.drpd.app.main_screen.message_panel import (
    EventReceivedMessage,
    MessagePanel,
)
from t76.drpd.device.events import (
    BMCSequenceCaptured,
    CaptureStatusChanged,
    FirmwareEventCaptured,
)
from t76.drpd.device.types import OnOffStatus
from t76.drpd.message import Message
from t76.drpd.message.bmc_sequence import BMCSequence, FirmwareCaptureEvent
from t76.drpd.message.header import Header
from t76.drpd.message.sop import SOP, SOPType


class MessagePanelApp(App):
    """Minimal Textual app for mounting the message panel."""

    def compose(self) -> ComposeResult:
        yield MessagePanel(id="message-panel")


class TestMessagePanelEvents(unittest.IsolatedAsyncioTestCase):
    """Verify capture-stream firmware events are visible in the app."""

    def _build_bmc_sequence(self) -> BMCSequence:
        sop = SOP(SOPType.SOP, [0x12, 0x12, 0x12, 0x13], 4)
        header = Header(sop)
        message = Message.from_body(header, [])

        return BMCSequence(
            start_timestamp=100,
            end_timestamp=140,
            preamble_clock=3e-6,
            preamble_frequency=333_333,
            message_clock=3e-6,
            message_frequency=333_333,
            pulse_lengths=[1.0] * 100,
            decoded_bytes=[header.header_data & 0xFF, header.header_data >> 8],
            sop=sop,
            header=header,
            message=message,
            crc=0,
            expected_crc=0,
            crc_valid=True,
        )

    async def test_firmware_event_is_added_to_message_table(self) -> None:
        app = MessagePanelApp()

        async with app.run_test() as pilot:
            panel = app.query_one("#message-panel", MessagePanel)
            await panel._on_device_event(
                CaptureStatusChanged(SimpleNamespace(), OnOffStatus.ON)
            )
            event = FirmwareEventCaptured(
                SimpleNamespace(),
                FirmwareCaptureEvent(
                    timestamp=123456,
                    event_type=7,
                    event_text="CC role changed",
                    event_text_bytes=b"CC role changed",
                ),
            )

            await panel.on_event_received_message(EventReceivedMessage(event))
            await pilot.pause()

            self.assertEqual(len(panel.messages), 1)
            self.assertEqual(len(panel.table.rows), 1)
            self.assertEqual(
                panel.table.get_cell("1", "message"),
                "CC role changed",
            )
            self.assertEqual(str(panel.table.get_cell("1", "id")), "FW")
            self.assertEqual(panel.table.get_cell("1", "from"), "Firmware")
            self.assertEqual(panel.table.get_cell("1", "sop"), "Event")

    async def test_firmware_event_is_hidden_when_capture_is_off(self) -> None:
        app = MessagePanelApp()

        async with app.run_test() as pilot:
            panel = app.query_one("#message-panel", MessagePanel)
            await panel._on_device_event(
                CaptureStatusChanged(SimpleNamespace(), OnOffStatus.OFF)
            )
            event = FirmwareEventCaptured(
                SimpleNamespace(),
                FirmwareCaptureEvent(
                    timestamp=123456,
                    event_type=7,
                    event_text="CC role changed",
                    event_text_bytes=b"CC role changed",
                ),
            )

            await panel._on_device_event(event)
            await pilot.pause()

            self.assertEqual(len(panel.messages), 0)
            self.assertEqual(len(panel.table.rows), 0)

    async def test_bmc_messages_and_firmware_events_share_table(self) -> None:
        app = MessagePanelApp()

        async with app.run_test() as pilot:
            panel = app.query_one("#message-panel", MessagePanel)
            await panel._on_device_event(
                CaptureStatusChanged(SimpleNamespace(), OnOffStatus.ON)
            )
            bmc_event = BMCSequenceCaptured(
                SimpleNamespace(),
                self._build_bmc_sequence(),
            )
            firmware_event = FirmwareEventCaptured(
                SimpleNamespace(),
                FirmwareCaptureEvent(
                    timestamp=200,
                    event_type=7,
                    event_text="CC role changed",
                    event_text_bytes=b"CC role changed",
                ),
            )

            await panel.on_event_received_message(EventReceivedMessage(bmc_event))
            await panel.on_event_received_message(
                EventReceivedMessage(firmware_event)
            )
            await pilot.pause()

            self.assertEqual(len(panel.messages), 2)
            self.assertEqual(len(panel.table.rows), 2)
            self.assertIn("GoodCRC", panel.table.get_cell("1", "message"))
            self.assertEqual(
                panel.table.get_cell("2", "message"),
                "CC role changed",
            )
