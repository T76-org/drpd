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

    async def test_bmc_decoder_configuration_commands(self) -> None:
        internal = MagicMock()
        internal.query_ascii_values_and_check = AsyncMock(
            side_effect=[["0.4"], ["100000"]]
        )
        internal.write_ascii_and_check = AsyncMock()
        configuration = DeviceSystem(internal).configuration.bmc_decoder

        self.assertEqual(await configuration.get_cc_vref_voltage(), 0.4)
        self.assertEqual(
            await configuration.get_cc_vref_pwm_frequency_hz(),
            100_000,
        )
        await configuration.set_cc_vref_voltage(0.45)
        await configuration.set_cc_vref_pwm_frequency_hz(101_000)
        await configuration.reset_cc_vref_voltage()
        await configuration.reset_cc_vref_pwm_frequency_hz()

        self.assertEqual(
            [call.args[0] for call in internal.write_ascii_and_check.await_args_list],
            [
                "SYST:CONF:PHY:BMCD:CC:VREF:VOLT 0.45",
                "SYST:CONF:PHY:BMCD:CC:VREF:PWM:FREQ 101000",
                "SYST:CONF:PHY:BMCD:CC:VREF:VOLT:RES",
                "SYST:CONF:PHY:BMCD:CC:VREF:PWM:FREQ:RES",
            ],
        )

    async def test_bmc_decoder_configuration_rejects_invalid_values(self) -> None:
        internal = MagicMock()
        internal.write_ascii_and_check = AsyncMock()
        configuration = DeviceSystem(internal).configuration.bmc_decoder

        with self.assertRaises(ValueError):
            await configuration.set_cc_vref_voltage(0.23)
        with self.assertRaises(ValueError):
            await configuration.set_cc_vref_voltage(float("inf"))
        with self.assertRaises(ValueError):
            await configuration.set_cc_vref_pwm_frequency_hz(10_500)

        internal.write_ascii_and_check.assert_not_awaited()
