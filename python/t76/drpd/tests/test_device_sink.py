"""
Copyright (c) 2025 MTA, Inc.

Unit tests for the DeviceSink class.
"""

import asyncio
import unittest
from unittest.mock import AsyncMock

from t76.drpd.device.device_sink import (
    DeviceSink,
    SinkInquiryRunner,
    SinkInquirySupersededError,
)
from t76.drpd.device.device_sink_pdos import (
    BatteryPDO,
    FixedPDO,
    VariablePDO,
)
from t76.drpd.device.types import (
    CountryCodesInquiryData,
    CountryInfoInquiryData,
    CountryInquiryFailureAction,
    ExtendedSourceCapabilitiesInquiryData,
    GetExtendedSourceCapabilitiesInquiryRequest,
    GetCountryCodesInquiryRequest,
    GetCountryInfoInquiryRequest,
    GetManufacturerInfoInquiryRequest,
    GetPPSStatusInquiryRequest,
    GetRevisionInquiryRequest,
    GetSourceCapabilitiesInquiryRequest,
    GetSourceInfoInquiryRequest,
    GetStatusInquiryRequest,
    ManufacturerInfoInquiryData,
    ManufacturerInfoTarget,
    PPSStatusInquiryData,
    RevisionInquiryData,
    SinkInquiryOutcome,
    SinkInquiryType,
    SinkRequestOutcome,
    SinkState,
    SourceCapabilitiesInquiryData,
    SourceInfoInquiryData,
    SourceStatusInquiryData,
)


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


