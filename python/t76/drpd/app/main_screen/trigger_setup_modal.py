"""
Copyright (c) 2025 MTA, Inc.

TriggerSetupModal displays a modal panel for setting up the device's trigger
"""

import logging

from typing import Optional

from textual import on
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Vertical
from textual.reactive import reactive
from textual.screen import ModalScreen
from textual.widgets import Input, RadioSet, RadioButton, Static

from t76.drpd.device.device import Device
from t76.drpd.device.types import OnOffStatus, TriggerSyncMode, TriggerType

from ..app import config


class TriggerSetupModal(ModalScreen):

    BINDINGS = [
        Binding("escape", "close", "Close the modal")
    ]

    device: reactive[Optional[Device]] = reactive(None)

    def compose(self) -> ComposeResult:
        assert self.device is not None, "Device must be set before composing the modal."

        with Vertical(classes="mode-selection-outer-container"):
            with Vertical(classes="mode-selection-inner-container"):
                yield Static("  Trigger type")
                with RadioSet(id="mode_selection_radio_set"):
                    for trigger_type in TriggerType:
                        yield RadioButton(trigger_type.name.capitalize(), id=trigger_type.value)

                yield Static("  Event threshold")
                yield Input(id="event_threshold_input", type="integer", restrict="[0-9]+", placeholder="Event Threshold")

                yield RadioButton("Autorepeat", id="autorepeat_option")

                yield Static(" Sync mode")
                with RadioSet(id="sync_mode_radio_set"):
                    for sync_mode in TriggerSyncMode:
                        yield RadioButton(sync_mode.value.replace("_", "-").title(), id=sync_mode.value)

                yield Static("  Pulse length (µs)")
                yield Input(id="pulse_length_input", type="integer", restrict="[0-9]+", placeholder="Pulse Length (µs)")

    async def on_mount(self) -> None:
        """Called when the modal is mounted."""
        assert self.device is not None, "Device must be set before mounting the modal."

        current_type = await self.device.trigger.get_type()
        radio_set = self.query_one("#mode_selection_radio_set", RadioSet)
        radio_button = radio_set.query_one(
            f"#{current_type.value}", RadioButton)
        radio_button.value = True

        event_threshold = await self.device.trigger.get_event_threshold()
        event_threshold_input = self.query_one("#event_threshold_input", Input)
        event_threshold_input.value = str(event_threshold)

        autorepeat_option = self.query_one("#autorepeat_option", RadioButton)
        autorepeat = await self.device.trigger.get_autorepeat()
        autorepeat_option.value = autorepeat == OnOffStatus.ON

        current_sync_mode = await self.device.trigger.get_sync_mode()
        sync_mode_radio_set = self.query_one("#sync_mode_radio_set", RadioSet)
        sync_mode_radio_button = sync_mode_radio_set.query_one(
            f"#{current_sync_mode.value}", RadioButton)
        sync_mode_radio_button.value = True

        pulse_length = await self.device.trigger.get_sync_pulse_length()
        pulse_length_input = self.query_one("#pulse_length_input", Input)
        pulse_length_input.value = str(pulse_length)

    @on(RadioSet.Changed, "#mode_selection_radio_set")
    async def on_trigger_type_selected(self, event: RadioSet.Changed) -> None:
        """Handle trigger type selection."""
        if self.device is not None and event.pressed.id is not None:
            trigger_type = TriggerType(event.pressed.id)
            await self.device.trigger.set_type(trigger_type)
            await config.save(self.device)

    @on(Input.Submitted, "#event_threshold_input")
    async def on_event_threshold_submitted(self, event: Input.Submitted) -> None:
        """Handle event threshold input submission."""
        if self.device is not None:
            try:
                threshold = int(event.value)
                await self.device.trigger.set_event_threshold(threshold)
                await config.save(self.device)
            except ValueError:
                logging.error("Invalid event threshold input.")

    @on(RadioButton.Changed, "#autorepeat_option")
    async def on_autorepeat_changed(self, event: RadioButton.Changed) -> None:
        """Handle autorepeat option change."""
        if self.device is not None:
            status = OnOffStatus.ON if event.value else OnOffStatus.OFF
            await self.device.trigger.set_autorepeat(status)
            await config.save(self.device)

    @on(RadioSet.Changed, "#sync_mode_radio_set")
    async def on_sync_mode_selected(self, event: RadioSet.Changed) -> None:
        """Handle sync mode selection."""
        if self.device is not None and event.pressed.id is not None:
            sync_mode = TriggerSyncMode.from_string(event.pressed.id)
            await self.device.trigger.set_sync_mode(sync_mode)
            await config.save(self.device)

    @on(Input.Submitted, "#pulse_length_input")
    async def on_pulse_length_submitted(self, event: Input.Submitted) -> None:
        """Handle pulse length input submission."""
        if self.device is not None:
            try:
                length_us = int(event.value)
                await self.device.trigger.set_sync_pulse_length(length_us)
                await config.save(self.device)
            except ValueError:
                logging.error("Invalid pulse length input.")

    def action_close(self) -> None:
        """Handle the close action."""
        self.app.pop_screen()
