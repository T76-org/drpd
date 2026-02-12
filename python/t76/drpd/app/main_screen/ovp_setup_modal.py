"""
Copyright (c) 2025 MTA, Inc.

OvpSetupModal displays a modal panel for setting the Over Voltage Protection (OVP)
and Over Current Protection (OCP) thresholds.
"""

import logging

from typing import Optional

from textual import on
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Vertical, Horizontal, Container
from textual.reactive import reactive
from textual.screen import ModalScreen
from textual.widgets import Input, Static, Button

from t76.drpd.device.device import Device

from ..app import config


class OvpSetupModal(ModalScreen):
    """Modal screen for configuring OVP (Over-Voltage Protection) and OCP (Over-Current Protection) thresholds."""

    BINDINGS = [
        Binding("escape", "close", "Close the modal")
    ]

    device: reactive[Optional[Device]] = reactive(None)

    def compose(self) -> ComposeResult:
        """Compose the modal UI components."""
        assert self.device is not None, "Device must be set before composing the modal."

        with Vertical(classes="mode-selection-outer-container"):
            with Container(id="ovp_modal_container"):
                with Vertical(id="ovp_modal_content"):
                    yield Static("  OVP Threshold (V)")
                    yield Static("  Enter a value between 0 and 60V")
                    yield Input(
                        id="ovp_threshold_input",
                        type="number",
                        placeholder="OVP Threshold (V)",
                    )
                    yield Static("")
                    yield Static("  OCP Threshold (A)")
                    yield Static("  Enter a value between 0 and 6A")
                    yield Input(
                        id="ocp_threshold_input",
                        type="number",
                        placeholder="OCP Threshold (A)",
                    )
                    yield Static("")
                    with Horizontal():
                        yield Button("OK", id="ok_button", variant="primary")
                        yield Button("Cancel", id="cancel_button")

    async def on_mount(self) -> None:
        """Called when the modal is mounted."""
        assert self.device is not None, "Device must be set before mounting the modal."

        # Set the border title
        container = self.query_one("#ovp_modal_container")
        container.border_title = "Protection Thresholds"

        try:
            current_ovp = await self.device.vbus.get_ovp_threshold()
            ovp_input = self.query_one("#ovp_threshold_input", Input)
            ovp_input.value = f"{current_ovp:.2f}"
        except (RuntimeError, ValueError, TypeError) as error:
            logging.exception("Failed to get current OVP threshold: %s",
                              error)

        try:
            current_ocp = await self.device.vbus.get_ocp_threshold()
            ocp_input = self.query_one("#ocp_threshold_input", Input)
            ocp_input.value = f"{current_ocp:.2f}"
        except (RuntimeError, ValueError, TypeError) as error:
            logging.exception("Failed to get current OCP threshold: %s",
                              error)

    @on(Button.Pressed, "#ok_button")
    async def on_ok_pressed(self) -> None:
        """Handle OK button press - validate and save both thresholds."""
        if self.device is None:
            return

        ovp_input = self.query_one("#ovp_threshold_input", Input)
        ocp_input = self.query_one("#ocp_threshold_input", Input)

        # Validate OVP threshold
        try:
            ovp_threshold = float(ovp_input.value)
            if ovp_threshold < 0 or ovp_threshold > 60:
                logging.error(
                    "OVP threshold must be between 0 and 60V. Got: %s", ovp_threshold)
                ovp_input.value = ""
                return
        except ValueError:
            logging.error(
                "Invalid OVP threshold input. Must be a valid number.")
            ovp_input.value = ""
            return

        # Validate OCP threshold
        try:
            ocp_threshold = float(ocp_input.value)
            if ocp_threshold < 0 or ocp_threshold > 6:
                logging.error(
                    "OCP threshold must be between 0 and 6A. Got: %s", ocp_threshold)
                ocp_input.value = ""
                return
        except ValueError:
            logging.error(
                "Invalid OCP threshold input. Must be a valid number.")
            ocp_input.value = ""
            return

        # Both values are valid, save them
        try:
            await self.device.vbus.set_ovp_threshold(ovp_threshold)
            await self.device.vbus.set_ocp_threshold(ocp_threshold)
            await config.save(self.device)
            self.app.pop_screen()
        except (RuntimeError, ValueError, TypeError) as error:
            logging.exception("Failed to set thresholds: %s", error)

    @on(Button.Pressed, "#cancel_button")
    def on_cancel_pressed(self) -> None:
        """Handle Cancel button press - close without saving."""
        self.app.pop_screen()

    def action_close(self) -> None:
        """Handle the close action."""
        self.app.pop_screen()
