"""
Unit tests for DRPD analog monitor parsing.
"""

import unittest
from unittest.mock import AsyncMock, MagicMock

from t76.drpd.device.device_analog_monitor import DeviceAnalogMonitor


class TestDeviceAnalogMonitor(unittest.IsolatedAsyncioTestCase):
    """Verify analog monitor response parsing."""

    async def test_get_accumulated_measurements(self) -> None:
        internal = MagicMock()
        internal.query_ascii_values_and_check = AsyncMock(
            return_value=["2500", "12", "34"]
        )
        analog_monitor = DeviceAnalogMonitor(internal)

        counters = await analog_monitor.get_accumulated_measurements()

        self.assertEqual(counters.accumulation_elapsed_time_us, 2500)
        self.assertEqual(counters.accumulated_charge_mah, 12)
        self.assertEqual(counters.accumulated_energy_mwh, 34)
        internal.query_ascii_values_and_check.assert_awaited_once_with(
            "MEAS:ACC?",
        )

    async def test_reset_accumulated_measurements(self) -> None:
        internal = MagicMock()
        internal.write_ascii_and_check = AsyncMock()
        analog_monitor = DeviceAnalogMonitor(internal)

        await analog_monitor.reset_accumulated_measurements()

        internal.write_ascii_and_check.assert_awaited_once_with(
            "MEAS:ACC:RESET"
        )

    async def test_individual_measurement_queries(self) -> None:
        internal = MagicMock()
        internal.query_ascii_values_and_check = AsyncMock(return_value=[5.25])
        analog_monitor = DeviceAnalogMonitor(internal)

        self.assertEqual(await analog_monitor.get_vbus_voltage(), 5.25)

        internal.query_ascii_values_and_check.assert_awaited_once_with(
            "MEAS:VOLT:VBUS?",
            "f",
        )

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

    async def test_set_vbus_calibration_table_point_writes_expected_command(
        self,
    ) -> None:
        internal = MagicMock()
        internal.write_ascii_and_check = AsyncMock()
        analog_monitor = DeviceAnalogMonitor(internal)

        await analog_monitor.set_vbus_calibration_table_point(20, -0.125)

        internal.write_ascii_and_check.assert_awaited_once_with(
            "BUS:VBUS:CAL:TAB 20 -0.125"
        )

    async def test_set_vbus_calibration_table_rejects_wrong_length(
        self,
    ) -> None:
        internal = MagicMock()
        analog_monitor = DeviceAnalogMonitor(internal)

        with self.assertRaisesRegex(ValueError, "table must contain 61 entries"):
            await analog_monitor.set_vbus_calibration_table([0.0] * 60)

    async def test_set_vbus_calibration_table_rejects_non_finite_value(
        self,
    ) -> None:
        internal = MagicMock()
        analog_monitor = DeviceAnalogMonitor(internal)

        with self.assertRaisesRegex(ValueError, "correction must be finite"):
            await analog_monitor.set_vbus_calibration_table_point(0, float("nan"))

    async def test_get_raw_vbus_current_returns_single_value(self) -> None:
        internal = MagicMock()
        internal.query_ascii_values_and_check = AsyncMock(return_value=[1.25])

        analog_monitor = DeviceAnalogMonitor(internal)
        current = await analog_monitor.get_raw_vbus_current()

        self.assertEqual(current, 1.25)
        internal.query_ascii_values_and_check.assert_awaited_once_with(
            "MEAS:CURR:VBUS:RAW?",
            "f",
        )

    async def test_get_raw_vbus_current_rejects_wrong_length(self) -> None:
        internal = MagicMock()
        internal.query_ascii_values_and_check = AsyncMock(return_value=[])

        analog_monitor = DeviceAnalogMonitor(internal)

        with self.assertRaisesRegex(ValueError, "Expected 1 field, got 0"):
            await analog_monitor.get_raw_vbus_current()

    async def test_get_vbus_current_calibration_table_parses_all_entries(
        self,
    ) -> None:
        internal = MagicMock()
        internal.query_ascii_values_and_check = AsyncMock(return_value=[
            float(index) / 100.0 for index in range(13)
        ])

        analog_monitor = DeviceAnalogMonitor(internal)
        table = await analog_monitor.get_vbus_current_calibration_table()

        self.assertEqual(len(table), 13)
        self.assertEqual(table[0], 0.0)
        self.assertEqual(table[12], 0.12)
        internal.query_ascii_values_and_check.assert_awaited_once_with(
            "BUS:VBUS:CAL:CURR?",
            "f",
        )

    async def test_get_vbus_current_calibration_table_rejects_wrong_length(
        self,
    ) -> None:
        internal = MagicMock()
        internal.query_ascii_values_and_check = AsyncMock(
            return_value=[0.0] * 12
        )

        analog_monitor = DeviceAnalogMonitor(internal)

        with self.assertRaisesRegex(ValueError, "Expected 13 fields, got 12"):
            await analog_monitor.get_vbus_current_calibration_table()

    async def test_calibrate_vbus_current_bucket_writes_expected_command(
        self,
    ) -> None:
        internal = MagicMock()
        internal.write_ascii_and_check = AsyncMock()
        analog_monitor = DeviceAnalogMonitor(internal)

        await analog_monitor.calibrate_vbus_current_bucket(500)

        internal.write_ascii_and_check.assert_awaited_once_with(
            "BUS:VBUS:CAL:CURR 500"
        )

    async def test_calibrate_vbus_current_bucket_rejects_non_integer_value(
        self,
    ) -> None:
        internal = MagicMock()
        analog_monitor = DeviceAnalogMonitor(internal)

        with self.assertRaisesRegex(ValueError, "target_ma must be an integer"):
            await analog_monitor.calibrate_vbus_current_bucket(500.5)  # type: ignore[arg-type]

    async def test_calibrate_vbus_current_bucket_rejects_out_of_range_value(
        self,
    ) -> None:
        internal = MagicMock()
        analog_monitor = DeviceAnalogMonitor(internal)

        with self.assertRaisesRegex(
            ValueError,
            r"target_ma must be in range \[0, 6000\]",
        ):
            await analog_monitor.calibrate_vbus_current_bucket(6500)

    async def test_calibrate_vbus_current_bucket_rejects_unaligned_value(
        self,
    ) -> None:
        internal = MagicMock()
        analog_monitor = DeviceAnalogMonitor(internal)

        with self.assertRaisesRegex(
            ValueError,
            "target_ma must be aligned to a 500 mA interval",
        ):
            await analog_monitor.calibrate_vbus_current_bucket(750)

    async def test_reset_vbus_current_calibration_to_defaults_writes_expected_command(
        self,
    ) -> None:
        internal = MagicMock()
        internal.write_ascii_and_check = AsyncMock()
        analog_monitor = DeviceAnalogMonitor(internal)

        await analog_monitor.reset_vbus_current_calibration_to_defaults()

        internal.write_ascii_and_check.assert_awaited_once_with(
            "BUS:VBUS:CAL:CURR:DEF"
        )

    async def test_set_vbus_current_calibration_table_point_writes_expected_command(
        self,
    ) -> None:
        internal = MagicMock()
        internal.write_ascii_and_check = AsyncMock()
        analog_monitor = DeviceAnalogMonitor(internal)

        await analog_monitor.set_vbus_current_calibration_table_point(500, 0.625)

        internal.write_ascii_and_check.assert_awaited_once_with(
            "BUS:VBUS:CAL:CURR:TAB 500 0.625"
        )

    async def test_set_vbus_current_calibration_table_rejects_wrong_length(
        self,
    ) -> None:
        internal = MagicMock()
        analog_monitor = DeviceAnalogMonitor(internal)

        with self.assertRaisesRegex(ValueError, "table must contain 13 entries"):
            await analog_monitor.set_vbus_current_calibration_table([0.0] * 12)

    async def test_set_vbus_current_calibration_table_rejects_negative_value(
        self,
    ) -> None:
        internal = MagicMock()
        analog_monitor = DeviceAnalogMonitor(internal)

        with self.assertRaisesRegex(ValueError, "raw_current_a must be non-negative"):
            await analog_monitor.set_vbus_current_calibration_table_point(0, -0.01)

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
