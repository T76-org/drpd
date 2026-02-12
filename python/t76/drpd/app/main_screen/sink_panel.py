"""
Copyright (c) 2025 MTA, Inc.

SinkPanel displays sink-related information for connected DRPD devices.
"""

import logging

from typing import Optional

from pyvisa import VisaIOError
from rich.text import Text
from textual.app import ComposeResult
from textual.containers import HorizontalGroup, VerticalGroup
from textual.message import Message
from textual.reactive import reactive
from textual.widgets import DataTable, Digits, Static

from t76.drpd.device.device import Device
from t76.drpd.device.device_sink import SinkInfo
from t76.drpd.device.device_sink_pdos import (
    BatteryPDO,
    DeviceSinkPDO,
    EPR_PDOAVs,
    FixedPDO,
    SPR_PDOAVs,
    SPR_PDOPPS,
    VariablePDO,
)
from t76.drpd.device.events import (
    AnalogMonitorStatusChanged,
    DeviceConnected,
    DeviceDisconnected,
    DeviceEvent,
    RoleChanged,
    SinkInfoChanged,
    SinkPDOListChanged,
)
from t76.drpd.device.types import AnalogMonitorChannels, Mode

from .sink_pps_setup_modal import SinkPPSSetupModal


class PdoTable(DataTable):
    """Table for displaying available Power Data Objects (PDOs)."""

    class PdoSelected(Message):
        """Message emitted when a PDO row is selected."""

        def __init__(self, index: int, pdo: DeviceSinkPDO) -> None:
            super().__init__()
            self.index = index
            self.pdo = pdo

    def __init__(self, device: Optional[Device], *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.cursor_type = "row"
        self.add_class("pdo-table")
        self.pdos: dict[int, DeviceSinkPDO] = {}
        self.device = device

    def on_mount(self) -> None:
        """Called when the table is mounted."""
        self.add_column("#", width=3, key="index")
        self.add_column("Type", width=10, key="type")
        self.add_column("Voltage", width=12, key="voltage")
        self.add_column("Max Current", width=11, key="max_current")
        self.add_column("Max Power", width=10, key="max_power")
        self.add_column("Active", width=8, key="active")

    def add_pdo(
        self,
        pdo: DeviceSinkPDO,
        index: int,
        is_active: bool,
    ) -> None:
        """Add a PDO row to the table."""
        # Determine voltage display string
        if isinstance(pdo, FixedPDO):
            voltage_str = f"{pdo.voltage:.1f}V"
            max_current_str = f"{pdo.max_current:.3f}A"
            max_power = pdo.voltage * pdo.max_current
            max_power_str = f"{max_power:.1f}W"
            pdo_type = "FIXED"
        elif isinstance(pdo, VariablePDO):
            voltage_str = (
                f"{pdo.min_voltage:.1f}–{pdo.max_voltage:.1f}V"
            )
            max_current_str = f"{pdo.max_current:.3f}A"
            max_power = pdo.max_voltage * pdo.max_current
            max_power_str = f"{max_power:.1f}W"
            pdo_type = "VARIABLE"
        elif isinstance(pdo, BatteryPDO):
            voltage_str = (
                f"{pdo.min_voltage:.1f}–{pdo.max_voltage:.1f}V"
            )
            max_current_str = "N/A"
            max_power_str = f"{pdo.max_power:.1f}W"
            pdo_type = "BATTERY"
        elif isinstance(pdo, SPR_PDOPPS):
            voltage_str = (
                f"{pdo.min_voltage:.1f}–{pdo.max_voltage:.1f}V"
            )
            max_current_str = f"{pdo.max_current:.3f}A"
            max_power = pdo.max_voltage * pdo.max_current
            max_power_str = f"{max_power:.1f}W"
            pdo_type = "SPR_PPS"
        elif isinstance(pdo, SPR_PDOAVs):
            voltage_str = (
                f"{pdo.min_voltage:.1f}–{pdo.max_voltage:.1f}V"
            )
            max_current_str = "N/A"
            max_power_str = f"{pdo.max_power:.1f}W"
            pdo_type = "SPR_AVS"
        elif isinstance(pdo, EPR_PDOAVs):
            voltage_str = (
                f"{pdo.min_voltage:.1f}–{pdo.max_voltage:.1f}V"
            )
            max_current_str = "N/A"
            max_power_str = f"{pdo.max_power:.1f}W"
            pdo_type = "EPR_AVS"
        else:
            voltage_str = "Unknown"
            max_current_str = "Unknown"
            max_power_str = "Unknown"
            pdo_type = "UNKNOWN"

        # Format active indicator
        active_indicator = Text("✓", style="green") if is_active else ""

        self.add_row(
            Text(str(index), justify="right"),
            pdo_type,
            voltage_str,
            max_current_str,
            max_power_str,
            active_indicator,
            key=str(index),
        )
        self.pdos[index] = pdo

    def set_active_pdo(self, active_pdo: DeviceSinkPDO) -> None:
        """Set the active PDO in the table."""
        for row_key, pdo in self.pdos.items():
            is_active = pdo == active_pdo
            active_indicator = Text("✓", style="green") if is_active else ""
            self.update_cell(str(row_key), "active", active_indicator)

    def clear_pdos(self) -> None:
        """Clear all PDO rows from the table."""
        self.clear()
        self.pdos.clear()

    def get_pdo_at_index(self, index: int) -> DeviceSinkPDO | None:
        """Get the PDO at the specified index."""
        return self.pdos.get(index)

    async def on_data_table_row_selected(
        self, message: DataTable.RowSelected
    ) -> None:
        """Handle PDO selection from the table."""
        if message.row_key is None or message.row_key.value is None:
            return

        try:
            index = int(message.row_key.value)
        except (TypeError, ValueError):
            return

        pdo = self.get_pdo_at_index(index)
        if pdo is None:
            return

        self.post_message(self.PdoSelected(index, pdo))


class SinkPanel(VerticalGroup):
    """
    The SinkPanel displays sink-related information for connected DRPD
    devices.
    """

    device: reactive[Optional[Device]] = reactive(None)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.sink_info: Optional[SinkInfo] = None

    async def update_analog_measurements(self, channels: AnalogMonitorChannels) -> None:
        """Update VBUS voltage and current from the device."""
        if self.device is None:
            self.query_one("#vbus-digits", Digits).update("---")
            self.query_one("#ibus-digits", Digits).update("---")
            return

        # Update displays
        self.query_one("#vbus-digits", Digits).update(
            f"{channels.vbus:.2f}"
        )
        self.query_one("#ibus-digits", Digits).update(
            f"{channels.ibus:.2f}"
        )

    async def on_mount(self) -> None:
        """Called when the panel is mounted."""
        self.add_class("sink-panel")
        self.border_title = "Sink"

    async def watch_device(self, old_device: Optional[Device],
                           new_device: Optional[Device]) -> None:
        """Called when the device changes."""
        if old_device is not None:
            old_device.unregister_event_observer(self._on_device_event)

        if new_device is not None:
            new_device.register_event_observer(self._on_device_event)
        else:
            await self._clear_sink_info()

    async def _on_device_event(self, event: DeviceEvent) -> None:
        """Handle device events to update the panel."""

        if isinstance(event, DeviceConnected):
            if self.device is not None:
                if await self.device.mode.get() != Mode.SINK:
                    await self._clear_sink_info()
                    return

                sink_info = await self.device.sink.get_sink_info()
                await self._update_sink_info(sink_info)

                pdo_count = await self.device.sink.get_pdo_count()
                pdos = []
                for index in range(pdo_count):
                    pdos.append(await self.device.sink.get_pdo_at_index(index))
                await self._update_pdo_list(pdos, sink_info.negotiated_pdo)
            else:
                await self._clear_sink_info()
        elif isinstance(event, DeviceDisconnected):
            await self._clear_sink_info()
        elif isinstance(event, SinkPDOListChanged):
            await self._update_pdo_list(event.new_pdos,
                                        self.sink_info.negotiated_pdo
                                        if self.sink_info else None)
        elif isinstance(event, SinkInfoChanged):
            await self._update_sink_info(event.new_info)
        elif isinstance(event, RoleChanged):
            if event.new_role != Mode.SINK:
                await self._clear_sink_info()
            else:
                sink_info = await event.device.sink.get_sink_info()
                await self._update_sink_info(sink_info)
        elif isinstance(event, AnalogMonitorStatusChanged):
            await self.update_analog_measurements(event.status)

    async def on_pdo_table_pdo_selected(self, message: PdoTable.PdoSelected) -> None:
        """Handle PDO selection forwarded by the PDO table."""
        if self.device is None:
            return

        pdo = message.pdo

        # Handle Fixed PDOs directly
        if isinstance(pdo, FixedPDO):
            try:
                await self.device.sink.set_pdo(message.index, int(pdo.voltage * 1000), 0)
                logging.info(
                    "Requested FIXED PDO %d (%.1fV)",
                    message.index,
                    pdo.voltage,
                )
            except (AssertionError, AttributeError, RuntimeError, VisaIOError) as e:
                logging.error("Failed to request PDO %d: %s", message.index, e)
            return

        # Handle PPS PDOs with modal
        if isinstance(pdo, SPR_PDOPPS):
            self.app.push_screen(SinkPPSSetupModal(
                self.device, message.index, pdo))
            return

    async def _update_sink_info(self, sink_info) -> None:
        """Update the sink information display."""

        self.sink_info = sink_info

        try:
            self.query_one(
                "#pdo-table", PdoTable).set_active_pdo(sink_info.negotiated_pdo)
            self.query_one("#pdo-voltage-value", Static).update(
                f"Set: {sink_info.negotiated_voltage/1000:.2f}V"
            )
            self.query_one("#pdo-current-value", Static).update(
                f"Set: {sink_info.negotiated_current/1000:.2f}A"
            )
            self.query_one("#sink-state-value", Static).update(
                f"State: {sink_info.status.value}"
            )
        except (AssertionError, AttributeError, RuntimeError,
                VisaIOError) as e:
            logging.error("Failed to update sink panel: %s", e)
            self.query_one("#pdo-voltage-value", Static).update("ERR")
            self.query_one("#pdo-current-value", Static).update("ERR")
            self.query_one("#sink-state-value", Static).update(
                "State: ERR"
            )
            self.query_one("#pdo-table", PdoTable).clear_pdos()

    async def _update_pdo_list(self, pdos: list[DeviceSinkPDO],
                               active_pdo: Optional[DeviceSinkPDO]) -> None:
        """Update the PDO list display."""
        # Update PDO table
        pdo_table = self.query_one("#pdo-table", PdoTable)
        pdo_table.device = self.device
        pdo_table.clear_pdos()

        for pdo in pdos:
            is_active = active_pdo is not None and pdo == active_pdo
            pdo_table.add_pdo(pdo, len(pdo_table.pdos), is_active)

    async def _clear_sink_info(self) -> None:
        """Clear all sink information displays."""
        self.query_one("#vbus-digits", Digits).update("---")
        self.query_one("#pdo-voltage-value", Static).update("Set: ---")
        self.query_one("#ibus-digits", Digits).update("---")
        self.query_one("#pdo-current-value", Static).update("Set: ---")
        self.query_one("#sink-state-value", Static).update("State: ---")
        self.query_one("#pdo-table", PdoTable).clear_pdos()
        self.sink_info = None

    def compose(self) -> ComposeResult:
        """Compose the layout of the panel."""
        yield HorizontalGroup(
            VerticalGroup(
                Static("VBUS Voltage", classes="sink-label"),
                Digits("---", id="vbus-digits"),
                Static("Set: ---", id="pdo-voltage-value",
                       classes="sink-set-value"),
            ).add_class("sink-display-column"),
            VerticalGroup(
                Static("VBUS Current", classes="sink-label"),
                Digits("---", id="ibus-digits"),
                Static("Set: ---", id="pdo-current-value",
                       classes="sink-set-value"),
            ).add_class("sink-display-column"),
        ).add_class("sink-display-row")
        yield Static("State: ---", id="sink-state-value",
                     classes="sink-state")
        yield PdoTable(self.device, id="pdo-table")

    def focus(self, scroll_visible: bool = True) -> "SinkPanel":
        """Set focus to the PDO table."""
        self.query_one(
            "#pdo-table", PdoTable).focus(scroll_visible=scroll_visible)
        return self

    def blur(self) -> "SinkPanel":
        """Remove focus from the PDO table."""
        self.query_one("#pdo-table", PdoTable).blur()
        return self
