"""
Unit tests for protected TEST:* SCPI wrappers.
"""

import unittest
from unittest.mock import AsyncMock, MagicMock

from t76.drpd.device.device_test import DeviceTest
from t76.drpd.device.types import (
    DiagnosticCCChannel,
    DiagnosticCCRole,
    OnOffStatus,
)


class TestDeviceTest(unittest.IsolatedAsyncioTestCase):
    """Verify TEST:* command wrappers."""

    async def test_vbus_manager_methods(self) -> None:
        internal = MagicMock()
        internal.write_ascii_and_check = AsyncMock()
        internal.query_ascii_values_and_check = AsyncMock(return_value=["ON"])
        test = DeviceTest(internal)

        await test.set_vbus_manager_state(OnOffStatus.ON)
        state = await test.get_vbus_manager_state()

        internal.write_ascii_and_check.assert_awaited_once_with(
            "TEST:VBUSMAN:EN ON"
        )
        self.assertEqual(state, OnOffStatus.ON)

    async def test_cc_role_methods_use_firmware_tokens(self) -> None:
        internal = MagicMock()
        internal.write_ascii_and_check = AsyncMock()
        internal.query_ascii_values_and_check = AsyncMock(
            return_value=["SOURCE_1_5A"]
        )
        test = DeviceTest(internal)

        await test.set_cc1_role(DiagnosticCCRole.SOURCE_1_5A)
        role = await test.get_cc1_role()

        internal.write_ascii_and_check.assert_awaited_once_with(
            "TEST:CCROLE:CC1 SOURCE_1_5A"
        )
        self.assertEqual(role, DiagnosticCCRole.SOURCE_1_5A)

    async def test_channel_and_mux_methods(self) -> None:
        internal = MagicMock()
        internal.write_ascii_and_check = AsyncMock()
        internal.query_ascii_values_and_check = AsyncMock(
            side_effect=[["CC2"], ["OFF"]]
        )
        test = DeviceTest(internal)

        await test.set_dut_channel(DiagnosticCCChannel.CC2)
        channel = await test.get_dut_channel()
        await test.set_cc_mux_state(OnOffStatus.OFF)
        mux_state = await test.get_cc_mux_state()

        self.assertEqual(channel, DiagnosticCCChannel.CC2)
        self.assertEqual(mux_state, OnOffStatus.OFF)
        internal.write_ascii_and_check.assert_any_await(
            "TEST:CCBUS:DUT:CHANNEL CC2"
        )
        internal.write_ascii_and_check.assert_any_await(
            "TEST:CCBUS:MUX OFF"
        )
