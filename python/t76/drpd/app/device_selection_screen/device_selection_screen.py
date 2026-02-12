"""
Copyright (c) 2025 MTA, Inc.

The MainScreen is the main screen container for the DRPD app.
"""

import logging

from typing import List

from textual.app import ComposeResult
from textual.containers import VerticalGroup
from textual.message import Message
from textual.screen import Screen
from textual.widgets import Header, Footer, OptionList, Static

from t76.drpd.device.device import Device
from t76.drpd.device.discovery import find_drpd_devices


class DeviceSelectedMessage(Message):
    def __init__(self, device: Device) -> None:
        super().__init__()
        self.device = device


class DeviceSelectionScreen(Screen):
    """
    The DeviceSelectionScreen is the screen for selecting a device in the DRPD app.
    """

    def __init__(self) -> None:
        super().__init__()
        self._devices: List[Device] = []

    def discover_devices(self) -> None:
        """Discover available devices."""
        try:
            device_list = self.query_one("#device_list", OptionList)
            new_device_list = find_drpd_devices()

            # Compare each device in the new list with the old list
            # If the lists are different, update the device list
            lists_differ = (
                len(self._devices) != len(new_device_list) or
                any(device not in new_device_list for device in self._devices) or
                any(device not in self._devices for device in new_device_list)
            )

            if lists_differ:
                self._devices = new_device_list

                device_list.clear_options()
                device_list.add_options(
                    [device.name for device in self._devices])

            if len(self._devices) > 0:
                self.query_one('#device_selection_container').add_class(
                    "has_devices").focus()
            else:
                self.query_one('#device_selection_container').remove_class(
                    "has_devices")

        except (ConnectionError, RuntimeError, ValueError) as e:  # Replace with specific exceptions
            logging.error("Failed to find DRPD devices: %s", e)

    def on_mount(self) -> None:
        """Called when the screen is mounted."""
        self.set_interval(1.0, self.discover_devices)
        self.discover_devices()

    def compose(self) -> ComposeResult:
        """Compose the layout of the DeviceSelectionScreen."""
        yield Header()
        yield VerticalGroup(
            VerticalGroup(
                Static("  Select a device to connect to:\n",
                       id="device_selection_label"),
                OptionList(id="device_list"),
                id="device_selection_group"
            ),
            VerticalGroup(
                Static("There are no devices available. Connect a device to begin.",
                       id="no_devices_label"),
                id="no_devices_group"
            ),
            id="device_selection_container"
        ).add_class("scanning")

        yield Footer()

    def on_option_list_option_selected(self, message: OptionList.OptionSelected) -> None:
        """Called when a device option is selected."""
        logging.info("Selected device: %s", message.option)
        device = self._devices[int(message.option_index)]
        self.post_message(DeviceSelectedMessage(device))
