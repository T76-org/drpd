"""
Unit tests for sink PDO selection handling.
"""

import unittest
from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch

from t76.drpd.app.main_screen.sink_avs_setup_modal import SinkAVSSetupModal
from t76.drpd.app.main_screen.sink_panel import PdoTable, SinkPanel
from t76.drpd.app.main_screen.sink_pps_setup_modal import SinkPPSSetupModal
from t76.drpd.device.device_sink_pdos import (
    EPR_PDOAVs,
    FixedPDO,
    SPR_PDOAVs,
    SPR_PDOPPS,
)


class TestSinkPanelPDOSelection(unittest.IsolatedAsyncioTestCase):
    """Tests for SinkPanel PDO selection behavior."""

    async def asyncSetUp(self) -> None:
        """Set up test fixtures."""
        self.panel = SinkPanel()
        # Avoid scheduling Textual async reactive watchers in a unit test
        # that does not run the widget inside a mounted app.
        self.panel.watch_device = MagicMock()
        self.device = MagicMock()
        self.device.sink = MagicMock()
        self.device.sink.set_pdo = AsyncMock()
        self.panel.device = self.device

    async def test_fixed_pdo_selection_requests_immediately(self) -> None:
        """Selecting a fixed PDO should submit request directly."""
        message = PdoTable.PdoSelected(index=2, pdo=FixedPDO(5.0, 3.0))
        mock_app = MagicMock()

        with patch.object(
            SinkPanel, "app", new_callable=PropertyMock, return_value=mock_app
        ):
            await self.panel.on_pdo_table_pdo_selected(message)

        self.device.sink.set_pdo.assert_awaited_once_with(2, 5000, 0)
        mock_app.push_screen.assert_not_called()

    async def test_spr_pps_selection_opens_pps_modal(self) -> None:
        """Selecting SPR PPS should open PPS setup modal."""
        message = PdoTable.PdoSelected(
            index=1,
            pdo=SPR_PDOPPS(
                min_voltage=5.0,
                max_voltage=21.0,
                max_current=5.0,
            ),
        )
        mock_app = MagicMock()

        with patch.object(
            SinkPanel, "app", new_callable=PropertyMock, return_value=mock_app
        ):
            await self.panel.on_pdo_table_pdo_selected(message)

        self.device.sink.set_pdo.assert_not_called()
        mock_app.push_screen.assert_called_once()
        modal = mock_app.push_screen.call_args.args[0]
        self.assertIsInstance(modal, SinkPPSSetupModal)

    async def test_spr_avs_selection_opens_avs_modal(self) -> None:
        """Selecting SPR AVS should open AVS setup modal."""
        message = PdoTable.PdoSelected(
            index=3,
            pdo=SPR_PDOAVs(
                min_voltage=9.0,
                max_voltage=21.0,
                max_power=140.0,
            ),
        )
        mock_app = MagicMock()

        with patch.object(
            SinkPanel, "app", new_callable=PropertyMock, return_value=mock_app
        ):
            await self.panel.on_pdo_table_pdo_selected(message)

        self.device.sink.set_pdo.assert_not_called()
        mock_app.push_screen.assert_called_once()
        modal = mock_app.push_screen.call_args.args[0]
        self.assertIsInstance(modal, SinkAVSSetupModal)

    async def test_epr_avs_selection_opens_avs_modal(self) -> None:
        """Selecting EPR AVS should open AVS setup modal."""
        message = PdoTable.PdoSelected(
            index=4,
            pdo=EPR_PDOAVs(
                min_voltage=15.0,
                max_voltage=48.0,
                max_power=240.0,
            ),
        )
        mock_app = MagicMock()

        with patch.object(
            SinkPanel, "app", new_callable=PropertyMock, return_value=mock_app
        ):
            await self.panel.on_pdo_table_pdo_selected(message)

        self.device.sink.set_pdo.assert_not_called()
        mock_app.push_screen.assert_called_once()
        modal = mock_app.push_screen.call_args.args[0]
        self.assertIsInstance(modal, SinkAVSSetupModal)
