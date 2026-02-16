"""
Unit tests for DRPD app device reconciliation behavior.
"""

import unittest
from typing import cast

from t76.drpd.device_reconciliation import choose_active_device


class TestChooseActiveDevice(unittest.TestCase):
    """Tests for choose_active_device."""

    def test_keeps_current_device_when_still_present(self) -> None:
        current_device = cast(object, object())
        other_device = cast(object, object())

        chosen_device = choose_active_device(
            current_device=current_device,
            discovered_devices=[other_device, current_device],
            allow_auto_connect_single=False,
        )

        self.assertIs(chosen_device, current_device)

    def test_auto_connects_single_device_when_enabled(self) -> None:
        discovered_device = cast(object, object())

        chosen_device = choose_active_device(
            current_device=None,
            discovered_devices=[discovered_device],
            allow_auto_connect_single=True,
        )

        self.assertIs(chosen_device, discovered_device)

    def test_does_not_auto_connect_single_device_when_disabled(self) -> None:
        discovered_device = cast(object, object())

        chosen_device = choose_active_device(
            current_device=None,
            discovered_devices=[discovered_device],
            allow_auto_connect_single=False,
        )

        self.assertIsNone(chosen_device)

    def test_returns_none_when_no_devices_discovered(self) -> None:
        chosen_device = choose_active_device(
            current_device=None,
            discovered_devices=[],
            allow_auto_connect_single=True,
        )

        self.assertIsNone(chosen_device)
