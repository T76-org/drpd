"""
Unit tests for DeviceInternal's PyUSB USBTMC transport.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast
import struct
import threading
import unittest
from unittest.mock import MagicMock, patch

import usb.core
from usb.core import Device as USBDevice

from t76.drpd.device.device_internal import (
    DeviceInternal,
    USBTMCTransportError,
    _USBTMCHeader,
    _USBTMCInstrument,
    _convert_ascii_values,
    _parse_binary_block,
    _parse_scpi_values,
)


class FakeEndpoint:
    def __init__(
            self,
            address: int,
            attributes: int,
            packet_size: int = 64) -> None:
        self.bEndpointAddress = address
        self.bmAttributes = attributes
        self.wMaxPacketSize = packet_size


class FakeInterface:
    bInterfaceNumber = 4
    bInterfaceClass = 0xFE
    bInterfaceSubClass = 0x03
    bInterfaceProtocol = 0x01

    def __init__(self) -> None:
        self.endpoints = [
            FakeEndpoint(0x01, 0x02),
            FakeEndpoint(0x82, 0x02),
            FakeEndpoint(0x83, 0x03, 8),
        ]

    def __iter__(self):
        return iter(self.endpoints)


class FakeConfiguration:
    bConfigurationValue = 1

    def __init__(self) -> None:
        self.interfaces = [FakeInterface()]

    def __iter__(self):
        return iter(self.interfaces)


class FakeUSBDevice:
    product = "Test Device"
    serial_number = "ABC123"
    idVendor = 0x2E8A
    idProduct = 0x000A

    def __init__(self) -> None:
        self.configuration = FakeConfiguration()
        self.writes: list[bytes] = []
        self.reads: list[bytes | BaseException] = []
        self.control_requests: list[tuple[int, int, int, int, int]] = []
        self.clear_halts: list[int] = []

    def __iter__(self):
        return iter([self.configuration])

    def get_active_configuration(self):
        return self.configuration

    def set_configuration(self, _configuration: int) -> None:
        return None

    def is_kernel_driver_active(self, _interface_number: int) -> bool:
        return False

    def write(self, _endpoint: int, data: bytes, timeout: int) -> int:
        self.writes.append(bytes(data))
        return len(data)

    def read(self, _endpoint: int, _size: int, timeout: int):
        if self.reads:
            value = self.reads.pop(0)
            if isinstance(value, BaseException):
                raise value
            return value
        raise usb.core.USBError("timeout")

    def ctrl_transfer(
            self,
            bm_request_type: int,
            request: int,
            value: int,
            index: int,
            length: int,
            timeout: int):
        self.control_requests.append(
            (bm_request_type, request, value, index, length))
        return bytes([_USBTMCInstrument.STATUS_SUCCESS] + [0] * (length - 1))

    def clear_halt(self, endpoint: int) -> None:
        self.clear_halts.append(endpoint)


def build_in_response(payload: bytes, tag: int = 1) -> bytes:
    header = _USBTMCHeader(
        _USBTMCInstrument.MSG_DEV_DEP_IN,
        tag,
        len(payload),
        0,
    ).build()
    padded_size = ((len(payload) + 3) // 4) * 4
    return header + payload + bytes(padded_size - len(payload))


class TestUSBTMCParsing(unittest.TestCase):
    def test_header_builds_and_parses(self) -> None:
        header = _USBTMCHeader(0x01, 0x22, 5, 0x01)

        parsed = _USBTMCHeader.parse(header.build())

        self.assertEqual(parsed.msg_id, 0x01)
        self.assertEqual(parsed.b_tag, 0x22)
        self.assertEqual(parsed.transfer_size, 5)
        self.assertEqual(parsed.transfer_attributes, 0x01)

    def test_header_rejects_bad_inverse(self) -> None:
        data = bytearray(_USBTMCHeader(0x02, 0x01, 0).build())
        data[2] = 0x00

        with self.assertRaises(USBTMCTransportError):
            _USBTMCHeader.parse(bytes(data))

    def test_parse_scpi_values_handles_quotes_and_delimiters(self) -> None:
        self.assertEqual(
            _parse_scpi_values('0,"No error", ON, "a ""b"""'),
            ["0", "No error", "ON", 'a "b"'],
        )
        self.assertEqual(
            _parse_scpi_values("FIXED 5.0 3.0"),
            ["FIXED", "5.0", "3.0"],
        )
        self.assertEqual(
            _parse_scpi_values("0, No error"),
            ["0", "No error"],
        )

    def test_convert_ascii_values_supports_string_float_and_callable(
            self) -> None:
        self.assertEqual(_convert_ascii_values(["1.5"]), [1.5])
        self.assertEqual(_convert_ascii_values(["ON"], "s"), ["ON"])
        self.assertEqual(
            _convert_ascii_values(['"x""y"'], DeviceInternal.parse_scpi_string),
            ['x"y'],
        )

    def test_parse_binary_block_definite_and_indefinite(self) -> None:
        self.assertEqual(_parse_binary_block(b"#14abcd"), b"abcd")
        self.assertEqual(_parse_binary_block(b"#0abc\n"), b"abc")


