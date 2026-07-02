"""
Unit tests for DRPD trigger sync mode handling.
"""

import unittest
from unittest.mock import AsyncMock, MagicMock

from t76.drpd.device.device_trigger import DeviceTrigger
from t76.drpd.device.types import (
    TriggerMessageTypeFilter,
    TriggerMessageTypeFilterClass,
    TriggerSenderFilter,
    TriggerSyncMode,
)


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

    async def test_sender_filter_methods(self) -> None:
        internal = MagicMock()
        internal.write_ascii_and_check = AsyncMock(return_value=None)
        internal.query_ascii_values_and_check = AsyncMock(return_value=["CABLE"])
        trigger = DeviceTrigger(internal)

        await trigger.set_sender_filter(TriggerSenderFilter.SOURCE)
        sender = await trigger.get_sender_filter()

        internal.write_ascii_and_check.assert_awaited_once_with(
            "TRIG:EV:SENDER SOURCE"
        )
        self.assertEqual(sender, TriggerSenderFilter.CABLE)

    async def test_message_type_filter_methods(self) -> None:
        internal = MagicMock()
        internal.write_ascii_and_check = AsyncMock(return_value=None)
        internal.query_ascii_values_and_check = AsyncMock(
            return_value=["CONTROL:3 DATA:2"]
        )
        trigger = DeviceTrigger(internal)
        filters = [
            TriggerMessageTypeFilter(
                TriggerMessageTypeFilterClass.CONTROL,
                3,
            ),
            TriggerMessageTypeFilter(
                TriggerMessageTypeFilterClass.DATA,
                2,
            ),
        ]

        await trigger.set_message_type_filters(filters)
        parsed = await trigger.get_message_type_filters()

        internal.write_ascii_and_check.assert_any_await(
            "TRIG:EV:MSGTYPE:FILTER:CLEAR"
        )
        internal.write_ascii_and_check.assert_any_await(
            "TRIG:EV:MSGTYPE:FILTER 0 CONTROL:3"
        )
        internal.write_ascii_and_check.assert_any_await(
            "TRIG:EV:MSGTYPE:FILTER 1 DATA:2"
        )
        self.assertEqual(parsed, filters)