class TestDeviceSinkInquiry(unittest.IsolatedAsyncioTestCase):
    """Tests for Sink-to-Source inquiry methods."""

    async def asyncSetUp(self) -> None:
        self.mock_internal = AsyncMock()
        self.device_sink = DeviceSink(self.mock_internal)

    async def test_send_inquiry(self) -> None:
        await self.device_sink.send_inquiry(SinkInquiryType.GET_REVISION)
        self.mock_internal.write_ascii_and_check.assert_awaited_once_with(
            "SINK:INQ GET_REVISION"
        )

    async def test_send_inquiry_supports_every_source_information_token(self) -> None:
        for inquiry_type in SinkInquiryType:
            with self.subTest(inquiry_type=inquiry_type):
                self.mock_internal.reset_mock()
                await self.device_sink.send_inquiry(inquiry_type)
                self.mock_internal.write_ascii_and_check.assert_awaited_once_with(
                    f"SINK:INQ {inquiry_type.value}"
                )

    async def test_semantic_inquiry_parameters_encode_without_pd_headers(self) -> None:
        vectors = [
            (
                GetManufacturerInfoInquiryRequest(),
                'SINK:INQ GET_MANUFACTURER_INFO,"PORT"',
            ),
            (
                GetManufacturerInfoInquiryRequest(
                    ManufacturerInfoTarget.BATTERY, 3
                ),
                'SINK:INQ GET_MANUFACTURER_INFO,"BATTERY",3',
            ),
            (
                GetCountryInfoInquiryRequest("ca"),
                'SINK:INQ GET_COUNTRY_INFO,"CA"',
            ),
            (
                GetCountryCodesInquiryRequest(),
                "SINK:INQ GET_COUNTRY_CODES",
            ),
        ]
        for request, expected in vectors:
            with self.subTest(request=request):
                self.mock_internal.reset_mock()
                await self.device_sink.send_inquiry(request)
                self.mock_internal.write_ascii_and_check.assert_awaited_once_with(
                    expected
                )

    async def test_semantic_inquiry_parameter_validation(self) -> None:
        with self.assertRaisesRegex(ValueError, "must be omitted"):
            GetManufacturerInfoInquiryRequest(
                ManufacturerInfoTarget.PORT, 0
            )
        for reference in (-1, 8):
            with self.subTest(reference=reference):
                with self.assertRaisesRegex(ValueError, "between 0 and 7"):
                    GetManufacturerInfoInquiryRequest(
                        ManufacturerInfoTarget.BATTERY, reference
                    )
        self.assertEqual(GetCountryInfoInquiryRequest("ca").country_code, "CA")
        for code in ("C", "CAN", "C1", "ÇA"):
            with self.subTest(code=code):
                with self.assertRaisesRegex(ValueError, "ASCII letters"):
                    GetCountryInfoInquiryRequest(code)

    async def test_get_inquiry_status(self) -> None:
        self.mock_internal.query_ascii_values_and_check.return_value = [
            "RESPONSE,17,GET_REVISION,1,12,6"
        ]
        status = await self.device_sink.get_inquiry_status()
        self.assertEqual(status.outcome, SinkInquiryOutcome.RESPONSE)
        self.assertEqual(status.request_id, 17)
        self.assertEqual(status.type, SinkInquiryType.GET_REVISION)
        self.assertEqual(status.response_class, 1)
        self.assertEqual(status.response_type, 12)
        self.assertEqual(status.response_length, 6)

    async def test_get_inquiry_status_rejects_malformed_response(self) -> None:
        self.mock_internal.query_ascii_values_and_check.return_value = [
            "RESPONSE,17,GET_REVISION"
        ]
        with self.assertRaisesRegex(ValueError, "must contain 6 fields"):
            await self.device_sink.get_inquiry_status()

    async def test_get_inquiry_status_rejects_unknown_tokens(self) -> None:
        self.mock_internal.query_ascii_values_and_check.return_value = [
            "MADE_UP,17,GET_REVISION,1,12,6"
        ]
        with self.assertRaisesRegex(ValueError, "Unknown sink inquiry outcome"):
            await self.device_sink.get_inquiry_status()

        self.mock_internal.query_ascii_values_and_check.return_value = [
            "RESPONSE,17,UNKNOWN,1,12,6"
        ]
        with self.assertRaisesRegex(ValueError, "Unknown sink inquiry type"):
            await self.device_sink.get_inquiry_status()

    async def test_get_inquiry_status_parses_every_outcome(self) -> None:
        for outcome in SinkInquiryOutcome:
            with self.subTest(outcome=outcome):
                self.mock_internal.query_ascii_values_and_check.return_value = [
                    f"{outcome.value},17,GET_REVISION,0,0,0"
                ]
                status = await self.device_sink.get_inquiry_status()
                self.assertEqual(status.outcome, outcome)

    async def test_get_inquiry_response_normalizes_bytes(self) -> None:
        self.mock_internal.query_binary_value_and_check.return_value = [
            0x12, 0x34, 0xAB
        ]
        response = await self.device_sink.get_inquiry_response()
        self.assertEqual(response, b"\x12\x34\xab")
        self.mock_internal.query_binary_value_and_check.assert_awaited_once_with(
            "SINK:INQ:RESP?"
        )

    async def test_run_inquiry_correlates_response_and_retains_history(self) -> None:
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["RESPONSE,7,GET_REVISION,2,12,4"],
            ["PENDING,8,GET_REVISION,0,0,0"],
            ["RESPONSE,8,GET_REVISION,2,12,4"],
        ]
        self.mock_internal.query_binary_value_and_check.return_value = [
            1, 2, 3, 4
        ]

        request = GetRevisionInquiryRequest()
        result = await self.device_sink.run_inquiry(
            request, poll_interval_seconds=0
        )

        self.assertIs(result.request, request)
        self.assertEqual(result.status.request_id, 8)
        self.assertEqual(result.raw_response, b"\x01\x02\x03\x04")
        self.assertIsInstance(result.decoded, RevisionInquiryData)
        self.assertEqual(self.device_sink.inquiry_runner.history, (result,))
        self.mock_internal.write_ascii_and_check.assert_awaited_once_with(
            "SINK:INQ GET_REVISION"
        )

    async def test_run_inquiry_does_not_fetch_body_for_terminal_error(self) -> None:
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["RESPONSE,2,GET_REVISION,1,12,4"],
            ["NOT_SUPPORTED,3,GET_REVISION,0,0,0"],
        ]

        result = await self.device_sink.run_inquiry(
            GetRevisionInquiryRequest(), poll_interval_seconds=0
        )

        self.assertEqual(result.status.outcome, SinkInquiryOutcome.NOT_SUPPORTED)
        self.assertIsNone(result.raw_response)
        self.mock_internal.query_binary_value_and_check.assert_not_awaited()

    async def test_run_inquiry_detects_superseded_id(self) -> None:
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["RESPONSE,2,GET_REVISION,1,12,4"],
            ["PENDING,3,GET_REVISION,0,0,0"],
            ["PENDING,4,GET_REVISION,0,0,0"],
        ]

        with self.assertRaisesRegex(
            SinkInquirySupersededError, "superseded"
        ):
            await self.device_sink.run_inquiry(
                GetRevisionInquiryRequest(), poll_interval_seconds=0
            )

    async def test_run_inquiry_rejects_mismatched_response_length(self) -> None:
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["NONE,0,GET_REVISION,0,0,0"],
            ["RESPONSE,1,GET_REVISION,2,12,4"],
        ]
        self.mock_internal.query_binary_value_and_check.return_value = [1, 2]

        with self.assertRaisesRegex(ValueError, "expected 4, got 2"):
            await self.device_sink.run_inquiry(
                GetRevisionInquiryRequest(), poll_interval_seconds=0
            )

    async def test_runner_serializes_concurrent_callers(self) -> None:
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["NONE,0,GET_REVISION,0,0,0"],
            ["NOT_SUPPORTED,1,GET_REVISION,0,0,0"],
            ["NOT_SUPPORTED,1,GET_REVISION,0,0,0"],
            ["WAIT,2,GET_REVISION,0,0,0"],
        ]

        first, second = await asyncio.gather(
            self.device_sink.run_inquiry(
                GetRevisionInquiryRequest(), poll_interval_seconds=0
            ),
            self.device_sink.run_inquiry(
                GetRevisionInquiryRequest(), poll_interval_seconds=0
            ),
        )

        self.assertEqual(first.status.request_id, 1)
        self.assertEqual(second.status.request_id, 2)
        self.assertEqual(
            [entry.status.request_id for entry in
             self.device_sink.inquiry_runner.history],
            [1, 2],
        )

    async def test_run_inquiry_times_out_when_id_never_advances(self) -> None:
        self.mock_internal.query_ascii_values_and_check.return_value = [
            "NONE,0,GET_REVISION,0,0,0"
        ]

        with self.assertRaisesRegex(TimeoutError, "within 2 polls"):
            await self.device_sink.run_inquiry(
                GetRevisionInquiryRequest(),
                poll_interval_seconds=0,
                max_polls=2,
            )

    async def test_runner_bounds_configuration(self) -> None:
        with self.assertRaisesRegex(ValueError, "history_limit"):
            SinkInquiryRunner(self.device_sink, history_limit=0)
        with self.assertRaisesRegex(ValueError, "max_polls"):
            await self.device_sink.run_inquiry(
                GetRevisionInquiryRequest(), max_polls=0
            )

    async def test_runner_history_is_bounded(self) -> None:
        runner = SinkInquiryRunner(self.device_sink, history_limit=1)
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["NONE,0,GET_REVISION,0,0,0"],
            ["NOT_SUPPORTED,1,GET_REVISION,0,0,0"],
            ["NOT_SUPPORTED,1,GET_REVISION,0,0,0"],
            ["WAIT,2,GET_REVISION,0,0,0"],
        ]

        await runner.run(GetRevisionInquiryRequest(), poll_interval_seconds=0)
        latest = await runner.run(
            GetRevisionInquiryRequest(), poll_interval_seconds=0
        )

        self.assertEqual(runner.history, (latest,))

    async def test_runner_decodes_every_supported_success_body(self) -> None:
        source_info_raw = (
            (1 << 31) | (100 << 16) | (65 << 8) | 60
        ).to_bytes(4, "little")
        vectors = [
            (
                GetSourceCapabilitiesInquiryRequest(),
                2,
                0x01,
                (0x0001912C).to_bytes(4, "little"),
                SourceCapabilitiesInquiryData,
            ),
            (
                GetExtendedSourceCapabilitiesInquiryRequest(),
                0,
                0x01,
                bytes(range(25)),
                ExtendedSourceCapabilitiesInquiryData,
            ),
            (
                GetStatusInquiryRequest(),
                0,
                0x02,
                bytes([30, 0x0A, 1, 0x1E, 0x04, 0x22, 0x11]),
                SourceStatusInquiryData,
            ),
            (
                GetRevisionInquiryRequest(),
                2,
                0x0C,
                bytes([0, 0, 0x21, 0x32]),
                RevisionInquiryData,
            ),
            (
                GetSourceInfoInquiryRequest(),
                2,
                0x0B,
                source_info_raw,
                SourceInfoInquiryData,
            ),
            (
                GetPPSStatusInquiryRequest(),
                0,
                0x0C,
                bytes([0xFA, 0x00, 60, 0x0A]),
                PPSStatusInquiryData,
            ),
        ]

        for request_id, vector in enumerate(vectors, start=1):
            request, response_class, response_type, body, decoded_type = vector
            with self.subTest(request=request):
                self.mock_internal.reset_mock()
                self.mock_internal.query_ascii_values_and_check.side_effect = [
                    [f"NONE,{request_id - 1},GET_REVISION,0,0,0"],
                    [
                        f"RESPONSE,{request_id},{request.type.value},"
                        f"{response_class},{response_type},{len(body)}"
                    ],
                ]
                self.mock_internal.query_binary_value_and_check.return_value = list(
                    body
                )
                runner = SinkInquiryRunner(self.device_sink)

                result = await runner.run(request, poll_interval_seconds=0)

                self.assertEqual(result.raw_response, body)
                self.assertIsInstance(result.decoded, decoded_type)
                self.mock_internal.write_ascii_and_check.assert_awaited_once_with(
                    f"SINK:INQ {request.type.value}"
                )

    async def test_decoded_success_fields_use_protocol_units(self) -> None:
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["NONE,0,GET_REVISION,0,0,0"],
            ["RESPONSE,1,GET_PPS_STATUS,0,12,4"],
        ]
        self.mock_internal.query_binary_value_and_check.return_value = [
            0xFA, 0x00, 60, 0x0A
        ]

        result = await self.device_sink.run_inquiry(
            GetPPSStatusInquiryRequest(), poll_interval_seconds=0
        )
        self.assertIsInstance(result.decoded, PPSStatusInquiryData)
        assert isinstance(result.decoded, PPSStatusInquiryData)
        self.assertEqual(result.decoded.output_voltage_mv, 5000)
        self.assertEqual(result.decoded.output_current_ma, 3000)
        self.assertEqual(result.decoded.present_temperature_flag, 1)
        self.assertTrue(result.decoded.operating_in_current_limit)

    async def test_runner_rejects_wrong_response_metadata(self) -> None:
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["NONE,0,GET_REVISION,0,0,0"],
            ["RESPONSE,1,GET_STATUS,2,1,7"],
        ]
        self.mock_internal.query_binary_value_and_check.return_value = [0] * 7

        with self.assertRaisesRegex(ValueError, "metadata does not match"):
            await self.device_sink.run_inquiry(
                GetStatusInquiryRequest(), poll_interval_seconds=0
            )

    async def test_runner_rejects_malformed_bodies(self) -> None:
        malformed = [
            (GetSourceCapabilitiesInquiryRequest(), 2, 1, bytes(3)),
            (GetExtendedSourceCapabilitiesInquiryRequest(), 0, 1, bytes(23)),
            (GetExtendedSourceCapabilitiesInquiryRequest(), 0, 1, bytes(26)),
            (GetStatusInquiryRequest(), 0, 2, bytes(5)),
            (GetStatusInquiryRequest(), 0, 2, bytes(8)),
            (GetRevisionInquiryRequest(), 2, 12, bytes(3)),
            (GetSourceInfoInquiryRequest(), 2, 11, bytes(5)),
            (GetPPSStatusInquiryRequest(), 0, 12, bytes(5)),
        ]
        for request_id, vector in enumerate(malformed, start=1):
            request, response_class, response_type, body = vector
            with self.subTest(request=request):
                self.mock_internal.query_ascii_values_and_check.side_effect = [
                    [f"NONE,{request_id - 1},GET_REVISION,0,0,0"],
                    [
                        f"RESPONSE,{request_id},{request.type.value},"
                        f"{response_class},{response_type},{len(body)}"
                    ],
                ]
                self.mock_internal.query_binary_value_and_check.return_value = list(
                    body
                )
                runner = SinkInquiryRunner(self.device_sink)
                with self.assertRaisesRegex(ValueError, "body must"):
                    await runner.run(request, poll_interval_seconds=0)

    async def test_pps_device_conflict_is_not_rewritten(self) -> None:
        self.mock_internal.query_ascii_values_and_check.return_value = [
            "NONE,0,GET_REVISION,0,0,0"
        ]
        self.mock_internal.write_ascii_and_check.side_effect = RuntimeError(
            '-221,"Settings conflict. GET_PPS_STATUS requires SPR PPS"'
        )

        with self.assertRaisesRegex(RuntimeError, "requires SPR PPS"):
            await self.device_sink.run_inquiry(
                GetPPSStatusInquiryRequest(), poll_interval_seconds=0
            )
        self.assertEqual(self.device_sink.inquiry_runner.history, ())

    async def test_legacy_extended_capabilities_omits_epr_pdp_explicitly(self) -> None:
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["NONE,0,GET_REVISION,0,0,0"],
            ["RESPONSE,1,GET_SOURCE_CAP_EXTENDED,0,1,24"],
        ]
        self.mock_internal.query_binary_value_and_check.return_value = list(
            bytes(range(24))
        )

        result = await self.device_sink.run_inquiry(
            GetExtendedSourceCapabilitiesInquiryRequest(),
            poll_interval_seconds=0,
        )
        self.assertIsInstance(
            result.decoded, ExtendedSourceCapabilitiesInquiryData
        )
        assert isinstance(result.decoded, ExtendedSourceCapabilitiesInquiryData)
        self.assertEqual(result.decoded.payload_length, 24)
        self.assertIsNone(result.decoded.epr_source_pdp_w)
        self.assertFalse(result.decoded.has_epr_source_pdp)

    async def test_extended_capabilities_masks_spr_pdp_reserved_bit(self) -> None:
        body = bytearray(25)
        body[23] = 0x80 | 65
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["NONE,0,GET_REVISION,0,0,0"],
            ["RESPONSE,1,GET_SOURCE_CAP_EXTENDED,0,1,25"],
        ]
        self.mock_internal.query_binary_value_and_check.return_value = list(body)

        result = await self.device_sink.run_inquiry(
            GetExtendedSourceCapabilitiesInquiryRequest(),
            poll_interval_seconds=0,
        )
        self.assertIsInstance(
            result.decoded, ExtendedSourceCapabilitiesInquiryData
        )
        assert isinstance(result.decoded, ExtendedSourceCapabilitiesInquiryData)
        self.assertEqual(result.decoded.spr_source_pdp_w, 65)

    async def test_legacy_status_omits_power_state_explicitly(self) -> None:
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["NONE,0,GET_REVISION,0,0,0"],
            ["RESPONSE,1,GET_STATUS,0,2,6"],
        ]
        self.mock_internal.query_binary_value_and_check.return_value = [
            30, 0x0A, 1, 0x1E, 0x04, 0x22
        ]

        result = await self.device_sink.run_inquiry(
            GetStatusInquiryRequest(), poll_interval_seconds=0
        )
        self.assertIsInstance(result.decoded, SourceStatusInquiryData)
        assert isinstance(result.decoded, SourceStatusInquiryData)
        self.assertEqual(result.decoded.payload_length, 6)
        self.assertIsNone(result.decoded.power_state)
        self.assertFalse(result.decoded.has_power_state_change)

    async def test_recovered_pps_wire_quirk_is_logical_four_byte_body(self) -> None:
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["NONE,0,GET_REVISION,0,0,0"],
            ["RESPONSE,1,GET_PPS_STATUS,0,12,4"],
        ]
        self.mock_internal.query_binary_value_and_check.return_value = [
            0xFA, 0x00, 60, 0x0A
        ]

        result = await self.device_sink.run_inquiry(
            GetPPSStatusInquiryRequest(), poll_interval_seconds=0
        )
        self.assertEqual(result.raw_response, bytes([0xFA, 0, 60, 0x0A]))
        self.assertIsInstance(result.decoded, PPSStatusInquiryData)

    async def test_manufacturer_and_country_success_vectors(self) -> None:
        vectors = [
            (
                GetManufacturerInfoInquiryRequest(),
                7,
                b"\x34\x12\x78\x56Acme\x00",
                ManufacturerInfoInquiryData,
            ),
            (
                GetCountryCodesInquiryRequest(),
                14,
                b"\x02\x00CAUS",
                CountryCodesInquiryData,
            ),
            (
                GetCountryInfoInquiryRequest("ca"),
                13,
                b"CA\x00\x00\x01\x02",
                CountryInfoInquiryData,
            ),
        ]
        for request_id, vector in enumerate(vectors, start=1):
            request, response_type, body, decoded_type = vector
            with self.subTest(request=request):
                self.mock_internal.query_ascii_values_and_check.side_effect = [
                    [f"NONE,{request_id - 1},GET_REVISION,0,0,0"],
                    [
                        f"RESPONSE,{request_id},{request.type.value},0,"
                        f"{response_type},{len(body)}"
                    ],
                ]
                self.mock_internal.query_binary_value_and_check.return_value = list(
                    body
                )
                runner = SinkInquiryRunner(self.device_sink)

                result = await runner.run(request, poll_interval_seconds=0)

                self.assertEqual(result.raw_response, body)
                self.assertIsInstance(result.decoded, decoded_type)
                if isinstance(request, GetCountryInfoInquiryRequest):
                    assert isinstance(result.decoded, CountryInfoInquiryData)
                    self.assertEqual(result.decoded.country_code, "CA")
                    self.assertEqual(
                        result.decoded.country_specific_data, b"\x01\x02"
                    )

    async def test_manufacturer_string_fields_and_ascii_validation(self) -> None:
        bodies = [
            b"\x34\x12\x78\x56\x00",
            b"\x34\x12\x78\x56" + b"A" * 21 + b"\x00",
        ]
        for request_id, body in enumerate(bodies, start=1):
            self.mock_internal.query_ascii_values_and_check.side_effect = [
                [f"NONE,{request_id - 1},GET_REVISION,0,0,0"],
                [
                    f"RESPONSE,{request_id},GET_MANUFACTURER_INFO,0,7,"
                    f"{len(body)}"
                ],
            ]
            self.mock_internal.query_binary_value_and_check.return_value = list(body)
            result = await SinkInquiryRunner(self.device_sink).run(
                GetManufacturerInfoInquiryRequest(), poll_interval_seconds=0
            )
            self.assertIsInstance(result.decoded, ManufacturerInfoInquiryData)

        malformed = [
            b"\x34\x12\x78\x56A",
            b"\x34\x12\x78\x56\xff\x00",
            b"\x34\x12\x78\x56A\x00B",
        ]
        for request_id, body in enumerate(malformed, start=10):
            self.mock_internal.query_ascii_values_and_check.side_effect = [
                [f"NONE,{request_id - 1},GET_REVISION,0,0,0"],
                [
                    f"RESPONSE,{request_id},GET_MANUFACTURER_INFO,0,7,"
                    f"{len(body)}"
                ],
            ]
            self.mock_internal.query_binary_value_and_check.return_value = list(body)
            with self.assertRaises(ValueError):
                await SinkInquiryRunner(self.device_sink).run(
                    GetManufacturerInfoInquiryRequest(), poll_interval_seconds=0
                )

    async def test_country_boundaries_and_malformed_payloads(self) -> None:
        valid_codes = [
            b"\x01\x00CA",
            bytes([12, 0]) + b"AA" + b"AB" + b"AC" + b"AD" + b"AE"
            + b"AF" + b"AG" + b"AH" + b"AI" + b"AJ" + b"AK" + b"AL",
        ]
        for request_id, body in enumerate(valid_codes, start=1):
            self.mock_internal.query_ascii_values_and_check.side_effect = [
                [f"NONE,{request_id - 1},GET_REVISION,0,0,0"],
                [
                    f"RESPONSE,{request_id},GET_COUNTRY_CODES,0,14,"
                    f"{len(body)}"
                ],
            ]
            self.mock_internal.query_binary_value_and_check.return_value = list(body)
            result = await SinkInquiryRunner(self.device_sink).run(
                GetCountryCodesInquiryRequest(), poll_interval_seconds=0
            )
            self.assertIsInstance(result.decoded, CountryCodesInquiryData)

        valid_info = [b"CA\x00\x00", b"CA\x00\x00" + bytes(22)]
        for request_id, body in enumerate(valid_info, start=20):
            self.mock_internal.query_ascii_values_and_check.side_effect = [
                [f"NONE,{request_id - 1},GET_REVISION,0,0,0"],
                [
                    f"RESPONSE,{request_id},GET_COUNTRY_INFO,0,13,"
                    f"{len(body)}"
                ],
            ]
            self.mock_internal.query_binary_value_and_check.return_value = list(body)
            result = await SinkInquiryRunner(self.device_sink).run(
                GetCountryInfoInquiryRequest("CA"), poll_interval_seconds=0
            )
            self.assertIsInstance(result.decoded, CountryInfoInquiryData)

        malformed = [
            (GetCountryCodesInquiryRequest(), 14, b"\x01\x01CA"),
            (GetCountryCodesInquiryRequest(), 14, b"\x02\x00CA"),
            (GetCountryCodesInquiryRequest(), 14, b"\x01\x00C1"),
            (GetCountryCodesInquiryRequest(), 14, b"\x02\x00CACA"),
            (GetCountryInfoInquiryRequest("CA"), 13, b"CA\x01\x00"),
            (GetCountryInfoInquiryRequest("CA"), 13, b"US\x00\x00"),
        ]
        for request_id, (request, response_type, body) in enumerate(
            malformed, start=30
        ):
            self.mock_internal.query_ascii_values_and_check.side_effect = [
                [f"NONE,{request_id - 1},GET_REVISION,0,0,0"],
                [
                    f"RESPONSE,{request_id},{request.type.value},0,"
                    f"{response_type},{len(body)}"
                ],
            ]
            self.mock_internal.query_binary_value_and_check.return_value = list(body)
            with self.assertRaises(ValueError):
                await SinkInquiryRunner(self.device_sink).run(
                    request, poll_interval_seconds=0
                )

    async def test_guided_country_workflow_retains_all_steps(self) -> None:
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["NONE,0,GET_REVISION,0,0,0"],
            ["RESPONSE,1,GET_COUNTRY_CODES,0,14,6"],
            ["RESPONSE,1,GET_COUNTRY_CODES,0,14,6"],
            ["RESPONSE,2,GET_COUNTRY_INFO,0,13,5"],
            ["RESPONSE,2,GET_COUNTRY_INFO,0,13,5"],
            ["RESPONSE,3,GET_COUNTRY_INFO,0,13,5"],
        ]
        self.mock_internal.query_binary_value_and_check.side_effect = [
            list(b"\x02\x00CAUS"),
            list(b"CA\x00\x00A"),
            list(b"US\x00\x00B"),
        ]

        workflow = await self.device_sink.inquiry_runner.run_country_information(
            failure_action=CountryInquiryFailureAction.CONTINUE,
            poll_interval_seconds=0,
        )

        self.assertFalse(workflow.stopped_early)
        self.assertEqual(len(workflow.country_info_results), 2)
        self.assertEqual(len(self.device_sink.inquiry_runner.history), 3)

    async def test_guided_country_workflow_stop_and_fanout_bounds(self) -> None:
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["NONE,0,GET_REVISION,0,0,0"],
            ["RESPONSE,1,GET_COUNTRY_CODES,0,14,6"],
            ["RESPONSE,1,GET_COUNTRY_CODES,0,14,6"],
            ["NOT_SUPPORTED,2,GET_COUNTRY_INFO,0,0,0"],
        ]
        self.mock_internal.query_binary_value_and_check.return_value = list(
            b"\x02\x00CAUS"
        )

        workflow = await self.device_sink.inquiry_runner.run_country_information(
            failure_action=CountryInquiryFailureAction.STOP,
            poll_interval_seconds=0,
        )
        self.assertTrue(workflow.stopped_early)
        self.assertEqual(len(workflow.country_info_results), 1)

        with self.assertRaisesRegex(ValueError, "max_countries"):
            await self.device_sink.inquiry_runner.run_country_information(
                max_countries=0
            )

    async def test_guided_country_workflow_retries_then_succeeds(self) -> None:
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["NONE,0,GET_REVISION,0,0,0"],
            ["RESPONSE,1,GET_COUNTRY_CODES,0,14,4"],
            ["RESPONSE,1,GET_COUNTRY_CODES,0,14,4"],
            ["WAIT,2,GET_COUNTRY_INFO,0,0,0"],
            ["WAIT,2,GET_COUNTRY_INFO,0,0,0"],
            ["RESPONSE,3,GET_COUNTRY_INFO,0,13,5"],
        ]
        self.mock_internal.query_binary_value_and_check.side_effect = [
            list(b"\x01\x00CA"),
            list(b"CA\x00\x00A"),
        ]

        workflow = await self.device_sink.inquiry_runner.run_country_information(
            failure_action=CountryInquiryFailureAction.RETRY,
            max_retries=1,
            poll_interval_seconds=0,
        )

        self.assertFalse(workflow.stopped_early)
        self.assertEqual(
            [result.status.outcome for result in workflow.country_info_results],
            [SinkInquiryOutcome.WAIT, SinkInquiryOutcome.RESPONSE],
        )
        self.assertEqual(len(self.device_sink.inquiry_runner.history), 3)

    async def test_country_workflow_blocks_ordinary_inquiry_interleaving(
        self,
    ) -> None:
        first_status_entered = asyncio.Event()
        release_first_status = asyncio.Event()
        statuses = iter([
            ["NONE,0,GET_REVISION,0,0,0"],
            ["RESPONSE,1,GET_COUNTRY_CODES,0,14,4"],
            ["RESPONSE,1,GET_COUNTRY_CODES,0,14,4"],
            ["RESPONSE,2,GET_COUNTRY_INFO,0,13,5"],
            ["RESPONSE,2,GET_COUNTRY_INFO,0,13,5"],
            ["RESPONSE,3,GET_REVISION,2,12,4"],
        ])

        async def status_side_effect(*_args):
            response = next(statuses)
            if not first_status_entered.is_set():
                first_status_entered.set()
                await release_first_status.wait()
            return response

        self.mock_internal.query_ascii_values_and_check.side_effect = (
            status_side_effect
        )
        self.mock_internal.query_binary_value_and_check.side_effect = [
            list(b"\x01\x00CA"),
            list(b"CA\x00\x00A"),
            list(b"\x00\x00\x00\x31"),
        ]
        runner = self.device_sink.inquiry_runner

        workflow_task = asyncio.create_task(
            runner.run_country_information(poll_interval_seconds=0)
        )
        await first_status_entered.wait()
        ordinary_task = asyncio.create_task(
            runner.run(GetRevisionInquiryRequest(), poll_interval_seconds=0)
        )
        await asyncio.sleep(0)
        self.mock_internal.write_ascii_and_check.assert_not_awaited()

        release_first_status.set()
        workflow, ordinary = await asyncio.gather(workflow_task, ordinary_task)

        self.assertFalse(workflow.stopped_early)
        self.assertIsInstance(ordinary.decoded, RevisionInquiryData)
        self.assertEqual(
            [call.args[0] for call in self.mock_internal.write_ascii_and_check.await_args_list],
            [
                "SINK:INQ GET_COUNTRY_CODES",
                'SINK:INQ GET_COUNTRY_INFO,"CA"',
                "SINK:INQ GET_REVISION",
            ],
        )


