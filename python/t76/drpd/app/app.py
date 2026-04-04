"""
Copyright (c) 2025 MTA, Inc.

The DRPDApp class is the main application class for the DRPD console app.
"""

from .logging import logging  # Ensure logging is configured before other imports

from asyncio import sleep
from typing import List, Optional

from textual.app import App
from textual.binding import Binding
from textual.reactive import reactive

from t76.drpd.device.device import Device
from t76.drpd.device.discovery import find_drpd_devices
from t76.drpd.device_reconciliation import (
    choose_active_device as choose_active_device_from_discovery,
)
from t76.drpd.device.types import Mode, OnOffStatus

from .device_selection_screen import DeviceSelectionScreen, DeviceSelectedMessage
from .main_screen import MainScreen


DISCOVERY_INTERVAL_SECONDS = 1.0


class DRPDApp(App):
    """
    The main application class for the DRPD app.
    """

    CSS_PATH = "app.tcss"

    BINDINGS = [
        Binding("d", "toggle_dark", "Toggle dark mode", show=False),
        Binding("c", "enable_capture", "Enable/disable capture", show=True),
        Binding("t", "cycle_connection",
                "Cycle connection", show=True),
        Binding("q", "quit", "Quit"),
    ]

    SCREENS = {
        "main": MainScreen,
        "device_selection": DeviceSelectionScreen,
    }

    device: reactive[Optional[Device]] = reactive(None)

    async def on_mount(self) -> None:
        """Called when the app is mounted."""
        self.title = "Dr.PD"
        self.get_screen("main", MainScreen).data_bind(
            DRPDApp.device).add_class("main-screen")

        self.push_screen("main")
        self.set_interval(
            DISCOVERY_INTERVAL_SECONDS,
            self._refresh_devices,
        )
        await self._refresh_devices(allow_auto_connect_single=True)

    async def on_unmount(self) -> None:
        """Called when the app is shutting down."""
        if self.device is None:
            return

        try:
            await self.device.analog_monitor.stop_recurring_status_updates()
        except Exception as e:
            logging.warning("Failed to stop analog monitor at shutdown: %s", e)

        try:
            await self.device.disconnect()
        except Exception as e:
            logging.warning("Failed to disconnect device at shutdown: %s", e)

    @staticmethod
    def choose_active_device(
            current_device: Optional[Device],
            discovered_devices: List[Device],
            allow_auto_connect_single: bool) -> Optional[Device]:
        """Return the next active device based on discovery results."""
        return choose_active_device_from_discovery(
            current_device=current_device,
            discovered_devices=discovered_devices,
            allow_auto_connect_single=allow_auto_connect_single,
        )

    def _discover_devices(self) -> List[Device]:
        """Discover available devices and return an empty list on error."""
        try:
            return find_drpd_devices()
        except (ConnectionError, RuntimeError) as e:
            logging.error("Failed to find DRPD devices: %s", e)
            return []

    def _device_selection_visible(self) -> bool:
        """Return true when the device selection screen is active."""
        return isinstance(self.screen, DeviceSelectionScreen)

    def _show_device_selection(self) -> None:
        """Show the device selection screen if needed."""
        if not self._device_selection_visible():
            self.push_screen("device_selection")

    def _hide_device_selection(self) -> None:
        """Hide the device selection screen if it is currently active."""
        if self._device_selection_visible():
            self.pop_screen()

    async def _refresh_devices(
            self,
            allow_auto_connect_single: bool = False) -> None:
        """
        Reconcile app state with the current set of connected devices.
        """
        discovered_devices = self._discover_devices()

        next_device = self.choose_active_device(
            current_device=self.device,
            discovered_devices=discovered_devices,
            allow_auto_connect_single=allow_auto_connect_single,
        )

        if self.device is not None and next_device is None:
            logging.info(
                "Active device disconnected; returning to selection screen.")

        if next_device is not self.device:
            self.device = next_device

        if self.device is None:
            self._show_device_selection()
            return

        self._hide_device_selection()

    async def watch_device(
            self,
            old_device: Optional[Device],
            new_device: Optional[Device]) -> None:
        """
        Watch for changes in the connected device.
        Connect to the new device and disconnect from the old device.

        Args:
            old_device (Optional[Device]): The previously connected device.
            new_device (Optional[Device]): The newly connected device.
        """
        if old_device is not None:
            try:
                await old_device.analog_monitor.stop_recurring_status_updates()
            except Exception as e:
                logging.warning(
                    "Failed to stop analog monitor updates for %s: %s",
                    old_device,
                    e,
                )

            try:
                await old_device.disconnect()
            except Exception as e:
                logging.warning(
                    "Failed to disconnect old device %s: %s",
                    old_device,
                    e,
                )

        if new_device is not None:
            try:
                logging.info('Connecting to device %s', new_device)
                await new_device.connect()
                await new_device.capture.fetch_extant_captures()
                await new_device.analog_monitor.start_recurring_status_updates(
                    0.5)
            except Exception as e:
                logging.error("Failed to connect to %s: %s", new_device, e)

                if self.device is new_device:
                    self.device = None

    async def action_cycle_connection(self) -> None:
        """
        Disconnect and reconnect the DUT and US/DS ports, simulating a cable
        being unplugged and plugged back in.
        """
        if not self.device:
            logging.warning("No device connected to cycle connection.")
            return

        current_mode = await self.device.mode.get()

        logging.debug("Cycling connection...")
        await self.device.mode.set(Mode.DISABLED)
        await sleep(1)
        await self.device.mode.set(current_mode)

    async def action_enable_capture(self) -> None:
        """
        Toggle packet capture on the connected device.
        """
        if not self.device:
            logging.warning("No device connected to toggle capture.")
            return

        if await self.device.capture.get_status() == OnOffStatus.ON:
            logging.info("Stopping packet capture...")
            await self.device.capture.stop()
        else:
            logging.info("Starting packet capture...")
            await self.device.capture.start()

    async def on_device_selected_message(self, message: DeviceSelectedMessage) -> None:
        """Handle the DeviceSelectedMessage event."""
        self.device = message.device
        self._hide_device_selection()
