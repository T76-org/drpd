"""
Copyright (c) 2025 MTA, Inc.

StatusPanel displays status information for connected DRPD devices.
"""

from typing import Optional
from textual.app import ComposeResult
from textual.containers import VerticalGroup, HorizontalGroup
from textual.reactive import reactive
from textual.widgets import Static

from t76.drpd.device import Device
from t76.drpd.device.device_trigger import TriggerInfo
from t76.drpd.device.events import DeviceConnected, DeviceDisconnected, DeviceEvent, TriggerStatusChanged

from ..divider import Divider


class TriggerPanel(VerticalGroup):
    """
    The TriggerPanel displays trigger information for connected DRPD devices.
    """

    device: reactive[Optional[Device]] = reactive(None)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    async def update(self, new_status: Optional[TriggerInfo] = None) -> None:
        if new_status is None:
            self.query_one("#type-value", Static).update("N/A")
            self.query_one("#event-threshold-value", Static).update("N/A")
            self.query_one("#autorepeat-value", Static).update("N/A")
            self.query_one("#sync-mode-value", Static).update("N/A")
            self.query_one("#pulse-length-value", Static).update("N/A")
        else:
            self.query_one(
                "#type-value", Static).update(new_status.type.value)

            self.query_one("#event-threshold-value",
                           Static).update(str(new_status.event_threshold))

            self.query_one(
                "#autorepeat-value", Static).update("ON" if new_status.autorepeat.value else "OFF")

            self.query_one("#sync-mode-value",
                           Static).update(new_status.sync_mode.value)

            self.query_one("#pulse-length-value",
                           Static).update(f"{str(new_status.sync_pulse_length)}µs")

            self.query_one("#status-value",
                           Static).update(new_status.status.value)

            self.query_one("#events-value",
                           Static).update(str(new_status.event_count))

    async def on_mount(self) -> None:
        """Called when the panel is mounted."""
        self.add_class("status-panel")
        self.border_title = "Trigger"

    async def watch_device(self, old_device: Optional[Device], new_device: Optional[Device]) -> None:
        """Called when the device changes."""
        if old_device is not None:
            old_device.unregister_event_observer(self._on_device_event)

        if new_device is not None:
            new_device.register_event_observer(self._on_device_event)
        else:
            await self.update(None)

    async def _on_device_event(self, event: DeviceEvent) -> None:
        """Handle device events to update the panel."""

        if isinstance(event, DeviceConnected):
            if self.device is not None:
                current_status = await self.device.trigger.get_trigger_info()
                await self.update(current_status)
        elif isinstance(event, DeviceDisconnected):
            await self.update(None)
        elif isinstance(event, TriggerStatusChanged):
            await self.update(event.new_status)

    def compose(self) -> ComposeResult:
        """Compose the layout of the StatusPanel."""
        yield HorizontalGroup(
            Static(
                "Type", id="type-header").add_class("status-header"),
            Static(
                "", id="type-value").add_class("status-value")
        ).add_class("status-row")

        yield HorizontalGroup(
            Static(
                "Threshold", id="event-threshold-header").add_class("status-header"),
            Static(
                "", id="event-threshold-value").add_class("status-value")
        ).add_class("status-row")

        yield HorizontalGroup(
            Static(
                "Autorepeat", id="autorepeat-header").add_class("status-header"),
            Static(
                "", id="autorepeat-value").add_class("status-value")
        ).add_class("status-row")

        yield HorizontalGroup(
            Static(
                "Sync mode", id="sync-mode-header").add_class("status-header"),
            Static(
                "", id="sync-mode-value").add_class("status-value")
        ).add_class("status-row")

        yield HorizontalGroup(
            Static(
                "Pulse len", id="pulse-length-header").add_class("status-header"),
            Static(
                "", id="pulse-length-value").add_class("status-value")
        ).add_class("status-row")

        yield Divider()

        yield HorizontalGroup(
            Static("Status", id="status-header").add_class("status-header"),
            Static("", id="status-value").add_class("status-value")
        ).add_class("status-row")

        yield HorizontalGroup(
            Static("Events", id="events-header").add_class("status-header"),
            Static("", id="events-value").add_class("status-value")
        ).add_class("status-row")
