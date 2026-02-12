"""
Copyright (c) 2025 MTA, Inc.

Modal for configuring PPS (Programmable Power Supply) PDO requests.
"""

import logging

from typing import Optional

from pyvisa import VisaIOError
from textual import on
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.screen import ModalScreen
from textual.validation import Number
from textual.widgets import Button, Input, Label, Static

from t76.drpd.device.device import Device
from t76.drpd.device.device_sink_pdos import SPR_PDOPPS


class SinkPPSSetupModal(ModalScreen):
    """
    Modal for setting up a PPS PDO request.

    Allows the user to specify a voltage within the PPS PDO's voltage range
    and a current up to the PDO's maximum current. If no current is specified,
    defaults to the current negotiated current of the sink.
    """

    BINDINGS = [Binding("escape", "close", "Cancel the modal")]

    def __init__(
        self,
        device: Device,
        pdo_index: int,
        pdo: SPR_PDOPPS,
        *args,
        **kwargs
    ):
        """
        Initialize the PPS setup modal.

        :param device: The device to send the PDO request to.
        :type device: Device
        :param pdo_index: The index of the PPS PDO.
        :type pdo_index: int
        :param pdo: The PPS PDO to configure.
        :type pdo: SPR_PDOPPS
        """
        super().__init__(*args, **kwargs)
        self.device = device
        self.pdo_index = pdo_index
        self.pdo = pdo
        self.error_label: Optional[Static] = None
        self.default_current_ma: Optional[int] = None
        self.default_voltage_mv: Optional[int] = None
        self.add_class("pps-modal-screen")

    def compose(self) -> ComposeResult:
        """Compose the modal layout."""
        with Vertical(id="pps-modal-content") as content:
            content.border_title = "PPS Request"
            with Horizontal(classes="pps-modal-input-row"):
                yield Label("Voltage (V):", classes="pps-modal-label")
                yield Input(
                    placeholder=f"{self.pdo.min_voltage:.1f} - {self.pdo.max_voltage:.1f}",
                    id="voltage-input",
                    validators=[
                        Number(
                            minimum=self.pdo.min_voltage,
                            maximum=self.pdo.max_voltage
                        )
                    ]
                )

            with Horizontal(classes="pps-modal-input-row"):
                yield Label("Current (A):", classes="pps-modal-label")
                yield Input(
                    placeholder=f"0.0 - {self.pdo.max_current:.3f}",
                    id="current-input",
                    validators=[
                        Number(minimum=0, maximum=self.pdo.max_current)
                    ]
                )

            yield Static("", id="error-message")

            with Horizontal(id="pps-modal-buttons"):
                yield Button("Cancel", variant="default",
                             id="cancel-button")
                yield Button("OK", variant="primary",
                             id="ok-button")

    def on_mount(self) -> None:
        """Set focus to the voltage input when mounted."""
        self.error_label = self.query_one("#error-message", Static)
        self.call_later(self._load_defaults)
        self.query_one("#voltage-input", Input).focus()

    async def _load_defaults(self) -> None:
        """Load the default voltage and current from the device."""
        await self._load_default_voltage()
        await self._load_default_current()

    async def _load_default_voltage(self) -> None:
        """Load the default voltage from the device, clamped to PDO range."""
        try:
            voltage_mv = await self.device.sink.get_negotiated_voltage()
            # Clamp to PDO min/max range
            voltage_mv = max(
                int(self.pdo.min_voltage * 1000),
                min(
                    voltage_mv,
                    int(self.pdo.max_voltage * 1000)
                )
            )
            self.default_voltage_mv = voltage_mv
            # Set the voltage input value
            voltage_input = self.query_one("#voltage-input", Input)
            voltage_v = voltage_mv / 1000.0
            voltage_input.value = f"{voltage_v:.1f}"
        except (AssertionError, AttributeError, RuntimeError, VisaIOError) as e:
            logging.warning(
                "Failed to load negotiated voltage: %s", e
            )
            self.default_voltage_mv = None

    async def _load_default_current(self) -> None:
        """Load the default current from the device, clamped to PDO max."""
        try:
            current_ma = await self.device.sink.get_negotiated_current()
            # Clamp to PDO max current
            current_ma = min(
                current_ma,
                int(self.pdo.max_current * 1000)
            )
            self.default_current_ma = current_ma
            # Set the current input value
            current_input = self.query_one("#current-input", Input)
            current_a = current_ma / 1000.0
            current_input.value = f"{current_a:.3f}"
        except (AssertionError, AttributeError, RuntimeError, VisaIOError) as e:
            logging.warning(
                "Failed to load negotiated current: %s", e
            )
            self.default_current_ma = None

    @on(Button.Pressed, "#ok-button")
    async def handle_ok(self) -> None:
        """Handle OK button press."""
        voltage_input = self.query_one("#voltage-input", Input)
        current_input = self.query_one("#current-input", Input)
        error_label = self.error_label or self.query_one(
            "#error-message", Static
        )

        # Clear previous errors
        error_label.update("")
        error_label.remove_class("error")

        # Validate voltage input
        if not voltage_input.value.strip():
            error_label.update("Please enter a voltage value")
            error_label.add_class("error")
            return

        try:
            voltage = float(voltage_input.value)
        except ValueError:
            error_label.update("Invalid voltage value")
            error_label.add_class("error")
            return

        # Validate voltage range
        if voltage < self.pdo.min_voltage or voltage > self.pdo.max_voltage:
            error_label.update(
                f"Voltage must be between {self.pdo.min_voltage:.1f}V "
                f"and {self.pdo.max_voltage:.1f}V"
            )
            error_label.add_class("error")
            return

        # Validate and parse current input
        current_ma: int
        if current_input.value.strip():
            try:
                current = float(current_input.value)
                current_ma = int(current * 1000)
            except ValueError:
                error_label.update("Invalid current value")
                error_label.add_class("error")
                return

            # Validate current range
            if current < 0 or current > self.pdo.max_current:
                error_label.update(
                    f"Current must be between 0A and "
                    f"{self.pdo.max_current:.3f}A"
                )
                error_label.add_class("error")
                return
        else:
            # Use current negotiated current if available, else max
            if self.default_current_ma is not None:
                current_ma = self.default_current_ma
            else:
                current_ma = 0

        # Convert voltage to millivolts and send request to device
        voltage_mv = int(voltage * 1000)

        try:
            await self.device.sink.set_pdo(
                self.pdo_index, voltage_mv, current_ma
            )
            logging.info(
                "Requested PPS PDO %d (%.3fV, %dmA)",
                self.pdo_index,
                voltage_mv,
                current_ma,
            )
            self.app.pop_screen()
        except (AssertionError, AttributeError, RuntimeError, VisaIOError) as e:
            logging.error("Failed to request PPS PDO %d: %s",
                          self.pdo_index, e)
            error_label.update(f"Failed to request PDO: {e}")
            error_label.add_class("error")

    @on(Button.Pressed, "#cancel-button")
    def handle_cancel(self) -> None:
        """Handle Cancel button press."""
        self.app.pop_screen()

    async def on_input_submitted(self, event: Input.Submitted) -> None:
        """Handle ENTER key in input field."""
        if event.input.id in ("voltage-input", "current-input"):
            await self.handle_ok()

    def action_close(self) -> None:
        """Handle the close action."""
        self.app.pop_screen()
