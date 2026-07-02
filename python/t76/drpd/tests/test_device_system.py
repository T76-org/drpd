"""
Unit tests for DRPD system command group.
"""

import unittest
from unittest.mock import AsyncMock, MagicMock

from t76.drpd.device.device_internal import DeviceInternal
from t76.drpd.device.device_system import DeviceSystem


class TestDeviceSystem(unittest.IsolatedAsyncioTestCase):
    """Verify system SCPI wrappers."""

    async def test_reset_writes_rst(self) -> None:
        internal = MagicMock()
        internal.write_ascii_and_check = AsyncMock()
        system = DeviceSystem(internal)

        await system.reset()

        internal.write_ascii_and_check.assert_awaited_once_with("*RST")

    async def test_get_hardware_revision(self) -> None:
        internal = MagicMock()
        internal.query_ascii_values_and_check = AsyncMock(return_value=["R2605-A"])
        system = DeviceSystem(internal)

        self.assertEqual(await system.get_hardware_revision(), "R2605-A")

        internal.query_ascii_values_and_check.assert_awaited_once_with(
            "SYST:HW:REV?",
            DeviceInternal.parse_scpi_string,
        )

    async def test_enter_firmware_updater(self) -> None:
        internal = MagicMock()
        internal.write_ascii_and_check = AsyncMock()
        system = DeviceSystem(internal)

        await system.enter_firmware_updater()

        internal.write_ascii_and_check.assert_awaited_once_with(
            "SYST:FIRM:UPD"
        )
