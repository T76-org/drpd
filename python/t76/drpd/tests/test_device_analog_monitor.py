"""
Unit tests for DRPD analog monitor parsing.
"""

import unittest
from unittest.mock import AsyncMock, MagicMock

from t76.drpd.device.device_analog_monitor import DeviceAnalogMonitor


class TestDeviceAnalogMonitor(unittest.IsolatedAsyncioTestCase):
    """Verify analog monitor response parsing."""

    async def test_get_vbus_calibration_table_parses_all_entries(self) -> None:
        internal = MagicMock()
        internal.query_ascii_values_and_check = AsyncMock(return_value=[
            float(index) / 10.0 for index in range(61)
        ])

        analog_monitor = DeviceAnalogMonitor(internal)
        table = await analog_monitor.get_vbus_calibration_table()

        self.assertEqual(len(table), 61)
        self.assertEqual(table[0], 0.0)
        self.assertEqual(table[60], 6.0)
        internal.query_ascii_values_and_check.assert_awaited_once_with(
            "BUS:VBUS:CAL?",
            "f",
        )

    async def test_get_vbus_calibration_table_rejects_wrong_length(self) -> None:
        internal = MagicMock()
        internal.query_ascii_values_and_check = AsyncMock(
            return_value=[0.0] * 60
        )

        analog_monitor = DeviceAnalogMonitor(internal)

        with self.assertRaisesRegex(ValueError, "Expected 61 fields, got 60"):
            await analog_monitor.get_vbus_calibration_table()

    async def test_calibrate_vbus_bucket_writes_expected_command(self) -> None:
        internal = MagicMock()
        internal.write_ascii_and_check = AsyncMock()
        analog_monitor = DeviceAnalogMonitor(internal)

        await analog_monitor.calibrate_vbus_bucket(20)

        internal.write_ascii_and_check.assert_awaited_once_with(
            "BUS:VBUS:CAL 20"
        )

    async def test_calibrate_vbus_bucket_rejects_non_integer_value(self) -> None:
        internal = MagicMock()
        analog_monitor = DeviceAnalogMonitor(internal)

        with self.assertRaisesRegex(ValueError, "bucket must be an integer"):
            await analog_monitor.calibrate_vbus_bucket(2.5)  # type: ignore[arg-type]

    async def test_calibrate_vbus_bucket_rejects_out_of_range_value(self) -> None:
        internal = MagicMock()
        analog_monitor = DeviceAnalogMonitor(internal)

        with self.assertRaisesRegex(
            ValueError,
            r"bucket must be in range \[0, 60\]",
        ):
            await analog_monitor.calibrate_vbus_bucket(61)

    async def test_reset_vbus_calibration_to_defaults_writes_expected_command(
        self,
    ) -> None:
        internal = MagicMock()
        internal.write_ascii_and_check = AsyncMock()
        analog_monitor = DeviceAnalogMonitor(internal)

        await analog_monitor.reset_vbus_calibration_to_defaults()

        internal.write_ascii_and_check.assert_awaited_once_with(
            "BUS:VBUS:CAL:DEF"
        )

    async def test_get_status_parses_accumulation_fields(self) -> None:
        internal = MagicMock()
        internal.query_ascii_values_and_check = AsyncMock(return_value=[
            "123456",
            "5.00",
            "0.12",
            "0.33",
            "0.00",
            "0.33",
            "0.00",
            "1.20",
            "0.00",
            "0.60",
            "2500",
            "12",
            "34",
        ])

        analog_monitor = DeviceAnalogMonitor(internal)

        status = await analog_monitor.get_status()

        self.assertEqual(status.vbus_timestamp_us, 123456)
        self.assertEqual(status.accumulation_elapsed_time_us, 2500)
        self.assertEqual(status.accumulated_charge_mah, 12)
        self.assertEqual(status.accumulated_energy_mwh, 34)
