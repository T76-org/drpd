"""
Copyright (c) 2025 MTA, Inc.

Unit tests for the device_sink_pdos module.
"""

import unittest

from t76.drpd.device.device_sink_pdos import (
    BatteryPDO,
    DeviceSinkPDO,
    EPR_PDOAVs,
    FixedPDO,
    SPR_PDOAVs,
    SPR_PDOPPS,
    VariablePDO,
)


class TestFixedPDOParsing(unittest.TestCase):
    """Tests for Fixed PDO parsing from SCPI responses."""

    def test_parse_fixed_pdo(self) -> None:
        """Test parsing a valid Fixed PDO response."""
        response = "FIXED,5.0,3.0".split(",")
        pdo = DeviceSinkPDO.from_response(response)

        self.assertIsInstance(pdo, FixedPDO)
        assert isinstance(pdo, FixedPDO)
        self.assertEqual(pdo.voltage, 5.0)
        self.assertEqual(pdo.max_current, 3.0)

    def test_parse_fixed_pdo_with_whitespace(self) -> None:
        """Test parsing with extra whitespace."""
        response = "FIXED, 20.0 , 5.0".split(",")
        pdo = DeviceSinkPDO.from_response(response)

        self.assertIsInstance(pdo, FixedPDO)
        assert isinstance(pdo, FixedPDO)
        self.assertEqual(pdo.voltage, 20.0)
        self.assertEqual(pdo.max_current, 5.0)

    def test_parse_fixed_pdo_lowercase(self) -> None:
        """Test parsing with lowercase PDO type."""
        response = "fixed,9.0,2.25".split(",")
        pdo = DeviceSinkPDO.from_response(response)

        self.assertIsInstance(pdo, FixedPDO)
        assert isinstance(pdo, FixedPDO)
        self.assertEqual(pdo.voltage, 9.0)
        self.assertEqual(pdo.max_current, 2.25)

    def test_fixed_pdo_to_dict(self) -> None:
        """Test Fixed PDO serialization."""
        pdo = FixedPDO(voltage=15.0, max_current=4.5)
        result = pdo.to_dict()

        self.assertEqual(result["type"], "FIXED")
        self.assertEqual(result["voltage_v"], 15.0)
        self.assertEqual(result["max_current_a"], 4.5)

    def test_fixed_pdo_string_representation(self) -> None:
        """Test Fixed PDO string representation."""
        pdo = FixedPDO(voltage=5.0, max_current=3.0)
        result = str(pdo)

        self.assertIn("FixedPDO", result)
        self.assertIn("5.00V", result)
        self.assertIn("3.000A", result)

    def test_fixed_pdo_wrong_value_count(self) -> None:
        """Test error on wrong number of values."""
        response = "FIXED,5.0".split(",")

        with self.assertRaises(ValueError) as ctx:
            DeviceSinkPDO.from_response(response)

        self.assertIn("FIXED PDO requires 3 values", str(ctx.exception))


class TestVariablePDOParsing(unittest.TestCase):
    """Tests for Variable PDO parsing from SCPI responses."""

    def test_parse_variable_pdo(self) -> None:
        """Test parsing a valid Variable PDO response."""
        response = "VARIABLE,5.0,20.0,5.0".split(",")
        pdo = DeviceSinkPDO.from_response(response)

        self.assertIsInstance(pdo, VariablePDO)
        assert isinstance(pdo, VariablePDO)
        self.assertEqual(pdo.min_voltage, 5.0)
        self.assertEqual(pdo.max_voltage, 20.0)
        self.assertEqual(pdo.max_current, 5.0)

    def test_parse_variable_pdo_with_whitespace(self) -> None:
        """Test parsing with extra whitespace."""
        response = "VARIABLE, 5.0 , 20.0 , 3.0".split(",")
        pdo = DeviceSinkPDO.from_response(response)

        self.assertIsInstance(pdo, VariablePDO)
        assert isinstance(pdo, VariablePDO)
        self.assertEqual(pdo.min_voltage, 5.0)
        self.assertEqual(pdo.max_voltage, 20.0)
        self.assertEqual(pdo.max_current, 3.0)

    def test_variable_pdo_to_dict(self) -> None:
        """Test Variable PDO serialization."""
        pdo = VariablePDO(
            min_voltage=5.0,
            max_voltage=15.0,
            max_current=2.25,
        )
        result = pdo.to_dict()

        self.assertEqual(result["type"], "VARIABLE")
        self.assertEqual(result["min_voltage_v"], 5.0)
        self.assertEqual(result["max_voltage_v"], 15.0)
        self.assertEqual(result["max_current_a"], 2.25)

    def test_variable_pdo_string_representation(self) -> None:
        """Test Variable PDO string representation."""
        pdo = VariablePDO(
            min_voltage=5.0,
            max_voltage=20.0,
            max_current=3.0,
        )
        result = str(pdo)

        self.assertIn("VariablePDO", result)
        self.assertIn("5.00V", result)
        self.assertIn("20.00V", result)
        self.assertIn("3.000A", result)

    def test_variable_pdo_wrong_value_count(self) -> None:
        """Test error on wrong number of values."""
        response = "VARIABLE,5.0,20.0".split(",")

        with self.assertRaises(ValueError) as ctx:
            DeviceSinkPDO.from_response(response)

        self.assertIn("VARIABLE PDO requires 4 values", str(ctx.exception))