class TestUSBTMCInstrument(unittest.TestCase):
    def setUp(self) -> None:
        self.usb_device = FakeUSBDevice()
        self.interrupt_handler = MagicMock()
        self.instrument = _USBTMCInstrument(
            cast(USBDevice, self.usb_device),
            self.interrupt_handler,
        )

    def open_instrument(self) -> None:
        with patch("usb.util.claim_interface"), \
                patch("usb.util.release_interface"), \
                patch("usb.util.dispose_resources"), \
                patch.object(self.instrument, "_start_interrupt_listener"):
            self.instrument.open()

    def test_open_discovers_endpoints_and_runs_cleanup_requests(self) -> None:
        self.open_instrument()

        requests = [request[1] for request in self.usb_device.control_requests]
        self.assertIn(_USBTMCInstrument.REQ_INITIATE_ABORT_BULK_OUT, requests)
        self.assertIn(_USBTMCInstrument.REQ_CHECK_ABORT_BULK_OUT_STATUS,
                      requests)
        self.assertIn(_USBTMCInstrument.REQ_INITIATE_ABORT_BULK_IN, requests)
        self.assertIn(_USBTMCInstrument.REQ_CHECK_ABORT_BULK_IN_STATUS,
                      requests)
        self.assertIn(_USBTMCInstrument.REQ_INITIATE_CLEAR, requests)
        self.assertIn(_USBTMCInstrument.REQ_CHECK_CLEAR_STATUS, requests)
        self.assertIn(0x01, self.usb_device.clear_halts)

    def test_write_wraps_payload_with_header_and_padding(self) -> None:
        self.open_instrument()

        self.instrument.write("AB")

        packet = self.usb_device.writes[-1]
        header = _USBTMCHeader.parse(packet)
        self.assertEqual(header.msg_id, _USBTMCInstrument.MSG_DEV_DEP_OUT)
        self.assertEqual(header.transfer_size, 2)
        self.assertEqual(header.transfer_attributes, 0x01)
        self.assertEqual(packet[_USBTMCHeader.SIZE:_USBTMCHeader.SIZE + 2],
                         b"AB")
        self.assertEqual(len(packet), _USBTMCHeader.SIZE + 4)

    def test_next_tag_rolls_over_without_zero(self) -> None:
        self.instrument._tag_counter = 255

        self.assertEqual(self.instrument._next_tag(), 255)
        self.assertEqual(self.instrument._next_tag(), 1)

    def test_read_validates_response_tag(self) -> None:
        self.open_instrument()
        self.usb_device.reads.append(build_in_response(b"OK\n", tag=99))

        with self.assertRaisesRegex(USBTMCTransportError, "bTag"):
            self.instrument.read_raw()

    def test_read_assembles_payload(self) -> None:
        self.open_instrument()
        self.usb_device.reads.append(build_in_response(b"12.5\n", tag=1))

        self.assertEqual(self.instrument.read_raw(), b"12.5\n")

    def test_query_ascii_values_uses_converters(self) -> None:
        self.open_instrument()
        self.usb_device.reads.append(build_in_response(b'1,"x"\n', tag=2))

        self.assertEqual(
            self.instrument.query_ascii_values("TEST?", "s"),
            ["1", "x"],
        )

    def test_query_binary_values_parses_block(self) -> None:
        self.open_instrument()
        self.usb_device.reads.append(build_in_response(b"#14abcd", tag=2))

        self.assertEqual(
            self.instrument.query_binary_values("DATA?", container=list),
            [97, 98, 99, 100],
        )

    def test_interrupt_listener_dispatches_handler(self) -> None:
        interrupt_seen = threading.Event()

        def interrupt_handler(*_args: Any) -> None:
            interrupt_seen.set()

        instrument = _USBTMCInstrument(
            cast(USBDevice, self.usb_device),
            interrupt_handler,
        )
        self.usb_device.reads = [b"\x81\x01"]

        with patch("usb.util.claim_interface"), \
                patch("usb.util.release_interface"), \
                patch("usb.util.dispose_resources"):
            instrument.open()
            self.assertTrue(interrupt_seen.wait(timeout=1.0))
            instrument.close()


