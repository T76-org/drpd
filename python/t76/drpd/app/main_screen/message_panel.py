"""
Copyright (c) 2025 MTA, Inc.

This module defines the MessagePanel class for displaying USB-PD messages in a user interface.
It includes a table for listing messages and a details section for showing message content.
"""

import logging

from typing import List, Optional

from rich.text import Text
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import HorizontalGroup, VerticalGroup, VerticalScroll
from textual.message import Message
from textual.reactive import reactive
from textual.widgets import DataTable, Static

from t76.drpd.device import Device
from t76.drpd.device.events import (
    BMCSequenceCaptured,
    CaptureStatusChanged,
    DeviceConnected,
    DeviceEvent,
    FirmwareEventCaptured,
)
from t76.drpd.device.types import OnOffStatus
from t76.drpd.message.bmc_sequence import BMCSequence, FirmwareCaptureEvent


CapturedRecord = BMCSequence | FirmwareCaptureEvent


class EventReceivedMessage(Message):
    def __init__(self, event: DeviceEvent):
        super().__init__()
        self.event = event


class MessageTable(DataTable):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.cursor_type = "row"
        self.add_class("message-table")

    def on_mount(self) -> None:
        """Called when the panel is mounted."""
        self.add_column("#", width=5, key="index")
        self.add_column("Start", width=10, key="start_timestamp")
        self.add_column("End", width=10, key="end_timestamp")
        self.add_column("Δt µs", width=10, key="dt")
        self.add_column("ID", width=2, key="id")
        self.add_column("Message", width=29, key="message")
        self.add_column("From", width=10, key="from")
        self.add_column("To", width=10, key="to")
        self.add_column("SOP", width=10, key="sop")
        self.add_column("DOs", width=3, key="objects")
        self.add_column("CRC", width=3, key="crc")

    def add_sequence(self, sequence: BMCSequence, delta_t: int, key: int) -> None:
        """Add a new row to the message table."""

        if not sequence.crc_valid:
            message_id = "??"
        else:
            message_id = f"{sequence.header.message_id:02X}"

        is_first = key <= 1

        self.add_row(
            Text(str(len(self.rows) + 1), justify="right"),
            Text(str(sequence.start_timestamp)[-10:], justify="right"),
            Text(str(sequence.end_timestamp)[-10:], justify="right"),
            Text(f"{delta_t:>9}" if is_first else f"+{delta_t:>9}",
                 justify="right"),
            Text(message_id, justify="right"),
            f"{sequence.header.message_type_number:05b} {'Invalid' if not sequence.crc_valid else sequence.message.name}",
            sequence.header.from_actor.value,
            sequence.header.to_actor.value,
            sequence.sop.sop_type.value,
            Text(str(sequence.header.data_object_count), justify="right"),
            Text(f"{'✔' if sequence.crc_valid else '✗'}", justify="center"),
            key=str(key),
        )

    def add_firmware_event(
        self,
        event: FirmwareCaptureEvent,
        delta_t: int,
        key: int,
    ) -> None:
        """Add a firmware-originated capture event to the message table."""

        is_first = key <= 1

        self.add_row(
            Text(str(len(self.rows) + 1), justify="right"),
            Text(str(event.timestamp)[-10:], justify="right"),
            Text(str(event.timestamp)[-10:], justify="right"),
            Text(f"{delta_t:>9}" if is_first else f"+{delta_t:>9}",
                 justify="right"),
            Text("FW", justify="right"),
            event.event_text,
            "Firmware",
            "Host",
            "Event",
            Text("0", justify="right"),
            Text("—", justify="center"),
            key=str(key),
        )


