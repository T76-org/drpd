"""
Copyright (c) 2025 MTA, Inc.

The Device class enables communication with DRPD devices
over USB using SCPI commands.
"""

from __future__ import annotations

import logging
import struct
import threading

from dataclasses import dataclass
from typing import Any, Callable, Optional, Sequence
from threading import Lock

import usb
import usb.core
import usb.util


ASCII_CONVERTER = str | Callable[[str], Any]
BINARY_DATATYPE = str


class USBTMCTransportError(RuntimeError):
    """Raised when the low-level USBTMC transport fails."""


@dataclass(frozen=True)
class _USBTMCHeader:
    msg_id: int
    b_tag: int
    transfer_size: int
    transfer_attributes: int = 0

    SIZE = 12

    def build(self) -> bytes:
        return bytes((
            self.msg_id,
            self.b_tag,
            0xFF - self.b_tag,
            0x00,
        )) + struct.pack("<I", self.transfer_size) + bytes((
            self.transfer_attributes,
            0x00,
            0x00,
            0x00,
        ))

    @classmethod
    def parse(cls, data: bytes) -> "_USBTMCHeader":
        if len(data) < cls.SIZE:
            raise USBTMCTransportError("USBTMC header is incomplete.")

        msg_id = data[0]
        b_tag = data[1]
        b_tag_inverse = data[2]

        if (b_tag ^ b_tag_inverse) != 0xFF:
            raise USBTMCTransportError("Invalid USBTMC bTag inverse.")

        return cls(
            msg_id=msg_id,
            b_tag=b_tag,
            transfer_size=struct.unpack("<I", data[4:8])[0],
            transfer_attributes=data[8],
        )


