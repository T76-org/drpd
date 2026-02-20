"""
Copyright (c) 2025 MTA, Inc.

StatusPanel displays status information for connected DRPD devices.
"""

import logging

from typing import Optional
from textual.app import ComposeResult
from textual.containers import VerticalGroup, HorizontalGroup
from textual.css.query import NoMatches
from textual.reactive import reactive
from textual.widgets import Static

from t76.drpd.device.device_vbus import VBusInfo
from t76.drpd.device.events import CCBusStateChanged, CaptureStatusChanged, DeviceConnected, DeviceDisconnected, DeviceEvent, RoleChanged, VBusManagerStateChanged

from ..divider import Divider

from t76.drpd.device import Device
from t76.drpd.device.types import CCBusState, Mode, OnOffStatus, VBusState


class StatusPanel(VerticalGroup):
    """
    The StatusPanel displays status information for connected DRPD devices.
    """

    device: reactive[Optional[Device]] = reactive(None)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    async def update_cc_bus_state(self, new_state: Optional[CCBusState]) -> None:
        """Update the CC Bus state displayed in the panel."""
        if not self.is_mounted:
            return
        try:
            self.query_one("#status-value",
                           Static).update(new_state.value if new_state else "N/A")
        except NoMatches:
            return

    async def update_role(self, new_role: Optional[Mode]) -> None:
        """Update the device role displayed in the panel."""
        if not self.is_mounted:
            return
        try:
            self.query_one("#role-value",
                           Static).update(new_role.value if new_role else "N/A")
        except NoMatches:
            return

    async def update_vbus_info(self, new_info: Optional[VBusInfo]) -> None:
        """Update the VBus information displayed in the panel."""
        if not self.is_mounted:
            return
        try:
            if new_info is None:
                self.query_one("#vbus-value", Static).update("N/A")
                self.query_one("#ovp-value", Static).update("N/A")
                self.query_one("#ocp-value", Static).update("N/A")
            else:
                vbus_widget = self.query_one("#vbus-value", Static)

                # Highlight if in OVP or OCP state
                if new_info.state in (VBusState.OVP, VBusState.OCP):
                    vbus_widget.update(f"[white on red]{new_info.state.value}[/]")
                else:
                    vbus_widget.update(new_info.state.value)

                self.query_one(
                    "#ovp-value", Static).update(f"{new_info.ovp_threshold:.2f}V")

                self.query_one(
                    "#ocp-value", Static).update(f"{new_info.ocp_threshold:.2f}A")
        except NoMatches:
            return

    async def update_capture_status(self, new_status: Optional[OnOffStatus]) -> None:
        """Update the capture status displayed in the panel."""
        if not self.is_mounted:
            return
        try:
            if new_status is None:
                self.query_one("#capture-value", Static).update("N/A")
            else:
                self.query_one(
                    "#capture-value", Static).update("ON" if new_status.value else "OFF")
        except NoMatches:
            return

    async def on_mount(self) -> None:
        """Called when the panel is mounted."""
        self.add_class("status-panel")
        self.border_title = "Device Status"

    def compose(self) -> ComposeResult:
        """Compose the layout of the StatusPanel."""
        yield HorizontalGroup(
            Static(
                "ROLE", id="role-header").add_class("status-header"),
            Static(
                "", id="role-value").add_class("status-value")
        ).add_class("status-row")

        yield HorizontalGroup(
            Static(
                "CAPTURE", id="capture-header").add_class("status-header"),
            Static(
                "", id="capture-value").add_class("status-value")
        ).add_class("status-row")

        yield HorizontalGroup(
            Static(
                "STATUS", id="status-header").add_class("status-header"),
            Static(
                "", id="status-value").add_class("status-value").add_class("status-value")
        )

        yield Divider()

        yield HorizontalGroup(
            Static(
                "VBUS", id="vbus-header").add_class("status-header"),
            Static(
                "", id="vbus-value").add_class("status-value")
        ).add_class("status-row")

        yield HorizontalGroup(
            Static(
                "OVP", id="ovp-header").add_class("status-header"),
            Static(
                "", id="ovp-value").add_class("status-value")
        )

        yield HorizontalGroup(
            Static(
                "OCP", id="ocp-header").add_class("status-header"),
            Static(
                "", id="ocp-value").add_class("status-value")
        )

    async def watch_device(self, old_device: Optional[Device], new_device: Optional[Device]) -> None:
        """Called when the device changes."""
        if old_device is not None:
            old_device.unregister_event_observer(self._on_device_event)

        if new_device is not None:
            new_device.register_event_observer(self._on_device_event)
        else:
            await self.update_cc_bus_state(None)

    async def _on_device_event(self, event: DeviceEvent) -> None:
        """Handle device events to update the panel."""
        try:
            if isinstance(event, DeviceConnected):
                if self.device is not None:
                    cc_bus_status = await self.device.mode.get_status()
                    await self.update_cc_bus_state(cc_bus_status)

                    role = await self.device.mode.get()
                    await self.update_role(role)
                else:
                    await self.update_cc_bus_state(None)
                    await self.update_role(None)
            elif isinstance(event, DeviceDisconnected):
                await self.update_cc_bus_state(None)
            elif isinstance(event, CCBusStateChanged):
                await self.update_cc_bus_state(event.new_state)
            elif isinstance(event, RoleChanged):
                await self.update_role(event.new_role)
            elif isinstance(event, VBusManagerStateChanged):
                await self.update_vbus_info(event.new_info)
            elif isinstance(event, CaptureStatusChanged):
                await self.update_capture_status(event.is_capturing)
        except (AssertionError, RuntimeError, NoMatches) as e:
            logging.warning("Failed to handle status panel event: %s", e)
