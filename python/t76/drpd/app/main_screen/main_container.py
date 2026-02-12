"""
Copyright (c) 2025 MTA, Inc.

The main container renders the main layout of the DRPD application.
"""

from typing import Optional

from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import HorizontalGroup, VerticalGroup
from textual.reactive import reactive
from textual.widgets import TabPane, TabbedContent

from t76.drpd.device.device import Device
from t76.drpd.device.events import DeviceConnected, DeviceEvent, RoleChanged
from t76.drpd.device.types import Mode

from .analog_monitor_panel import AnalogMonitorPanel
from .info_panel import InfoPanel
from .message_panel import MessagePanel
from .sink_panel import SinkPanel
from .status_panel import StatusPanel
from .trigger_panel import TriggerPanel


class MainContainer(HorizontalGroup):
    """
    The main container for the DRPD application.
    This container holds the main layout of the application.
    """

    device: reactive[Optional[Device]] = reactive(None)

    BINDINGS = [
        Binding("1", "select_messages", "Messages Tab", show=False),
        Binding("2", "select_sink", "Sink Tab", show=False),
    ]

    def __init__(self):
        super().__init__()

    async def on_mount(self) -> None:
        """Called when the container is mounted."""
        self.add_class("main-container")
        self.styles.width = "100%"
        self.styles.height = "100%"

    def compose(self) -> ComposeResult:
        """Compose the main layout of the application."""
        yield VerticalGroup(
            AnalogMonitorPanel(
                id="voltage-panel"
            ).data_bind(MainContainer.device),
            StatusPanel(id="status-panel").data_bind(MainContainer.device),
            TriggerPanel(id="trigger-panel").data_bind(MainContainer.device),
            InfoPanel(id="info-panel").data_bind(MainContainer.device),
        ).add_class("side-content")

        with TabbedContent(
            id="message-tabs",
            classes="message-tabs",
        ):
            with TabPane(
                "Messages",
                id="messages-tab",
                name="messages-tab",
            ):
                yield MessagePanel(
                    id="message-panel"
                ).data_bind(MainContainer.device)

            with TabPane(
                "Sink",
                id="sink-tab",
                name="sink-tab",
            ):
                yield SinkPanel(
                    id="sink-panel"
                ).data_bind(MainContainer.device)

    def action_select_messages(self) -> None:
        """Switch to the Messages tab."""
        tabbed_content = self.query_one("#message-tabs", TabbedContent)
        message_panel = self.query_one("#message-panel", MessagePanel)
        sink_panel = self.query_one("#sink-panel", SinkPanel)

        sink_panel.blur()
        message_panel.focus()
        tabbed_content.active = "messages-tab"

    async def action_select_sink(self) -> None:
        """Switch to the Sink tab."""
        if self.device is None:
            return

        if await self.device.mode.get() != Mode.SINK:
            return

        tabbed_content = self.query_one("#message-tabs", TabbedContent)
        message_panel = self.query_one("#message-panel", MessagePanel)
        sink_panel = self.query_one("#sink-panel", SinkPanel)

        message_panel.blur()
        sink_panel.focus()
        tabbed_content.active = "sink-tab"

    async def watch_device(self, old_device: Optional[Device], new_device: Optional[Device]) -> None:
        """Watch for changes to the device and update the UI accordingly."""
        if old_device is not None:
            old_device.unregister_event_observer(self._on_device_event)

        if new_device is None:
            self.query_one("#message-tabs",
                           TabbedContent).disable_tab("sink-tab")
        else:
            new_device.register_event_observer(self._on_device_event)

    async def _on_device_event(self, event: DeviceEvent) -> None:
        """Handle device events."""
        if isinstance(event, DeviceConnected):
            assert self.device is not None

            if await self.device.mode.get() == Mode.SINK:
                self.query_one("#message-tabs",
                               TabbedContent).enable_tab("sink-tab")
            else:
                self.query_one("#message-tabs",
                               TabbedContent).disable_tab("sink-tab")

        if isinstance(event, RoleChanged):
            assert self.device is not None

            if event.new_role == Mode.SINK:
                self.query_one("#message-tabs",
                               TabbedContent).enable_tab("sink-tab")
            else:
                self.query_one("#message-tabs",
                               TabbedContent).disable_tab("sink-tab")