class _USBTMCInstrument:
    USBTMC_INTERFACE_CLASS = 0xFE
    USBTMC_INTERFACE_SUBCLASS = 0x03
    USBTMC_INTERFACE_PROTOCOL = 0x01

    MSG_DEV_DEP_OUT = 0x01
    MSG_DEV_DEP_IN = 0x02

    REQ_INITIATE_ABORT_BULK_OUT = 0x01
    REQ_CHECK_ABORT_BULK_OUT_STATUS = 0x02
    REQ_INITIATE_ABORT_BULK_IN = 0x03
    REQ_CHECK_ABORT_BULK_IN_STATUS = 0x04
    REQ_INITIATE_CLEAR = 0x05
    REQ_CHECK_CLEAR_STATUS = 0x06

    STATUS_SUCCESS = 0x01
    STATUS_PENDING = 0x02
    STATUS_FAILED = 0x80
    STATUS_TRANSFER_NOT_IN_PROGRESS = 0x81

    DEFAULT_TIMEOUT_MS = 500
    DRAIN_TIMEOUT_MS = 50

    def __init__(
            self,
            usb_device: usb.core.Device,
            interrupt_handler: Callable[[Any, Any, Any], None]):
        self.usb_device = usb_device
        self._interrupt_handler = interrupt_handler
        self._interface_number: Optional[int] = None
        self._endpoint_out: Optional[int] = None
        self._endpoint_in: Optional[int] = None
        self._endpoint_interrupt: Optional[int] = None
        self._bulk_in_packet_size = 64
        self._interrupt_packet_size = 8
        self._tag_counter = 1
        self._last_tag: Optional[int] = None
        self._claimed = False
        self._stop_interrupt = threading.Event()
        self._interrupt_thread: Optional[threading.Thread] = None

    def open(self) -> None:
        self._configure_device()
        self._claim_interface()
        self._abort_pending_transfers()
        self._start_interrupt_listener()

    def close(self) -> None:
        self._stop_interrupt_listener()

        if self._claimed and self._interface_number is not None:
            try:
                usb.util.release_interface(
                    self.usb_device, self._interface_number)
            except usb.core.USBError as e:
                logging.warning("Failed to release USBTMC interface: %s", e)
            self._claimed = False

        try:
            usb.util.dispose_resources(self.usb_device)
        except usb.core.USBError as e:
            logging.warning("Failed to dispose USB resources: %s", e)

    def write(self, command: str) -> None:
        self.write_raw(command.encode())

    def write_binary_values(
            self,
            command: str,
            data: Sequence[int | float],
            datatype: BINARY_DATATYPE = "B") -> None:
        payload = _format_binary_block(command, data, datatype)
        self.write_raw(payload)

    def write_raw(self, payload: bytes) -> None:
        endpoint_out = self._require_endpoint_out()
        transfer_size = len(payload)
        padded_size = ((transfer_size + 3) // 4) * 4
        header = _USBTMCHeader(
            self.MSG_DEV_DEP_OUT,
            self._next_tag(),
            transfer_size,
            0x01,
        ).build()
        packet = header + payload + bytes(padded_size - transfer_size)

        try:
            written = self.usb_device.write(
                endpoint_out, packet, timeout=self.DEFAULT_TIMEOUT_MS)
        except usb.core.USBError as e:
            raise USBTMCTransportError(
                f"USBTMC write failed: {e}") from e

        if written != len(packet):
            raise USBTMCTransportError(
                f"USBTMC write incomplete: {written} of {len(packet)} bytes.")

    def read_raw(self, requested_length: int = 4096) -> bytes:
        endpoint_out = self._require_endpoint_out()
        endpoint_in = self._require_endpoint_in()
        tag = self._next_tag()
        header = _USBTMCHeader(
            self.MSG_DEV_DEP_IN,
            tag,
            requested_length,
            0x00,
        ).build()

        try:
            self.usb_device.write(
                endpoint_out, header, timeout=self.DEFAULT_TIMEOUT_MS)
        except usb.core.USBError as e:
            raise USBTMCTransportError(
                f"USBTMC read request failed: {e}") from e

        chunks: list[bytes] = []
        expected = 0
        received = 0

        while expected == 0 or received < expected:
            min_length = requested_length + _USBTMCHeader.SIZE
            transfer_length = (
                (min_length + self._bulk_in_packet_size - 1)
                // self._bulk_in_packet_size
            ) * self._bulk_in_packet_size

            try:
                raw = bytes(self.usb_device.read(
                    endpoint_in,
                    transfer_length,
                    timeout=self.DEFAULT_TIMEOUT_MS,
                ))
            except usb.core.USBError as e:
                raise USBTMCTransportError(
                    f"USBTMC read failed: {e}") from e

            if len(raw) < _USBTMCHeader.SIZE:
                break

            response_header = _USBTMCHeader.parse(raw)

            if response_header.msg_id != self.MSG_DEV_DEP_IN:
                raise USBTMCTransportError(
                    f"Unexpected USBTMC message ID: {response_header.msg_id}.")

            if response_header.b_tag != tag:
                raise USBTMCTransportError(
                    "USBTMC response bTag does not match request.")

            if expected == 0:
                expected = response_header.transfer_size
                if expected == 0:
                    break

            payload = raw[_USBTMCHeader.SIZE:]
            remaining = expected - received
            taken = payload[:remaining]
            if taken:
                chunks.append(taken)
                received += len(taken)

            if received >= expected:
                break

        return b"".join(chunks)

    def query_ascii_values(
            self,
            command: str,
            converter: ASCII_CONVERTER = "f") -> Sequence[Any]:
        self.write(command)
        response = self.read_raw().decode(errors="replace").strip()
        return _convert_ascii_values(_parse_scpi_values(response), converter)

    def query_binary_values(
            self,
            command: str,
            datatype: BINARY_DATATYPE = "B",
            container: type = list) -> Sequence[int | float]:
        self.write(command)
        payload = _parse_binary_block(self.read_raw())
        values = _decode_binary_values(payload, datatype)
        return container(values)

    def drain_output(self) -> int:
        drained = 0
        endpoint_in = self._require_endpoint_in()

        while True:
            try:
                data = bytes(self.usb_device.read(
                    endpoint_in,
                    self._bulk_in_packet_size,
                    timeout=self.DRAIN_TIMEOUT_MS,
                ))
            except usb.core.USBError:
                break
            drained += len(data)
            if len(data) < self._bulk_in_packet_size:
                break

        return drained

    def _configure_device(self) -> None:
        try:
            configuration = getattr(
                self.usb_device,
                "get_active_configuration",
                lambda: None,
            )()
        except usb.core.USBError:
            configuration = None

        if configuration is None:
            first_configuration = next(iter(self.usb_device), None)
            if first_configuration is None:
                raise USBTMCTransportError(
                    "USB device has no configurations.")
            self.usb_device.set_configuration(
                first_configuration.bConfigurationValue)
            configuration = first_configuration

        usb_interface = self._find_usbtmc_interface(configuration)
        if usb_interface is None:
            raise USBTMCTransportError(
                "USBTMC interface not found on device.")

        self._interface_number = usb_interface.bInterfaceNumber
        self._endpoint_out = None
        self._endpoint_in = None
        self._endpoint_interrupt = None

        for endpoint in usb_interface:
            endpoint_type = usb.util.endpoint_type(endpoint.bmAttributes)
            direction = usb.util.endpoint_direction(endpoint.bEndpointAddress)

            if endpoint_type == usb.util.ENDPOINT_TYPE_BULK:
                if direction == usb.util.ENDPOINT_OUT:
                    self._endpoint_out = endpoint.bEndpointAddress
                elif direction == usb.util.ENDPOINT_IN:
                    self._endpoint_in = endpoint.bEndpointAddress
                    self._bulk_in_packet_size = endpoint.wMaxPacketSize
            elif (
                    endpoint_type == usb.util.ENDPOINT_TYPE_INTR
                    and direction == usb.util.ENDPOINT_IN):
                self._endpoint_interrupt = endpoint.bEndpointAddress
                self._interrupt_packet_size = endpoint.wMaxPacketSize

        if self._endpoint_out is None or self._endpoint_in is None:
            raise USBTMCTransportError(
                "USBTMC bulk endpoints not found on device.")

    def _find_usbtmc_interface(self, configuration: Any) -> Optional[Any]:
        for usb_interface in configuration:
            if (
                    usb_interface.bInterfaceClass
                    == self.USBTMC_INTERFACE_CLASS
                    and usb_interface.bInterfaceSubClass
                    == self.USBTMC_INTERFACE_SUBCLASS
                    and usb_interface.bInterfaceProtocol
                    == self.USBTMC_INTERFACE_PROTOCOL):
                return usb_interface
        return None

    def _claim_interface(self) -> None:
        if self._interface_number is None:
            raise USBTMCTransportError("USBTMC interface not initialized.")

        try:
            if self.usb_device.is_kernel_driver_active(
                    self._interface_number):
                self.usb_device.detach_kernel_driver(self._interface_number)
        except (NotImplementedError, usb.core.USBError, AttributeError):
            pass

        try:
            usb.util.claim_interface(
                self.usb_device, self._interface_number)
        except usb.core.USBError as e:
            raise USBTMCTransportError(
                f"Failed to claim USBTMC interface: {e}") from e

        self._claimed = True

    def _abort_pending_transfers(self) -> None:
        for operation in (
                self._abort_bulk_out,
                self._abort_bulk_in,
                self._clear_buffers):
            try:
                operation()
            except USBTMCTransportError as e:
                logging.debug("Ignoring USBTMC cleanup failure: %s", e)

    def _abort_bulk_out(self) -> None:
        endpoint_out = self._require_endpoint_out()
        self._run_control_transfer_poll(
            initiate_request=self.REQ_INITIATE_ABORT_BULK_OUT,
            initiate_length=2,
            check_request=self.REQ_CHECK_ABORT_BULK_OUT_STATUS,
            check_length=8,
            recipient=usb.util.CTRL_RECIPIENT_ENDPOINT,
            value=self._last_tag or 0,
            index=endpoint_out,
            allow_not_in_progress=True,
            clear_halt_endpoint=endpoint_out,
        )

    def _abort_bulk_in(self) -> None:
        endpoint_in = self._require_endpoint_in()
        self._run_control_transfer_poll(
            initiate_request=self.REQ_INITIATE_ABORT_BULK_IN,
            initiate_length=2,
            check_request=self.REQ_CHECK_ABORT_BULK_IN_STATUS,
            check_length=8,
            recipient=usb.util.CTRL_RECIPIENT_ENDPOINT,
            value=self._last_tag or 0,
            index=endpoint_in,
            allow_not_in_progress=True,
            drain_on_pending=True,
        )

    def _clear_buffers(self) -> None:
        if self._interface_number is None:
            raise USBTMCTransportError("USBTMC interface not initialized.")
        self._run_control_transfer_poll(
            initiate_request=self.REQ_INITIATE_CLEAR,
            initiate_length=1,
            check_request=self.REQ_CHECK_CLEAR_STATUS,
            check_length=2,
            recipient=usb.util.CTRL_RECIPIENT_INTERFACE,
            value=0,
            index=self._interface_number,
            drain_on_pending=True,
            clear_halt_endpoint=self._require_endpoint_out(),
        )

    def _run_control_transfer_poll(
            self,
            initiate_request: int,
            initiate_length: int,
            check_request: int,
            check_length: int,
            recipient: int,
            value: int,
            index: int,
            allow_not_in_progress: bool = False,
            drain_on_pending: bool = False,
            clear_halt_endpoint: Optional[int] = None) -> None:
        initiate = self._control_transfer_in(
            recipient, initiate_request, value, index, initiate_length)
        initiate_status = initiate[0] if initiate else 0

        if (
                allow_not_in_progress
                and initiate_status in (
                    self.STATUS_FAILED,
                    self.STATUS_TRANSFER_NOT_IN_PROGRESS,
                )):
            return

        if initiate_status != self.STATUS_SUCCESS:
            raise USBTMCTransportError(
                f"USBTMC initiate request 0x{initiate_request:02x} "
                f"failed with status 0x{initiate_status:02x}.")

        while True:
            check = self._control_transfer_in(
                recipient, check_request, 0, index, check_length)
            check_status = check[0] if check else 0
            bulk_in_fifo_bytes = len(check) > 1 and (check[1] & 0x01) != 0

            if check_status == self.STATUS_PENDING:
                if drain_on_pending and bulk_in_fifo_bytes:
                    self._drain_bulk_in_to_short_packet()
                continue

            if check_status != self.STATUS_SUCCESS:
                raise USBTMCTransportError(
                    f"USBTMC check request 0x{check_request:02x} "
                    f"failed with status 0x{check_status:02x}.")

            if clear_halt_endpoint is not None:
                try:
                    self.usb_device.clear_halt(clear_halt_endpoint)
                except (AttributeError, usb.core.USBError):
                    pass
            return

    def _control_transfer_in(
            self,
            recipient: int,
            request: int,
            value: int,
            index: int,
            length: int) -> bytes:
        request_type = (
            usb.util.CTRL_IN
            | usb.util.CTRL_TYPE_CLASS
            | recipient
        )

        try:
            data = self.usb_device.ctrl_transfer(
                request_type,
                request,
                value,
                index,
                length,
                timeout=self.DEFAULT_TIMEOUT_MS,
            )
        except usb.core.USBError as e:
            raise USBTMCTransportError(
                f"USBTMC control transfer failed: {e}") from e

        result = bytes(data)
        if len(result) < length:
            raise USBTMCTransportError(
                f"USBTMC control transfer returned {len(result)} bytes, "
                f"expected {length}.")
        return result

    def _drain_bulk_in_to_short_packet(self) -> None:
        endpoint_in = self._require_endpoint_in()
        while True:
            try:
                data = bytes(self.usb_device.read(
                    endpoint_in,
                    self._bulk_in_packet_size,
                    timeout=self.DRAIN_TIMEOUT_MS,
                ))
            except usb.core.USBError:
                return
            if len(data) < self._bulk_in_packet_size:
                return

    def _start_interrupt_listener(self) -> None:
        if self._endpoint_interrupt is None:
            return

        self._stop_interrupt.clear()
        self._interrupt_thread = threading.Thread(
            target=self._poll_interrupt_endpoint,
            name="drpd-usbtmc-interrupt",
            daemon=True,
        )
        self._interrupt_thread.start()

    def _stop_interrupt_listener(self) -> None:
        self._stop_interrupt.set()
        if self._interrupt_thread is not None:
            self._interrupt_thread.join(timeout=1.0)
            self._interrupt_thread = None

    def _poll_interrupt_endpoint(self) -> None:
        endpoint_interrupt = self._endpoint_interrupt
        if endpoint_interrupt is None:
            return

        while not self._stop_interrupt.is_set():
            try:
                data = self.usb_device.read(
                    endpoint_interrupt,
                    self._interrupt_packet_size,
                    timeout=100,
                )
            except usb.core.USBError:
                self._stop_interrupt.wait(0.01)
                continue

            if len(data) == 0:
                continue

            try:
                self._interrupt_handler(self, None, None)
            except Exception as e:
                logging.warning("USBTMC interrupt handler failed: %s", e)

    def _next_tag(self) -> int:
        tag = self._tag_counter & 0xFF
        self._tag_counter = (self._tag_counter + 1) & 0xFF
        if tag == 0:
            tag = 1
        self._last_tag = tag
        return tag

    def _require_endpoint_out(self) -> int:
        if self._endpoint_out is None:
            raise USBTMCTransportError("USBTMC endpoint OUT not initialized.")
        return self._endpoint_out

    def _require_endpoint_in(self) -> int:
        if self._endpoint_in is None:
            raise USBTMCTransportError("USBTMC endpoint IN not initialized.")
        return self._endpoint_in


def _parse_scpi_values(response: str) -> list[str]:
    split_on_whitespace = not _has_top_level_comma(response)
    values: list[str] = []
    current: list[str] = []
    in_quote = False
    i = 0

    while i < len(response):
        char = response[i]

        if char == '"':
            if in_quote and i + 1 < len(response) and response[i + 1] == '"':
                current.append('"')
                i += 2
                continue
            in_quote = not in_quote
            i += 1
            continue

        if (
                not in_quote
                and (
                    char == ","
                    or (split_on_whitespace and char.isspace())
                )):
            if current:
                values.append("".join(current).strip())
                current = []
            i += 1
            continue

        current.append(char)
        i += 1

    if current:
        values.append("".join(current).strip())

    return values


def _has_top_level_comma(response: str) -> bool:
    in_quote = False
    i = 0

    while i < len(response):
        char = response[i]
        if char == '"':
            if in_quote and i + 1 < len(response) and response[i + 1] == '"':
                i += 2
                continue
            in_quote = not in_quote
        elif char == "," and not in_quote:
            return True
        i += 1

    return False


def _convert_ascii_values(
        values: Sequence[str],
        converter: ASCII_CONVERTER = "f") -> Sequence[Any]:
    if callable(converter):
        return [converter(value) for value in values]

    if converter == "s":
        return list(values)

    if converter == "f":
        return [float(value) for value in values]

    raise ValueError(f"Unsupported ASCII converter: {converter!r}")


def _format_binary_block(
        command: str,
        data: Sequence[int | float],
        datatype: BINARY_DATATYPE = "B") -> bytes:
    payload = _encode_binary_values(data, datatype)
    length = str(len(payload)).encode()
    return (
        command.encode()
        + b" #"
        + str(len(length)).encode()
        + length
        + payload
    )


def _encode_binary_values(
        data: Sequence[int | float],
        datatype: BINARY_DATATYPE = "B") -> bytes:
    if datatype != "B":
        raise ValueError(f"Unsupported binary datatype: {datatype!r}")

    return bytes(int(value) & 0xFF for value in data)


def _parse_binary_block(response: bytes) -> bytes:
    if not response.startswith(b"#"):
        raise ValueError("USBTMC response does not start with a SCPI block.")

    if len(response) < 2:
        raise ValueError("USBTMC SCPI block header is incomplete.")

    length_digits = response[1] - ord("0")
    if length_digits < 0 or length_digits > 9:
        raise ValueError("USBTMC SCPI block header has invalid length field.")

    if length_digits == 0:
        return response[2:].rstrip(b"\n")

    header_length = 2 + length_digits
    if len(response) < header_length:
        raise ValueError("USBTMC SCPI block header is incomplete.")

    try:
        payload_length = int(response[2:header_length].decode())
    except ValueError as e:
        raise ValueError(
            "USBTMC SCPI block header has invalid digits.") from e

    payload = response[header_length:header_length + payload_length]
    if len(payload) < payload_length:
        raise ValueError("USBTMC SCPI block payload is incomplete.")

    return payload


def _decode_binary_values(
        payload: bytes,
        datatype: BINARY_DATATYPE = "B") -> Sequence[int | float]:
    if datatype != "B":
        raise ValueError(f"Unsupported binary datatype: {datatype!r}")

    return list(payload)


class DeviceInternal:
    """
    Internal class for handling low-level USB SCPI communication.
    """

    LOCK_TIMEOUT_SECONDS = 2.0

    def __init__(
            self,
            usb_device: usb.core.Device,
            interrupt_handler: Callable[[Any, Any, Any], None]):
        """Initialize the DeviceInternal instance."""
        self.usb_device = usb_device
        self.name = usb_device.product
        self.serial_number = usb_device.serial_number
        self.instrument: Optional[_USBTMCInstrument] = None
        self._lock = Lock()
        self._interrupt_handler = interrupt_handler
        self.resource_string = (
            f"USB0::{getattr(self.usb_device, 'idVendor')}::"
            f"{getattr(self.usb_device, 'idProduct')}::"
            f"{self.usb_device.serial_number}::4::INSTR"
        )

    @classmethod
    def parse_scpi_string(cls, scpi_string: str) -> str:
        """
        Interpret a SCPI string by removing leading and trailing quotation
        marks and unescaping any escaped characters.
        """
        if scpi_string.startswith('"') and scpi_string.endswith('"'):
            scpi_string = scpi_string[1:-1]

        return scpi_string.replace('""', '"')

    def check_for_error(self, command: str) -> None:
        """
        Query the instrument for errors and raise when one is reported.
        """
        if self.instrument is None:
            logging.error(
                "Instrument is not initialized when sending command %s.",
                command)
            raise RuntimeError(
                "Instrument is not initialized when checking for errors on "
                "command %s." % command)

        try:
            error = self.instrument.query_ascii_values("SYST:ERR?", "s")

            if error and len(error) != 2:
                logging.error(
                    "Unexpected error response format for command %s: %s",
                    command,
                    error)
                raise ValueError(
                    f"Expected 2 parameters in the error response, got: "
                    f"{error}")

            if int(error[0]) != 0:
                logging.error(
                    "Instrument error for command %s: %s (code %s)",
                    command,
                    error[1],
                    self.parse_scpi_string(str(error[0])))
                raise RuntimeError(
                    f"Instrument error for message `{command}`: {error[1]} "
                    f"(code {self.parse_scpi_string(str(error[0]))})")
        except USBTMCTransportError as e:
            logging.error(
                "Failed to check for errors when sending command %s: %s",
                command,
                e)
            raise RuntimeError(
                "Failed to communicate with the instrument.") from e

    def _acquire_lock(self, command: str) -> None:
        """Acquire the internal transport lock with timeout protection."""
        if not self._lock.acquire(timeout=self.LOCK_TIMEOUT_SECONDS):
            raise TimeoutError(
                f"Timed out waiting for device lock while handling command "
                f"{command!r}."
            )

    async def write_ascii_and_check(self, command: str) -> None:
        """Write a command to the instrument and check for errors."""
        logging.debug("Writing command to instrument: %s", command)

        lock_acquired = False

        try:
            self._acquire_lock(command)
            lock_acquired = True
            instrument = self.instrument
            if instrument is None:
                raise RuntimeError("Instrument is not initialized.")

            instrument.write(command)
            self.check_for_error(command)
        except USBTMCTransportError as e:
            logging.error("Failed to write command '%s': %s", command, e)
            raise RuntimeError(
                "Failed to communicate with the instrument.") from e
        finally:
            if lock_acquired:
                self._lock.release()

    async def write_binary_and_check(
            self,
            command: str,
            data: Sequence[int | float],
            datatype: BINARY_DATATYPE = "B") -> None:
        """Write binary data to the instrument and check for errors."""
        logging.debug("Writing binary command to instrument: %s", command)

        lock_acquired = False

        try:
            self._acquire_lock(command)
            lock_acquired = True
            instrument = self.instrument
            if instrument is None:
                logging.error(
                    "Instrument is not initialized when sending command %s.",
                    command)
                raise RuntimeError(
                    "Instrument is not initialized when sending command %s."
                    % command)

            instrument.write_binary_values(
                command, data, datatype=datatype)
            self.check_for_error(command)
        except USBTMCTransportError as e:
            logging.error(
                "Failed to write binary command '%s': %s", command, e)
            raise RuntimeError(
                "Failed to communicate with the instrument.") from e
        finally:
            if lock_acquired:
                self._lock.release()

    async def query_ascii_values_and_check(
            self,
            command: str,
            converter: ASCII_CONVERTER = "f") -> Sequence[Any]:
        """Query the instrument for ASCII values."""
        logging.debug("Querying ASCII values from instrument: %s", command)

        lock_acquired = False

        try:
            self._acquire_lock(command)
            lock_acquired = True
            instrument = self.instrument
            if instrument is None:
                logging.error(
                    "Instrument is not initialized when sending command %s.",
                    command)
                raise RuntimeError(
                    "Instrument is not initialized when sending command %s."
                    % command)

            return instrument.query_ascii_values(command, converter)
        except USBTMCTransportError as e:
            logging.error(
                "Failed to query ASCII values for command %s: %s", command, e)
            self.check_for_error(command)
            return []
        finally:
            if lock_acquired:
                self._lock.release()

    async def query_binary_value_and_check(
            self,
            command: str,
            datatype: BINARY_DATATYPE = "B",
            container: type = list) -> Sequence[int | float]:
        """Query the instrument for binary values."""
        logging.debug("Querying binary values from instrument: %s", command)

        data: Optional[Sequence[int | float]] = None

        lock_acquired = False

        try:
            self._acquire_lock(command)
            lock_acquired = True
            instrument = self.instrument
            if instrument is None:
                raise RuntimeError(
                    "Instrument must be initialized before fetching capture "
                    "data."
                )

            data = instrument.query_binary_values(
                command, datatype=datatype, container=container
            )

            self.check_for_error(command)
        except USBTMCTransportError as e:
            logging.error(
                "Failed to query binary data for command %s: %s", command, e)
            raise RuntimeError(
                "Failed to communicate with the instrument.") from e
        finally:
            if lock_acquired:
                self._lock.release()

        if not data:
            logging.error(
                "No data received from the device when sending command %s.",
                command)
            raise RuntimeError("No data received from the device.")

        assert isinstance(
            data, list), "Expected capture data to be of type list."

        return data

    async def connect(self) -> None:
        """
        Connect to the device using the underlying transport.
        """
        if self.instrument is not None:
            logging.warning(
                "Instrument already exists for %s; closing stale instrument "
                "before reconnecting.",
                self.resource_string,
            )
            await self.disconnect()

        instrument = _USBTMCInstrument(
            self.usb_device, self._interrupt_handler)

        try:
            instrument.open()
            drained = instrument.drain_output()
            logging.debug(
                "Drained %d bytes from instrument's output buffer.", drained)
            self.instrument = instrument
        except Exception:
            instrument.close()
            self.instrument = None
            raise

    async def disconnect(self) -> None:
        """
        Disconnect from the device.
        """
        lock_acquired = False
        try:
            self._acquire_lock("disconnect")
            lock_acquired = True

            instrument = self.instrument
            self.instrument = None

            if instrument is not None:
                try:
                    instrument.close()
                except USBTMCTransportError as e:
                    logging.warning("Failed to close instrument cleanly: %s", e)
        finally:
            if lock_acquired:
                self._lock.release()

    @property
    def connected(self) -> bool:
        return self.instrument is not None