class TestBatteryPDOParsing(unittest.TestCase):
    """Tests for Battery PDO parsing from SCPI responses."""

    def test_parse_battery_pdo(self) -> None:
        """Test parsing a valid Battery PDO response."""
        response = "BATTERY,5.0,20.0,100.0".split(",")
        pdo = DeviceSinkPDO.from_response(response)

        self.assertIsInstance(pdo, BatteryPDO)
        assert isinstance(pdo, BatteryPDO)
        self.assertEqual(pdo.min_voltage, 5.0)
        self.assertEqual(pdo.max_voltage, 20.0)
        self.assertEqual(pdo.max_power, 100.0)

    def test_parse_battery_pdo_with_whitespace(self) -> None:
        """Test parsing with extra whitespace."""
        response = "BATTERY, 3.3 , 10.8 , 50.0".split(",")
        pdo = DeviceSinkPDO.from_response(response)

        self.assertIsInstance(pdo, BatteryPDO)
        assert isinstance(pdo, BatteryPDO)
        self.assertEqual(pdo.min_voltage, 3.3)
        self.assertEqual(pdo.max_voltage, 10.8)
        self.assertEqual(pdo.max_power, 50.0)

    def test_battery_pdo_to_dict(self) -> None:
        """Test Battery PDO serialization."""
        pdo = BatteryPDO(
            min_voltage=5.0,
            max_voltage=20.0,
            max_power=100.0,
        )
        result = pdo.to_dict()

        self.assertEqual(result["type"], "BATTERY")
        self.assertEqual(result["min_voltage_v"], 5.0)
        self.assertEqual(result["max_voltage_v"], 20.0)
        self.assertEqual(result["max_power_w"], 100.0)

    def test_battery_pdo_string_representation(self) -> None:
        """Test Battery PDO string representation."""
        pdo = BatteryPDO(
            min_voltage=5.0,
            max_voltage=20.0,
            max_power=100.0,
        )
        result = str(pdo)

        self.assertIn("BatteryPDO", result)
        self.assertIn("5.00V", result)
        self.assertIn("20.00V", result)
        self.assertIn("100.00W", result)

    def test_battery_pdo_wrong_value_count(self) -> None:
        """Test error on wrong number of values."""
        response = "BATTERY,5.0,20.0,100.0,50.0".split(",")

        with self.assertRaises(ValueError) as ctx:
            DeviceSinkPDO.from_response(response)

        self.assertIn("BATTERY PDO requires 4 values", str(ctx.exception))


