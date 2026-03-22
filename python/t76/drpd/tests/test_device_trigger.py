"""
Unit tests for DRPD trigger sync mode handling.
"""

import unittest
from unittest.mock import AsyncMock, MagicMock

from t76.drpd.device.device_trigger import DeviceTrigger
from t76.drpd.device.types import TriggerSyncMode


class TestDeviceTrigger(unittest.IsolatedAsyncioTestCase):
    """Verify trigger sync mode parsing and fallback behavior."""

    def test_trigger_sync_mode_from_string_accepts_pull_down(self) -> None:
        self.assertEqual(TriggerSyncMode.from_string("PULL_DOWN"), TriggerSyncMode.PULL_DOWN)

    async def test_load_config_falls_back_to_pulse_high_for_invalid_sync_mode(self) -> None:
        internal = MagicMock()
        internal.write_ascii_and_check = AsyncMock(return_value=None)
        trigger = DeviceTrigger(internal)

        await trigger.load_config({
            DeviceTrigger.SYNC_MODE_CONFIG_KEY: "OFF",
        })

        internal.write_ascii_and_check.assert_awaited_once_with("TRIG:SYNC:MODE PULSE_HIGH")
