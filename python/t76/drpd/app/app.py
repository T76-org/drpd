"""
Copyright (c) 2025 MTA, Inc.

The DRPDApp class is the main application class for the DRPD console app.
"""

from .logging import logging  # Ensure logging is configured before other imports

from asyncio import sleep
from typing import Optional

from textual.app import App
from textual.binding import Binding
from textual.reactive import reactive

from t76.drpd.device.device import Device
from t76.drpd.device.discovery import find_drpd_devices
from t76.drpd.device.types import Mode, OnOffStatus

from .config import config
from .device_selection_screen import DeviceSelectionScreen, DeviceSelectedMessage
from .main_screen import MainScreen


CONFIG_APP_SECTION_KEY = "app"
CONFIG_ENABLE_CAPTURE_KEY = "enable_capture"
CONFIG_CC_BUS_MODE_KEY = "cc_bus_mode"


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

        try:
            logging.info('Searching for devices...')
            devices = find_drpd_devices()

            if len(devices) > 1:
                self.push_screen("device_selection")
            else:
                logging.info('Found device %s', devices[0])
                self.device = devices[0]

        except (ConnectionError, RuntimeError) as e:  # Replace with specific exceptions
            logging.error("Failed to find DRPD devices: %s", e)

    async def watch_device(self, old_device: Device, new_device: Device) -> None:
        """
        Watch for changes in the connected device.
        Connect to the new device and disconnect from the old device.

        Args:
            old_device (Device): The previously connected device.
            new_device (Device): The newly connected device.
        """
        if old_device is not None:
            await old_device.analog_monitor.stop_recurring_status_updates()
            await old_device.disconnect()

        if new_device is not None:
            logging.info('Connecting to device %s', new_device)
            await new_device.connect()
            await new_device.capture.fetch_extant_captures()
            await config.load(new_device)
            await new_device.analog_monitor.start_recurring_status_updates(0.5)

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

        await config.save(self.device)

    async def on_device_selected_message(self, message: DeviceSelectedMessage) -> None:
        """Handle the DeviceSelectedMessage event."""
        self.device = message.device
        self.pop_screen()
