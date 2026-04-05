"""
Copyright (c) 2025 MTA, Inc.

Unit tests for the DeviceSink class.
"""

import unittest
from unittest.mock import AsyncMock

from t76.drpd.device.device_sink import DeviceSink
from t76.drpd.device.device_sink_pdos import (
    BatteryPDO,
    FixedPDO,
    VariablePDO,
)
from t76.drpd.device.types import SinkState


class TestDeviceSinkModeValidation(unittest.IsolatedAsyncioTestCase):
    """Tests for sink mode validation."""

    async def asyncSetUp(self) -> None:
        """Set up test fixtures."""
        self.mock_internal = AsyncMock()
        self.device_sink = DeviceSink(self.mock_internal)

    async def test_validate_sink_mode_success(self) -> None:
        """Test successful validation when device is in SINK mode."""
        self.mock_internal.query_ascii_values_and_check.return_value = [
            "SINK"
        ]

        # Should not raise
        await self.device_sink._validate_sink_mode()

    async def test_validate_sink_mode_fails_when_disabled(self) -> None:
        """Test validation fails when device is in DISABLED mode."""
        self.mock_internal.query_ascii_values_and_check.return_value = [
            "DISABLED"
        ]

        with self.assertRaises(RuntimeError) as context:
            await self.device_sink._validate_sink_mode()

        self.assertIn("SINK mode", str(context.exception))
        self.assertIn("DISABLED", str(context.exception))

    async def test_validate_sink_mode_fails_when_observer(self) -> None:
        """Test validation fails when device is in OBSERVER mode."""
        self.mock_internal.query_ascii_values_and_check.return_value = [
            "OBSERVER"
        ]

        with self.assertRaises(RuntimeError) as context:
            await self.device_sink._validate_sink_mode()

        self.assertIn("SINK mode", str(context.exception))
        self.assertIn("OBSERVER", str(context.exception))


class TestDeviceSinkConfigMethods(unittest.IsolatedAsyncioTestCase):
    """Tests for configuration methods."""

    async def asyncSetUp(self) -> None:
        """Set up test fixtures."""
        self.mock_internal = AsyncMock()
        self.device_sink = DeviceSink(self.mock_internal)

    async def test_load_config(self) -> None:
        """Test load_config stub method."""
        config = {
            "some_key": "some_value",
            "another_key": 123,
        }

        # Should not raise and should be idempotent
        await self.device_sink.load_config(config)

    async def test_save_config(self) -> None:
        """Test save_config stub method returns empty dict."""
        result = await self.device_sink.save_config()
        self.assertEqual(result, {})


class TestDeviceSinkPDOQueries(unittest.IsolatedAsyncioTestCase):
    """Tests for PDO query methods."""

    async def asyncSetUp(self) -> None:
        """Set up test fixtures."""
        self.mock_internal = AsyncMock()
        self.device_sink = DeviceSink(self.mock_internal)

    async def test_get_pdo_count(self) -> None:
        """Test getting PDO count."""
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["SINK"],  # Mode validation
            ["5"],  # PDO count query
        ]

        count = await self.device_sink.get_pdo_count()

        self.assertEqual(count, 5)
        self.assertEqual(
            self.mock_internal.query_ascii_values_and_check.call_count, 2
        )

    async def test_get_pdo_count_mode_validation(self) -> None:
        """Test PDO count fails if device not in SINK mode."""
        self.mock_internal.query_ascii_values_and_check.return_value = [
            "OBSERVER"
        ]

        with self.assertRaises(RuntimeError):
            await self.device_sink.get_pdo_count()

    async def test_get_pdo_at_index_fixed(self) -> None:
        """Test getting a Fixed PDO at specific index."""
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["SINK"],  # Mode validation
            "FIXED,5.0,3.0".split(","),  # PDO query
        ]

        pdo = await self.device_sink.get_pdo_at_index(0)

        self.assertIsInstance(pdo, FixedPDO)
        assert isinstance(pdo, FixedPDO)
        self.assertEqual(pdo.voltage, 5.0)
        self.assertEqual(pdo.max_current, 3.0)

    async def test_get_pdo_at_index_variable(self) -> None:
        """Test getting a Variable PDO at specific index."""
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["SINK"],  # Mode validation
            "VARIABLE,5.0,20.0,3.0".split(","),  # PDO query
        ]

        pdo = await self.device_sink.get_pdo_at_index(1)

        self.assertIsInstance(pdo, VariablePDO)
        assert isinstance(pdo, VariablePDO)
        self.assertEqual(pdo.min_voltage, 5.0)
        self.assertEqual(pdo.max_voltage, 20.0)
        self.assertEqual(pdo.max_current, 3.0)

    async def test_get_pdo_at_index_battery(self) -> None:
        """Test getting a Battery PDO at specific index."""
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["SINK"],  # Mode validation
            "BATTERY,10.0,48.0,100.0".split(","),  # PDO query
        ]

        pdo = await self.device_sink.get_pdo_at_index(2)

        self.assertIsInstance(pdo, BatteryPDO)
        assert isinstance(pdo, BatteryPDO)
        self.assertEqual(pdo.min_voltage, 10.0)
        self.assertEqual(pdo.max_voltage, 48.0)
        self.assertEqual(pdo.max_power, 100.0)

    async def test_get_pdo_at_index_spr_pps(self) -> None:
        """Test getting an SPR PPS PDO at specific index."""
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["SINK"],  # Mode validation
            "SPR_PPS,5.0,21.0,5.0".split(","),  # PDO query
        ]

        pdo = await self.device_sink.get_pdo_at_index(3)

        from t76.drpd.device.device_sink_pdos import SPR_PDOPPS
        self.assertIsInstance(pdo, SPR_PDOPPS)
        assert isinstance(pdo, SPR_PDOPPS)
        self.assertEqual(pdo.min_voltage, 5.0)
        self.assertEqual(pdo.max_voltage, 21.0)
        self.assertEqual(pdo.max_current, 5.0)

    async def test_get_pdo_at_index_mode_validation(self) -> None:
        """Test PDO query fails if device not in SINK mode."""
        self.mock_internal.query_ascii_values_and_check.return_value = [
            "DISABLED"
        ]

        with self.assertRaises(RuntimeError):
            await self.device_sink.get_pdo_at_index(0)