class TestSPRPDOPPSParsing(unittest.TestCase):
    """Tests for SPR PPS PDO parsing from SCPI responses."""

    def test_parse_spr_pps_pdo(self) -> None:
        """Test parsing a valid SPR PPS PDO response."""
        response = "SPR_PPS,5.0,20.0,5.0".split(",")
        pdo = DeviceSinkPDO.from_response(response)

        self.assertIsInstance(pdo, SPR_PDOPPS)
        assert isinstance(pdo, SPR_PDOPPS)
        self.assertEqual(pdo.min_voltage, 5.0)
        self.assertEqual(pdo.max_voltage, 20.0)
        self.assertEqual(pdo.max_current, 5.0)

    def test_parse_spr_pps_pdo_with_whitespace(self) -> None:
        """Test parsing with extra whitespace."""
        response = "SPR_PPS, 3.0 , 11.0 , 5.0".split(",")
        pdo = DeviceSinkPDO.from_response(response)

        self.assertIsInstance(pdo, SPR_PDOPPS)
        assert isinstance(pdo, SPR_PDOPPS)
        self.assertEqual(pdo.min_voltage, 3.0)
        self.assertEqual(pdo.max_voltage, 11.0)
        self.assertEqual(pdo.max_current, 5.0)

    def test_spr_pps_pdo_to_dict(self) -> None:
        """Test SPR PPS PDO serialization."""
        pdo = SPR_PDOPPS(
            min_voltage=5.0,
            max_voltage=20.0,
            max_current=5.0,
        )
        result = pdo.to_dict()

        self.assertEqual(result["type"], "SPR_PPS")
        self.assertEqual(result["min_voltage_v"], 5.0)
        self.assertEqual(result["max_voltage_v"], 20.0)
        self.assertEqual(result["max_current_a"], 5.0)

    def test_spr_pps_pdo_string_representation(self) -> None:
        """Test SPR PPS PDO string representation."""
        pdo = SPR_PDOPPS(
            min_voltage=5.0,
            max_voltage=20.0,
            max_current=5.0,
        )
        result = str(pdo)

        self.assertIn("SPR_PDOPPS", result)
        self.assertIn("5.00V", result)
        self.assertIn("20.00V", result)
        self.assertIn("5.000A", result)

    def test_spr_pps_pdo_wrong_value_count(self) -> None:
        """Test error on wrong number of values."""
        response = "SPR_PPS,5.0,20.0".split(",")

        with self.assertRaises(ValueError) as ctx:
            DeviceSinkPDO.from_response(response)

        self.assertIn("SPR_PPS PDO requires 4 values", str(ctx.exception))


class TestSPRAVSPDOParsing(unittest.TestCase):
    """Tests for SPR AVS PDO parsing from SCPI responses."""

    def test_parse_spr_avs_pdo(self) -> None:
        """Test parsing a valid SPR AVS PDO response."""
        response = "SPR_AVS,5.0,20.0,140.0".split(",")
        pdo = DeviceSinkPDO.from_response(response)

        self.assertIsInstance(pdo, SPR_PDOAVs)
        assert isinstance(pdo, SPR_PDOAVs)
        self.assertEqual(pdo.min_voltage, 5.0)
        self.assertEqual(pdo.max_voltage, 20.0)
        self.assertEqual(pdo.max_power, 140.0)

    def test_spr_avs_pdo_to_dict(self) -> None:
        """Test SPR AVS PDO serialization."""
        pdo = SPR_PDOAVs(
            min_voltage=5.0,
            max_voltage=20.0,
            max_power=140.0,
        )
        result = pdo.to_dict()

        self.assertEqual(result["type"], "SPR_AVS")
        self.assertEqual(result["min_voltage_v"], 5.0)
        self.assertEqual(result["max_voltage_v"], 20.0)
        self.assertEqual(result["max_power_w"], 140.0)

    def test_spr_avs_pdo_string_representation(self) -> None:
        """Test SPR AVS PDO string representation."""
        pdo = SPR_PDOAVs(
            min_voltage=5.0,
            max_voltage=20.0,
            max_power=140.0,
        )
        result = str(pdo)

        self.assertIn("SPR_PDOAVs", result)
        self.assertIn("5.00V", result)
        self.assertIn("20.00V", result)
        self.assertIn("140.00W", result)

    def test_spr_avs_pdo_wrong_value_count(self) -> None:
        """Test error on wrong number of values."""
        response = "SPR_AVS,5.0,20.0".split(",")

        with self.assertRaises(ValueError) as ctx:
            DeviceSinkPDO.from_response(response)

        self.assertIn("SPR_AVS PDO requires 4 values", str(ctx.exception))


