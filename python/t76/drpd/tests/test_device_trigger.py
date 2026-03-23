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

    async def test_set_sync_mode_writes_scpi_command(self) -> None:
        internal = MagicMock()
        internal.write_ascii_and_check = AsyncMock(return_value=None)
        trigger = DeviceTrigger(internal)

        await trigger.set_sync_mode(TriggerSyncMode.PULL_DOWN)

        internal.write_ascii_and_check.assert_awaited_once_with("TRIG:SYNC:MODE PULL_DOWN")