class TestDeviceSinkPDORequest(unittest.IsolatedAsyncioTestCase):
    """Tests for PDO request methods."""

    async def asyncSetUp(self) -> None:
        """Set up test fixtures."""
        self.mock_internal = AsyncMock()
        self.device_sink = DeviceSink(self.mock_internal)

    async def test_set_pdo(self) -> None:
        """Test requesting a Fixed Supply PDO."""
        self.mock_internal.query_ascii_values_and_check.return_value = [
            "SINK"
        ]

        await self.device_sink.set_pdo(index=0, voltage_mv=5000, current_ma=3000)

        self.mock_internal.write_ascii_and_check.assert_called_once_with(
            "SINK:PDO 0 5000 3000"
        )

    async def test_set_pdo_with_zero_current(self) -> None:
        """Test requesting max current with 0 mA."""
        self.mock_internal.query_ascii_values_and_check.return_value = [
            "SINK"
        ]

        await self.device_sink.set_pdo(index=2, voltage_mv=15000, current_ma=0)

        self.mock_internal.write_ascii_and_check.assert_called_once_with(
            "SINK:PDO 2 15000 0"
        )

    async def test_set_pdo_mode_validation(self) -> None:
        """Test PDO request fails if device not in SINK mode."""
        self.mock_internal.query_ascii_values_and_check.return_value = [
            "OBSERVER"
        ]

        with self.assertRaises(RuntimeError):
            await self.device_sink.set_pdo(index=0, voltage_mv=5000, current_ma=3000)

        self.mock_internal.write_ascii_and_check.assert_not_called()