class TestEPRAVSPDOParsing(unittest.TestCase):
    """Tests for EPR AVS PDO parsing from SCPI responses."""

    def test_parse_epr_avs_pdo(self) -> None:
        """Test parsing a valid EPR AVS PDO response."""
        response = "EPR_AVS,15.0,48.0,240.0".split(",")
        pdo = DeviceSinkPDO.from_response(response)

        self.assertIsInstance(pdo, EPR_PDOAVs)
        assert isinstance(pdo, EPR_PDOAVs)
        self.assertEqual(pdo.min_voltage, 15.0)
        self.assertEqual(pdo.max_voltage, 48.0)
        self.assertEqual(pdo.max_power, 240.0)

    def test_epr_avs_pdo_to_dict(self) -> None:
        """Test EPR AVS PDO serialization."""
        pdo = EPR_PDOAVs(
            min_voltage=15.0,
            max_voltage=48.0,
            max_power=240.0,
        )
        result = pdo.to_dict()

        self.assertEqual(result["type"], "EPR_AVS")
        self.assertEqual(result["min_voltage_v"], 15.0)
        self.assertEqual(result["max_voltage_v"], 48.0)
        self.assertEqual(result["max_power_w"], 240.0)

    def test_epr_avs_pdo_string_representation(self) -> None:
        """Test EPR AVS PDO string representation."""
        pdo = EPR_PDOAVs(
            min_voltage=15.0,
            max_voltage=48.0,
            max_power=240.0,
        )
        result = str(pdo)

        self.assertIn("EPR_PDOAVs", result)
        self.assertIn("15.00V", result)
        self.assertIn("48.00V", result)
        self.assertIn("240.00W", result)

    def test_epr_avs_pdo_wrong_value_count(self) -> None:
        """Test error on wrong number of values."""
        response = "EPR_AVS,15.0,48.0".split(",")

        with self.assertRaises(ValueError) as ctx:
            DeviceSinkPDO.from_response(response)

        self.assertIn("EPR_AVS PDO requires 4 values", str(ctx.exception))


class TestErrorHandling(unittest.TestCase):
    """Tests for error handling in PDO parsing."""

    def test_empty_response(self) -> None:
        """Test error on empty response."""
        with self.assertRaises(ValueError) as ctx:
            DeviceSinkPDO.from_response([])

        self.assertIn("Empty SCPI response", str(ctx.exception))

    def test_unrecognized_pdo_type(self) -> None:
        """Test error on unrecognized PDO type."""
        response = "CUSTOM,1.0,2.0,3.0".split(",")

        with self.assertRaises(ValueError) as ctx:
            DeviceSinkPDO.from_response(response)

        self.assertIn("Unrecognized PDO type", str(ctx.exception))

    def test_invalid_numeric_value(self) -> None:
        """Test error on non-numeric values."""
        response = "FIXED,5V,3A".split(",")

        with self.assertRaises(ValueError) as ctx:
            DeviceSinkPDO.from_response(response)

        self.assertIn("could not convert string to float", str(ctx.exception))

    def test_only_pdo_type(self) -> None:
        """Test error when only PDO type is provided."""
        response = "FIXED".split(",")

        with self.assertRaises(ValueError) as ctx:
            DeviceSinkPDO.from_response(response)

        self.assertIn("FIXED PDO requires 3 values", str(ctx.exception))

    def test_none_response_returns_none(self) -> None:
        """Test parsing NONE returns None."""
        response = "NONE".split(",")

        result = DeviceSinkPDO.from_response(response)

        self.assertIsNone(result)


class TestPDOImmutability(unittest.TestCase):
    """Tests for PDO immutability (frozen dataclass behavior)."""

    def test_fixed_pdo_immutable(self) -> None:
        """Test that FixedPDO instances are immutable."""
        pdo = FixedPDO(voltage=5.0, max_current=3.0)

        with self.assertRaises(AttributeError):
            pdo.voltage = 10.0  # type: ignore

    def test_variable_pdo_immutable(self) -> None:
        """Test that VariablePDO instances are immutable."""
        pdo = VariablePDO(
            min_voltage=5.0,
            max_voltage=20.0,
            max_current=3.0,
        )

        with self.assertRaises(AttributeError):
            pdo.min_voltage = 3.0  # type: ignore


if __name__ == "__main__":
    unittest.main()