class MessageDetails(VerticalScroll):
    message: reactive[CapturedRecord | None] = reactive(None, recompose=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.add_class("message-details")

    def compose(self) -> ComposeResult:
        if self.message is None:
            yield Static("\nNo message selected", classes="message-details-empty")
        elif isinstance(self.message, FirmwareCaptureEvent):
            yield Static('Firmware event detail', classes="message-details-header")

            yield HorizontalGroup(
                Static("Timestamp",
                       classes="message-details-property-label"),
                Static(str(self.message.timestamp),
                       classes="message-details-property-value"),
                classes="message-details-property"
            )

            yield HorizontalGroup(
                Static("Event type",
                       classes="message-details-property-label"),
                Static(f"0x{self.message.event_type:08X}",
                       classes="message-details-property-value"),
                classes="message-details-property"
            )

            yield HorizontalGroup(
                Static("Event text",
                       classes="message-details-property-label"),
                Static(self.message.event_text,
                       classes="message-details-property-value"),
                classes="message-details-property"
            )

            if self.message.event_text_bytes:
                lines = []
                for i in range(0, len(self.message.event_text_bytes), 16):
                    chunk = self.message.event_text_bytes[i:i+16]
                    lines.append(" ".join(f"{b:02X}" for b in chunk))
                formatted = "\n".join(lines)
            else:
                formatted = "(no data)"

            yield Static(
                f"Raw event text ({len(self.message.event_text_bytes):,} bytes)",
                classes="message-details-header"
            )
            yield Static(formatted, classes="message-details-property-value")
        else:
            yield Static('BMC transmission detail', classes="message-details-header")

            yield HorizontalGroup(
                Static("Start timestamp",
                       classes="message-details-property-label"),
                Static(str(self.message.start_timestamp),
                       classes="message-details-property-value"),
                classes="message-details-property"
            )

            yield HorizontalGroup(
                Static("End timestamp",
                       classes="message-details-property-label"),
                Static(str(self.message.end_timestamp),
                       classes="message-details-property-value"),
                classes="message-details-property"
            )

            yield HorizontalGroup(
                Static("Pulse count",
                       classes="message-details-property-label"),
                Static(str(len(self.message.pulse_lengths)),
                       classes="message-details-property-value"),
                classes="message-details-property"
            )

            yield HorizontalGroup(
                Static("CRC32",
                       classes="message-details-property-label"),
                Static(f"0x{self.message.crc:08X} (expected 0x{self.message.expected_crc:08X}) - {'valid' if self.message.crc_valid else 'invalid'}",
                       classes="message-details-property-value"),
                classes="message-details-property"
            )

            yield HorizontalGroup(
                Static("Preamble frequency",
                       classes="message-details-property-label"),
                Static(f"{self.message.preamble_frequency/1000:.0f} kHz ({self.message.preamble_clock*1e6:.2f} µs clock cycle)",
                       classes="message-details-property-value"),
                classes="message-details-property"
            )

            yield HorizontalGroup(
                Static("Message frequency",
                       classes="message-details-property-label"),
                Static(f"{self.message.message_frequency/1000:.0f} kHz ({self.message.message_clock*1e6:.2f} µs clock cycle)",
                       classes="message-details-property-value"),
                classes="message-details-property"
            )

            yield Static('Message header', classes="message-details-header")

            for key, value in self.message.header.to_dict().items():
                yield HorizontalGroup(
                    Static(f"{key}", classes="message-details-property-label"),
                    Static(str(value), classes="message-details-property-value"),
                    classes="message-details-property"
                )

            yield Static('Message body', classes="message-details-header")

            for prop, value in self.message.message.renderable_properties.items():
                yield HorizontalGroup(
                    Static(f"{prop}", classes="message-details-property-label"),
                    Static(value, classes="message-details-property-value"),
                    classes="message-details-property"
                )

            yield Static(f"Raw data ({len(self.message.sop.kcodes) + len(self.message.decoded_bytes):,} bytes)", classes="message-details-header")
            raw_bytes = self.message.sop.kcodes + self.message.decoded_bytes
            if raw_bytes:
                lines = []
                for i in range(0, len(raw_bytes), 16):
                    chunk = raw_bytes[i:i+16]
                    line = " ".join(f"{b:02X}" for b in chunk)
                    lines.append(line)
                formatted = "\n".join(lines)
            else:
                formatted = "(no data)"
            yield Static(formatted, classes="message-details-property-value")

            yield Static(f"Preamble ({sum(self.message.pulse_lengths[:96]):.1f}µs total length)", classes="message-details-header")
            pulse_lengths = self.message.pulse_lengths
            if pulse_lengths:
                lines = []
                for i in range(0, 96, 24):
                    chunk = pulse_lengths[i:i+24]
                    line = " ".join(f"{t:>4.1f}" for t in chunk)
                    lines.append(line)
                formatted = "\n".join(lines)
            else:
                formatted = "(no transitions)"
            yield Static(formatted, classes="message-details-property-value")

            yield Static(f"Message body ({len(self.message.pulse_lengths) - 96:,} transitions, {sum(self.message.pulse_lengths[96:]):,.1f}µs total length)", classes="message-details-header")

            # Format transitions: lines of max 10 elements, decimal, right aligned, comma separated
            pulse_lengths = self.message.pulse_lengths
            if pulse_lengths:
                lines = []
                for i in range(96, len(pulse_lengths), 10):
                    chunk = pulse_lengths[i:i+10]
                    line = " ".join(f"{t:>4.1f}" for t in chunk)
                    lines.append(line)
                formatted = "\n".join(lines)
            else:
                formatted = "(no transitions)"
            yield Static(formatted, classes="message-details-property-value")


class MessagePanel(VerticalGroup):
    BINDINGS = [
        Binding("x", "clear_table", "Clear table", show=True),
    ]

    device: reactive[Optional[Device]] = reactive(None)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._device: Optional[Device] = None

        self.table = MessageTable()
        self.message_details = MessageDetails()
        self.messages: List[CapturedRecord] = []
        self._capture_enabled = False

    async def watch_device(
        self,
        old_device: Optional[Device],
        new_device: Optional[Device],
    ) -> None:
        if old_device is not None:
            old_device.unregister_event_observer(self._on_device_event)

        if new_device is None:
            self._capture_enabled = False
            self.message_details.message = None
            self.table.clear()
            self.messages.clear()
        else:
            new_device.register_event_observer(self._on_device_event)
            await self._refresh_capture_status(new_device)

    async def _refresh_capture_status(self, device: Device) -> None:
        try:
            self._capture_enabled = (
                await device.capture.get_status()
            ) == OnOffStatus.ON
        except (AssertionError, RuntimeError, ValueError):
            self._capture_enabled = False

    async def _on_device_event(self, event: DeviceEvent) -> None:
        """Handle events from the device."""
        if isinstance(event, CaptureStatusChanged):
            self._capture_enabled = event.is_capturing == OnOffStatus.ON
        elif isinstance(event, DeviceConnected):
            await self._refresh_capture_status(event.device)
        elif isinstance(event, BMCSequenceCaptured):
            self.post_message(EventReceivedMessage(event))
        elif isinstance(event, FirmwareEventCaptured) and self._capture_enabled:
            self.post_message(EventReceivedMessage(event))

    async def on_event_received_message(self, msg: EventReceivedMessage) -> None:
        """Handle the event_received message."""

        if isinstance(msg.event, BMCSequenceCaptured):
            self.messages.append(msg.event.message)
            self.table.add_sequence(
                msg.event.message,
                self._delta_t_for_record(msg.event.message),
                len(self.messages)
            )
        elif isinstance(msg.event, FirmwareEventCaptured):
            self.messages.append(msg.event.event)
            self.table.add_firmware_event(
                msg.event.event,
                self._delta_t_for_record(msg.event.event),
                len(self.messages)
            )

    def _delta_t_for_record(self, record: CapturedRecord) -> int:
        """Return capture delta from the previous table record."""

        if len(self.messages) <= 1:
            return 0

        return self._record_start_timestamp(record) - self._record_end_timestamp(
            self.messages[-2]
        )

    @staticmethod
    def _record_start_timestamp(record: CapturedRecord) -> int:
        if isinstance(record, FirmwareCaptureEvent):
            return record.timestamp
        return record.start_timestamp

    @staticmethod
    def _record_end_timestamp(record: CapturedRecord) -> int:
        if isinstance(record, FirmwareCaptureEvent):
            return record.timestamp
        return record.end_timestamp

    async def on_data_table_row_selected(self, message: DataTable.RowSelected) -> None:
        """Handle the row_selected event from the message table."""
        logging.info("Selecting row %s", message.row_key.value)
        self.message_details.message = self.messages[int(
            message.row_key.value or "1") - 1]

    def on_mount(self) -> None:
        """Called when the panel is mounted."""
        self.add_class("message-panel")
        self.log("Message panel initialized.")

    def focus(self, scroll_visible: bool = True) -> "MessagePanel":
        """Set focus to the message table."""
        self.table.focus(scroll_visible=scroll_visible)
        return self

    def blur(self) -> "MessagePanel":
        """Remove focus from the message table."""
        self.table.blur()
        return self

    def compose(self) -> ComposeResult:
        yield self.table
        yield self.message_details

    async def action_clear_table(self) -> None:
        """
        Clear the message table.
        """
        self.table.clear()
        self.messages.clear()
        self.message_details.message = None
