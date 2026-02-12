"""
Copyright (c) 2025 MTA, Inc.

MainScreen is the main screen container for the DRPD app.
"""

from typing import Optional

from textual.app import ComposeResult
from textual.binding import Binding
from textual.reactive import reactive
from textual.screen import Screen
from textual.widgets import Header, Footer

from t76.drpd.device.device import Device

from .main_container import MainContainer
from .mode_selection_modal import ModeSelectionModal
from .trigger_setup_modal import TriggerSetupModal


class MainScreen(Screen):
    """
    MainScreen is the main screen container for the DRPD app.
    """

    BINDINGS = [
        Binding("m", "choose_mode", "Select mode", show=True),
        Binding("r", "trigger_reset", "Reset trigger", show=True),
        Binding("s", "trigger_setup", "Trigger setup", show=True),
        Binding("o", "open_ovp_setup", "OVP/OCP setup", show=True),
        Binding("p", "reset_ovp_ocp", "Reset OVP/OCP", show=True),
    ]

    device: reactive[Optional[Device]] = reactive(None)

    def compose(self) -> ComposeResult:
        """Compose the layout of the MainScreen."""
        yield Header()
        yield MainContainer().data_bind(MainScreen.device)
        yield Footer()

    def action_choose_mode(self) -> None:
        """Handle the choose mode action."""
        modal = ModeSelectionModal()
        modal.device = self.device

        self.app.push_screen(modal)

    def action_trigger_setup(self) -> None:
        """Handle the trigger setup action."""
        modal = TriggerSetupModal()
        modal.device = self.device

        self.app.push_screen(modal)

    async def action_trigger_reset(self) -> None:
        """Handle the trigger reset action."""
        if self.device is not None:
            await self.device.trigger.reset()

    def action_open_ovp_setup(self) -> None:
        """Handle the open OVP setup action."""
        from .ovp_setup_modal import OvpSetupModal

        modal = OvpSetupModal()
        modal.device = self.device

        self.app.push_screen(modal)

    async def action_reset_ovp_ocp(self) -> None:
        """Handle the reset OVP/OCP action."""
        if self.device is not None:
            await self.device.vbus.reset()
