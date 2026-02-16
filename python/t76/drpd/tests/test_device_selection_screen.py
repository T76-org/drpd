"""
Unit tests for DeviceSelectionScreen behavior.
"""

from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

from t76.drpd.app.device_selection_screen.device_selection_screen import (
    DeviceSelectionScreen,
)


class TestDeviceSelectionScreen(unittest.TestCase):
    """Tests for device discovery UI updates."""

    def test_first_device_is_auto_highlighted(self) -> None:
        screen = DeviceSelectionScreen()
        option_list = MagicMock()
        option_list.highlighted = None
        container = MagicMock()
        container.add_class.return_value = container

        def query_one(selector: str, *_args):
            if selector == "#device_list":
                return option_list
            if selector == "#device_selection_container":
                return container
            raise ValueError(f"Unexpected selector {selector}")

        screen.query_one = query_one  # type: ignore[method-assign]

        with patch(
            "t76.drpd.app.device_selection_screen.device_selection_screen.find_drpd_devices",
            return_value=[SimpleNamespace(name="Device A")],
        ):
            screen.discover_devices()

        self.assertEqual(option_list.highlighted, 0)

    def test_highlight_clears_when_no_devices_found(self) -> None:
        screen = DeviceSelectionScreen()
        option_list = MagicMock()
        option_list.highlighted = 1
        container = MagicMock()
        container.add_class.return_value = container

        def query_one(selector: str, *_args):
            if selector == "#device_list":
                return option_list
            if selector == "#device_selection_container":
                return container
            raise ValueError(f"Unexpected selector {selector}")

        screen.query_one = query_one  # type: ignore[method-assign]
        screen._devices = [SimpleNamespace(name="Device A")]

        with patch(
            "t76.drpd.app.device_selection_screen.device_selection_screen.find_drpd_devices",
            return_value=[],
        ):
            screen.discover_devices()

        self.assertIsNone(option_list.highlighted)
