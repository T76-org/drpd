"""
Copyright (c) 2025 MTA, Inc.

ModeSelectionModal displays a modal panel for selecting the device's mode.
"""

from typing import Optional

from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Vertical
from textual.reactive import reactive
from textual.screen import ModalScreen
from textual.widgets import OptionList, Static
from textual.widgets.option_list import Option

from t76.drpd.device.device import Device
from t76.drpd.device.types import Mode


class ModeSelectionModal(ModalScreen):

    BINDINGS = [
        Binding("escape", "close", "Close the modal")
    ]

    device: reactive[Optional[Device]] = reactive(None)

    def compose(self) -> ComposeResult:
        with Vertical(classes="mode-selection-outer-container"):
            with Vertical(classes="mode-selection-inner-container"):
                yield Static("  Choose a mode\n")
                yield OptionList(
                    Option("Disabled", id=Mode.DISABLED.value),
                    Option("Observer", id=Mode.OBSERVER.value),
                    Option("Source", id=Mode.SOURCE.value),
                    Option("Sink", id=Mode.SINK.value),
                )

    def action_close(self) -> None:
        """Handle the close action."""
        self.app.pop_screen()

    async def on_option_list_option_selected(self, event: OptionList.OptionSelected) -> None:
        """Handle the option list selection."""
        assert self.device is not None, "Device must be set before selecting mode."

        if event.option.id is not None:
            mode = Mode(event.option.id)
            await self.device.mode.set(mode)

        self.app.pop_screen()
