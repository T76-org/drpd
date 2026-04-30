"""
Copyright (c) 2025 MTA, Inc.

InfoPanel displays device information for connected DRPD devices.
"""

import logging

from typing import Optional

from textual.app import ComposeResult
from textual.containers import VerticalGroup, HorizontalGroup
from textual.css.query import NoMatches
from textual.reactive import reactive
from textual.widgets import Static

from t76.drpd.device.device import Device

from ..divider import Divider


class InfoPanel(VerticalGroup):
    """
    The InfoPanel displays device information for connected DRPD devices.
    """

    device: reactive[Optional[Device]] = reactive(None)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    async def update(self) -> None:
        """Update the device information displayed in the panel."""
        if not self.is_mounted:
            return

        try:
            if self.device is None:
                self.query_one("#serial-number-value", Static).update("ERR")
                self.query_one("#firmware-value", Static).update("ERR")
                self.query_one("#free-mem-value", Static).update("ERR")
                self.query_one("#clock-value", Static).update("ERR")
                self.query_one("#uptime-value", Static).update("ERR")
                self.query_one("#version-value", Static).update("ERR")
                return

            device_info = await self.device.system.identify()

            self.query_one("#serial-number-value", Static).update(
                device_info.serial_number)

            self.query_one("#firmware-value", Static).update(
                device_info.firmware_version)

            memory_usage = await self.device.system.get_memory_usage()
            self.query_one("#free-mem-value", Static).update(
                f"{memory_usage.free} ({memory_usage.free/memory_usage.total*100:.0f}%)")

            self.query_one("#clock-value", Static).update(
                f"{await self.device.system.get_clock_frequency() // 1_000_000}MHz")

            uptime_seconds = await self.device.system.get_uptime()
            hours, remainder = divmod(int(uptime_seconds), 3600)
            minutes, seconds = divmod(remainder, 60)
            self.query_one("#uptime-value", Static).update(
                f"{hours:02}:{minutes:02}:{seconds:02}")

            self.query_one("#version-value", Static).update(
                f"v{device_info.firmware_version}")
        except (AttributeError, ValueError, RuntimeError, AssertionError, NoMatches) as e:
            logging.error("Failed to update statistics: %s", e)

            try:
                self.query_one("#serial-number-value", Static).update("ERR")
                self.query_one("#firmware-value", Static).update("ERR")
                self.query_one("#free-mem-value", Static).update("ERR")
                self.query_one("#clock-value", Static).update("ERR")
                self.query_one("#uptime-value", Static).update("ERR")
                self.query_one("#version-value", Static).update("ERR")
            except NoMatches:
                return

    async def on_mount(self) -> None:
        """Called when the panel is mounted."""
        self.add_class("status-panel")
        self.set_interval(1.0, self.update)
        self.border_title = "Device Info"

    def compose(self) -> ComposeResult:
        """Compose the layout of the InfoPanel."""
        yield HorizontalGroup(
            Static(
                "Serial", id="serial-number-header").add_class("status-header"),
            Static(
                "", id="serial-number-value").add_class("status-value")
        ).add_class("status-row")
        yield HorizontalGroup(
            Static(
                "Firmware", id="firmware-header").add_class("status-header"),
            Static(
                "", id="firmware-value").add_class("status-value")
        ).add_class("status-row")
        yield Divider()
        yield HorizontalGroup(
            Static(
                "Free mem", id="free-mem-header").add_class("status-header"),
            Static(
                "", id="free-mem-value").add_class("status-value")
        ).add_class("status-row")
        yield HorizontalGroup(
            Static(
                "Uptime", id="uptime-header").add_class("status-header"),
            Static(
                "s", id="uptime-value").add_class("status-value")
        ).add_class("status-row")
        yield Divider()
        yield HorizontalGroup(
            Static(
                "Firmware", id="version-header").add_class("status-header"),
            Static(
                "", id="version-value").add_class("status-value")
        ).add_class("status-row")
        yield HorizontalGroup(
            Static(
                "Clock", id="clock-header").add_class("status-header"),
            Static(
                "MHz", id="clock-value").add_class("status-value")
        ).add_class("status-row")