class TestDeviceSinkParityMethods(unittest.IsolatedAsyncioTestCase):
    """Tests for newer sink SCPI parity methods."""

    async def asyncSetUp(self) -> None:
        self.mock_internal = AsyncMock()
        self.device_sink = DeviceSink(self.mock_internal)

    async def test_get_request_status(self) -> None:
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["SINK"],
            ["ACCEPTED", "2", "9000", "3000"],
        ]

        status = await self.device_sink.get_request_status()

        self.assertEqual(status.outcome, SinkRequestOutcome.ACCEPTED)
        self.assertEqual(status.index, 2)
        self.assertEqual(status.voltage_mv, 9000)
        self.assertEqual(status.current_ma, 3000)

    async def test_get_request_status_none(self) -> None:
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["SINK"],
            ["NONE"],
        ]

        status = await self.device_sink.get_request_status()

        self.assertEqual(status.outcome, SinkRequestOutcome.NONE)
        self.assertIsNone(status.index)

    async def test_pps_status_policy(self) -> None:
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["SINK"],
            ["ON"],
        ]

        await self.device_sink.set_pps_status_query_enabled(True)
        enabled = await self.device_sink.get_pps_status_query_enabled()

        self.mock_internal.write_ascii_and_check.assert_awaited_once_with(
            "SINK:PPS:STATUS:EN ON"
        )
        self.assertTrue(enabled)

    async def test_local_sink_capability_methods(self) -> None:
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["7"],
            ["305419896"],
            ["1"],
            ["0"],
        ]

        self.assertEqual(await self.device_sink.get_spr_capability_count(), 7)
        self.assertEqual(
            await self.device_sink.get_spr_capability_pdo(0),
            305419896,
        )
        await self.device_sink.set_spr_capability_pdo(0, 0)
        self.assertEqual(await self.device_sink.get_epr_capability_count(), 1)
        self.assertEqual(await self.device_sink.get_epr_capability_pdo(0), 0)
        await self.device_sink.set_epr_capability_pdo(0, 0)

        self.mock_internal.write_ascii_and_check.assert_any_await(
            "SINK:CAP:SPR 0 0"
        )
        self.mock_internal.write_ascii_and_check.assert_any_await(
            "SINK:CAP:EPR 0 0"
        )

    async def test_set_epr_enabled_on(self) -> None:
        """Test enabling EPR entry policy."""
        self.mock_internal.query_ascii_values_and_check.return_value = [
            "SINK"
        ]

        await self.device_sink.set_epr_enabled(True)

        self.mock_internal.write_ascii_and_check.assert_called_once_with(
            "SINK:EPR:EN ON"
        )

    async def test_set_epr_enabled_off(self) -> None:
        """Test disabling EPR entry policy."""
        self.mock_internal.query_ascii_values_and_check.return_value = [
            "SINK"
        ]

        await self.device_sink.set_epr_enabled(False)

        self.mock_internal.write_ascii_and_check.assert_called_once_with(
            "SINK:EPR:EN OFF"
        )

    async def test_get_epr_enabled(self) -> None:
        """Test querying EPR entry policy."""
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["SINK"],
            ["ON"],
        ]

        enabled = await self.device_sink.get_epr_enabled()

        self.assertTrue(enabled)
        self.mock_internal.query_ascii_values_and_check.assert_any_call(
            "SINK:EPR:EN?", "s"
        )

    async def test_set_epr_enabled_mode_validation(self) -> None:
        """Test EPR entry policy command fails if device not in SINK mode."""
        self.mock_internal.query_ascii_values_and_check.return_value = [
            "OBSERVER"
        ]

        with self.assertRaises(RuntimeError):
            await self.device_sink.set_epr_enabled(True)

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

    async def test_get_status_pe_snk_inquiry(self) -> None:
        """Test getting PE_SNK_INQUIRY status."""
        self.mock_internal.query_ascii_values_and_check.side_effect = [
            ["SINK"],
            ["PE_SNK_INQUIRY"],
        ]

        status = await self.device_sink.get_status()

        self.assertEqual(status, SinkState.PE_SNK_INQUIRY)

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
