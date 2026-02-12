"""
Copyright (c) 2025 MTA, Inc.

AnalogMonitorPanel monitors the analog voltages and currents of the connected device.
"""
from collections import deque
from typing import Optional

from textual.app import ComposeResult
from textual.containers import VerticalGroup, HorizontalGroup
from textual.reactive import reactive
from textual.widgets import Static

from t76.drpd.device.device import Device
from t76.drpd.device.events import AnalogMonitorStatusChanged, DeviceConnected, DeviceDisconnected, DeviceEvent
from t76.drpd.device.types import AnalogMonitorChannels

from ..divider import Divider


class AnalogMonitorPanel(VerticalGroup):
    """
    The AnalogMonitorPanel displays analog monitor information for connected DRPD devices.
    """

    POWER_WINDOW_SIZE = 30  # Window size for power averaging

    device: reactive[Optional[Device]] = reactive(None)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._power_window: deque = deque(maxlen=self.POWER_WINDOW_SIZE)

    def update(self, new_status: Optional[AnalogMonitorChannels]) -> None:
        if self.device is None:
            return

        if new_status is None:
            # Clear all values
            self.query_one("#vbus-value", Static).update("N/A")
            self.query_one("#ibus-value", Static).update("N/A")
            self.query_one("#pbus-value", Static).update("N/A")
            self.query_one("#dut-cc1-value", Static).update("N/A")
            self.query_one("#dut-cc2-value", Static).update("N/A")
            self.query_one("#usds-cc1-value", Static).update("N/A")
            self.query_one("#usds-cc2-value", Static).update("N/A")

            return

        # Calculate instantaneous power and add to window average
        instantaneous_power = new_status.vbus * new_status.ibus
        self._power_window.append(instantaneous_power)
        averaged_power = (sum(self._power_window) /
                          len(self._power_window))

        self.query_one('#vbus-value',
                       Static).update(f"{new_status.vbus:6.2f}V")
        self.query_one('#ibus-value',
                       Static).update(f"{new_status.ibus:6.2f}A")
        self.query_one('#pbus-value',
                       Static).update(f"{averaged_power:6.2f}W")
        self.query_one('#dut-cc1-value',
                       Static).update(
            f"{new_status.dut_cc1:6.2f}V\n"
            f"{new_status.dut_cc1_status.value}")
        self.query_one('#dut-cc2-value',
                       Static).update(
            f"{new_status.dut_cc2:6.2f}V\n"
            f"{new_status.dut_cc2_status.value}")
        self.query_one('#usds-cc1-value',
                       Static).update(
            f"{new_status.usds_cc1:6.2f}V\n"
            f"{new_status.usds_cc1_status.value}")
        self.query_one('#usds-cc2-value',
                       Static).update(
            f"{new_status.usds_cc2:6.2f}V\n"
            f"{new_status.usds_cc2_status.value}")

    async def on_mount(self) -> None:
        """Called when the panel is mounted."""
        self.add_class("status-panel")
        self.border_title = "Analog Monitor"

    def watch_device(self, old_device: Optional[Device], new_device: Optional[Device]) -> None:
        if old_device is not None:
            old_device.unregister_event_observer(self._on_device_event)

        if new_device is None:
            self.update(None)
        else:
            new_device.register_event_observer(self._on_device_event)

    async def _on_device_event(self, event: DeviceEvent) -> None:
        """Handle events from the device."""
        if isinstance(event, DeviceConnected):
            # Fetch initial status on connection
            assert self.device is not None

            status = await self.device.analog_monitor.get_status()
            self.update(status)

            return

        if isinstance(event, DeviceDisconnected):
            # Clear status on disconnection
            self.update(None)
            return

        if isinstance(event, AnalogMonitorStatusChanged):
            self.update(event.status)

    def compose(self) -> ComposeResult:
        yield HorizontalGroup(
            Static(
                "VBUS", id="vbus-header").add_class("status-header"),
            Static(
                "V", id="vbus-value").add_class("status-value")
        ).add_class("status-row")
        yield HorizontalGroup(
            Static(
                "IBUS", id="ibus-header").add_class("status-header"),
            Static(
                "A", id="ibus-value").add_class("status-value")
        ).add_class("status-row")
        yield HorizontalGroup(
            Static(
                "PBUS", id="pbus-header").add_class("status-header"),
            Static(
                "W", id="pbus-value").add_class("status-value")
        ).add_class("status-row")
        yield Divider()
        yield HorizontalGroup(
            Static(
                "DUT CC1", id="dut-cc1-header").add_class("status-header"),
            Static(
                "V", id="dut-cc1-value").add_class("status-value")
        ).add_class("status-row")
        yield HorizontalGroup(
            Static(
                "DUT CC2", id="dut-cc2-header").add_class("status-header"),
            Static(
                "V", id="dut-cc2-value").add_class("status-value")
        ).add_class("status-row")
        yield Divider()
        yield HorizontalGroup(
            Static(
                "USDS CC1", id="usds-cc1-header").add_class("status-header"),
            Static(
                "V", id="usds-cc1-value").add_class("status-value")
        ).add_class("status-row")
        yield HorizontalGroup(
            Static(
                "USDS CC2", id="usds-cc2-header").add_class("status-header"),
            Static(
                "V", id="usds-cc2-value").add_class("status-value")
        ).add_class("status-row")