class TestDeviceSinkStatusQueries(unittest.IsolatedAsyncioTestCase):
    """Tests for sink status query methods."""

    async def asyncSetUp(self) -> None:
        """Set up test fixtures."""
        self.mock_internal = AsyncMock()
        self.device_sink = DeviceSink(self.mock_internal)

    async def test_get_status_disconnected(self) -> None:
        """Test getting DISCONNECTED status."""
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["SINK"],  # Mode validation
            ["DISCONNECTED"],  # Status query
        ]

        status = await self.device_sink.get_status()

        self.assertEqual(status, SinkState.DISCONNECTED)

    async def test_get_status_pe_snk_startup(self) -> None:
        """Test getting PE_SNK_STARTUP status."""
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["SINK"],  # Mode validation
            ["PE_SNK_STARTUP"],  # Status query
        ]

        status = await self.device_sink.get_status()

        self.assertEqual(status, SinkState.PE_SNK_STARTUP)

    async def test_get_status_pe_snk_ready(self) -> None:
        """Test getting PE_SNK_READY status."""
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["SINK"],  # Mode validation
            ["PE_SNK_READY"],  # Status query
        ]

        status = await self.device_sink.get_status()

        self.assertEqual(status, SinkState.PE_SNK_READY)

    async def test_get_status_pe_snk_transition_sink(self) -> None:
        """Test getting PE_SNK_TRANSITION_SINK status."""
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["SINK"],  # Mode validation
            ["PE_SNK_TRANSITION_SINK"],  # Status query
        ]

        status = await self.device_sink.get_status()

        self.assertEqual(status, SinkState.PE_SNK_TRANSITION_SINK)

    async def test_get_status_error(self) -> None:
        """Test getting ERROR status."""
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["SINK"],  # Mode validation
            ["ERROR"],  # Status query
        ]

        status = await self.device_sink.get_status()

        self.assertEqual(status, SinkState.ERROR)

    async def test_get_status_mode_validation(self) -> None:
        """Test status query fails if device not in SINK mode."""
        self.mock_internal.query_ascii_values_and_check.return_value = [
            "OBSERVER"
        ]

        with self.assertRaises(RuntimeError):
            await self.device_sink.get_status()

    async def test_get_negotiated_pdo_fixed(self) -> None:
        """Test getting negotiated Fixed PDO."""
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["SINK"],  # Mode validation
            "FIXED,5.0,3.0".split(","),  # PDO query
        ]

        pdo = await self.device_sink.get_negotiated_pdo()

        self.assertIsInstance(pdo, FixedPDO)
        assert isinstance(pdo, FixedPDO)
        self.assertEqual(pdo.voltage, 5.0)

    async def test_get_negotiated_pdo_mode_validation(self) -> None:
        """Test negotiated PDO query fails if not in SINK mode."""
        self.mock_internal.query_ascii_values_and_check.return_value = [
            "DISABLED"
        ]

        with self.assertRaises(RuntimeError):
            await self.device_sink.get_negotiated_pdo()

    async def test_get_negotiated_voltage(self) -> None:
        """Test getting negotiated voltage."""
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["SINK"],  # Mode validation
            ["5000"],  # Voltage query in millivolts
        ]

        voltage = await self.device_sink.get_negotiated_voltage()

        self.assertEqual(voltage, 5000)
        self.assertIsInstance(voltage, int)

    async def test_get_negotiated_voltage_high_value(self) -> None:
        """Test getting high negotiated voltage."""
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["SINK"],  # Mode validation
            ["48000"],  # Voltage query in millivolts
        ]

        voltage = await self.device_sink.get_negotiated_voltage()

        self.assertEqual(voltage, 48000)

    async def test_get_negotiated_voltage_mode_validation(self) -> None:
        """Test voltage query fails if device not in SINK mode."""
        self.mock_internal.query_ascii_values_and_check.return_value = [
            "OBSERVER"
        ]

        with self.assertRaises(RuntimeError):
            await self.device_sink.get_negotiated_voltage()

    async def test_get_negotiated_current(self) -> None:
        """Test getting negotiated current."""
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["SINK"],  # Mode validation
            ["3000"],  # Current query in milliamps
        ]

        current = await self.device_sink.get_negotiated_current()

        self.assertEqual(current, 3000)
        self.assertIsInstance(current, int)

    async def test_get_negotiated_current_high_value(self) -> None:
        """Test getting high negotiated current."""
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["SINK"],  # Mode validation
            ["5500"],  # Current query in milliamps
        ]

        current = await self.device_sink.get_negotiated_current()

        self.assertEqual(current, 5500)

    async def test_get_negotiated_current_mode_validation(self) -> None:
        """Test current query fails if device not in SINK mode."""
        self.mock_internal.query_ascii_values_and_check.return_value = [
            "OBSERVER"
        ]

        with self.assertRaises(RuntimeError):
            await self.device_sink.get_negotiated_current()

    async def test_get_error_status_no_error(self) -> None:
        """Test getting error status when no error."""
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["SINK"],  # Mode validation
            ["0"],  # Error status query
        ]

        error_status = await self.device_sink.get_error_status()

        self.assertFalse(error_status)

    async def test_get_error_status_with_error(self) -> None:
        """Test getting error status when error exists."""
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["SINK"],  # Mode validation
            ["1"],  # Error status query
        ]

        error_status = await self.device_sink.get_error_status()

        self.assertTrue(error_status)

    async def test_get_error_status_mode_validation(self) -> None:
        """Test error status query fails if not in SINK mode."""
        self.mock_internal.query_ascii_values_and_check.return_value = [
            "DISABLED"
        ]

        with self.assertRaises(RuntimeError):
            await self.device_sink.get_error_status()


if __name__ == "__main__":
    unittest.main()
