"""
Unit tests for device mode parsing and selection.
"""

import unittest
from types import SimpleNamespace
from typing import Any, cast

from textual._context import active_app
from textual.widgets import OptionList

from t76.drpd.app.main_screen.mode_selection_modal import ModeSelectionModal
from t76.drpd.device.types import Mode


class TestModeEnum(unittest.TestCase):
    """Tests for device mode parsing."""

    def test_from_string_rejects_removed_source_mode(self) -> None:
        """SOURCE is no longer a valid device mode."""
        with self.assertRaises(ValueError):
            Mode.from_string("SOURCE")


class TestModeSelectionModal(unittest.TestCase):
    """Tests for available mode-selection options."""

    def test_modal_exposes_only_supported_modes(self) -> None:
        """The modal should list Disabled, Observer, and Sink only."""
        modal = ModeSelectionModal()
        token = active_app.set(cast(
            Any, SimpleNamespace(_compose_stacks=[[]], _composed=[[]])))
        try:
            option_list = next(
                widget for widget in modal.compose() if isinstance(widget, OptionList)
            )
        finally:
            active_app.reset(token)

        option_ids = [option.id for option in option_list._options]
        self.assertEqual(option_ids, [
            Mode.DISABLED.value,
            Mode.OBSERVER.value,
            Mode.SINK.value,
        ])