class TestDeviceInternal(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        usb_device = SimpleNamespace(
            product="Test Device",
            serial_number="ABC123",
            idVendor=0x2E8A,
            idProduct=0x000A,
        )
        self.device_internal = DeviceInternal(
            usb_device=cast(USBDevice, usb_device),
            interrupt_handler=MagicMock(),
        )

    async def test_disconnect_closes_instrument(self) -> None:
        instrument = MagicMock()
        self.device_internal.instrument = instrument

        await self.device_internal.disconnect()

        instrument.close.assert_called_once()
        self.assertIsNone(self.device_internal.instrument)

    async def test_disconnect_is_idempotent_when_already_disconnected(
            self) -> None:
        self.device_internal.instrument = None

        await self.device_internal.disconnect()

        self.assertIsNone(self.device_internal.instrument)

    async def test_write_ascii_times_out_when_lock_is_held(self) -> None:
        instrument = MagicMock()
        self.device_internal.instrument = instrument
        self.device_internal._lock = MagicMock()
        self.device_internal._lock.acquire.return_value = False

        with self.assertRaises(TimeoutError):
            await self.device_internal.write_ascii_and_check("SYST:ERR?")

        instrument.write.assert_not_called()

    async def test_connect_cleans_up_resources_when_initialization_fails(
            self) -> None:
        usb_device = FakeUSBDevice()
        usb_device.configuration.interfaces = []
        internal = DeviceInternal(
            cast(USBDevice, usb_device),
            MagicMock(),
        )

        with patch("usb.util.dispose_resources") as dispose_resources:
            with self.assertRaises(USBTMCTransportError):
                await internal.connect()

        dispose_resources.assert_called_once()
        self.assertIsNone(internal.instrument)

    async def test_query_binary_requires_non_empty_list(self) -> None:
        instrument = MagicMock()
        instrument.query_binary_values.return_value = []
        instrument.query_ascii_values.return_value = ["0", "No error"]
        self.device_internal.instrument = instrument

        with self.assertRaises(RuntimeError):
            await self.device_internal.query_binary_value_and_check("DATA?")

    async def test_check_for_error_raises_for_device_error(self) -> None:
        instrument = MagicMock()
        instrument.query_ascii_values.return_value = ["5", "Bad command"]
        self.device_internal.instrument = instrument

        with self.assertRaisesRegex(RuntimeError, "Bad command"):
            self.device_internal.check_for_error("TEST")
