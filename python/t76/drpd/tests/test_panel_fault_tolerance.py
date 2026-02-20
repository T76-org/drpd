"""
Unit tests for panel fault tolerance during teardown.
"""

import unittest
from unittest.mock import MagicMock, PropertyMock, patch

from textual.css.query import NoMatches

from t76.drpd.app.main_screen.analog_monitor_panel import AnalogMonitorPanel
from t76.drpd.app.main_screen.info_panel import InfoPanel
from t76.drpd.app.main_screen.sink_panel import SinkPanel
from t76.drpd.app.main_screen.status_panel import StatusPanel
from t76.drpd.app.main_screen.trigger_panel import TriggerPanel


class TestPanelFaultTolerance(unittest.IsolatedAsyncioTestCase):
    """Panels should not crash when queried widgets are already gone."""

    async def test_analog_monitor_update_ignores_no_matches(self) -> None:
        panel = AnalogMonitorPanel()
        panel.device = MagicMock()
        panel.query_one = MagicMock(side_effect=NoMatches("gone"))

        with patch.object(AnalogMonitorPanel, "is_mounted",
                          new_callable=PropertyMock, return_value=True):
            panel.update(None)

    async def test_status_update_ignores_no_matches(self) -> None:
        panel = StatusPanel()
        panel.query_one = MagicMock(side_effect=NoMatches("gone"))

        with patch.object(StatusPanel, "is_mounted",
                          new_callable=PropertyMock, return_value=True):
            await panel.update_cc_bus_state(None)

    async def test_trigger_update_ignores_no_matches(self) -> None:
        panel = TriggerPanel()
        panel.query_one = MagicMock(side_effect=NoMatches("gone"))

        with patch.object(TriggerPanel, "is_mounted",
                          new_callable=PropertyMock, return_value=True):
            await panel.update(None)

    async def test_sink_clear_ignores_no_matches(self) -> None:
        panel = SinkPanel()
        panel.query_one = MagicMock(side_effect=NoMatches("gone"))

        with patch.object(SinkPanel, "is_mounted",
                          new_callable=PropertyMock, return_value=True):
            await panel._clear_sink_info()

    async def test_info_update_ignores_no_matches(self) -> None:
        panel = InfoPanel()
        panel.device = None
        panel.query_one = MagicMock(side_effect=NoMatches("gone"))

        with patch.object(InfoPanel, "is_mounted",
                          new_callable=PropertyMock, return_value=True):
            await panel.update()
