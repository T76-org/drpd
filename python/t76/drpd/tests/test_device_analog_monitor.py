"""
Unit tests for DRPD analog monitor parsing.
"""

import unittest
from unittest.mock import AsyncMock, MagicMock

from t76.drpd.device.device_analog_monitor import DeviceAnalogMonitor


class TestDeviceAnalogMonitor(unittest.IsolatedAsyncioTestCase):
    """Verify analog monitor response parsing."""

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

