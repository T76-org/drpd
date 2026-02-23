"""
Copyright (c) 2025 MTA, Inc.

The Device class enables communication with DRPD devices
over USB using SCPI commands.
"""

import logging

from typing import Any, Callable, Optional, Sequence
from threading import Lock

import pyvisa
import usb

from pyvisa import util
from pyvisa.constants import EventType, EventMechanism
from pyvisa.events import Event
from pyvisa.resources import MessageBasedResource, Resource


class DeviceInternal:
    """
    Internal class for handling low-level USB SCPI communication.
    """

    LOCK_TIMEOUT_SECONDS = 2.0

    def __init__(self, usb_device: usb.core.Device, interrupt_handler: Callable[[Resource, Event, Any], None]):
        """Initialize the DeviceInternal instance.

        :param usb_device: The USB device to communicate with.
        :type usb_device: usb.core.Device
        :param interrupt_handler: The callback function to handle events.
        :type callback: Callable[[Resource, Event, Any], None]
        """
        self.usb_device = usb_device
        self.name = usb_device.product
        self.serial_number = usb_device.serial_number
        self.instrument: Optional[MessageBasedResource] = None
        self._resource_manager: Optional[pyvisa.ResourceManager] = None
        self._lock = Lock()
        self._interrupt_handler = interrupt_handler
        self._wrapped_interrupt_handler: Any = None
        self.resource_string = f"USB0::{getattr(self.usb_device, 'idVendor')}::{getattr(self.usb_device, 'idProduct')}::{self.usb_device.serial_number}::4::INSTR"

    @classmethod
    def parse_scpi_string(cls, scpi_string: str) -> str:
        """
        Interpret a SCPI string by removing leading and trailing quotation
        marks and unescaping any escaped characters.

        :param scpi_string: The SCPI string to interpret.
        :type scpi_string: str

        :return: The interpreted SCPI string.
        :rtype: str

        :raises ValueError: If the SCPI string is not properly formatted.
        :raises TypeError: If the input is not a string.
        """
        if scpi_string.startswith('"') and scpi_string.endswith('"'):
            scpi_string = scpi_string[1:-1]

        return scpi_string.replace('""', '"')

    def check_for_error(self, command: str) -> None:
        """
        This method queries the instrument for any errors and logs them.

        :raises RuntimeError: If there is an error communicating with the instrument.
        :raises AssertionError: If the instrument is not initialized.
        """
        if self.instrument is None:
            logging.error(
                "Instrument is not initialized when sending command %s.", command)
            raise RuntimeError(
                "Instrument is not initialized when checking for errors on command %s." % command)

        try:
            error = self.instrument.query_ascii_values("SYST:ERR?", "s")

            if error and len(error) != 2:
                logging.error(
                    "Unexpected error response format for command %s: %s", command, error)
                raise ValueError(
                    f"Expected 2 parameters in the error response, got: {error}")

            if int(error[0]) != 0:
                logging.error("Instrument error for command %s: %s (code %s)",
                              command, error[1], self.parse_scpi_string(error[0]))
                raise RuntimeError(
                    f"Instrument error for message `{command}`: {error[1]} (code {self.parse_scpi_string(error[0])})")
        except pyvisa.errors.VisaIOError as e:
            logging.error(
                "Failed to check for errors when sending command %s: %s", command, e)
            raise RuntimeError(
                "Failed to communicate with the instrument.") from e

    def _acquire_lock(self, command: str) -> None:
        """Acquire the internal transport lock with timeout protection."""
        if not self._lock.acquire(timeout=self.LOCK_TIMEOUT_SECONDS):
            raise TimeoutError(
                f"Timed out waiting for device lock while handling command {command!r}."
            )

    async def write_ascii_and_check(self, command: str) -> None:
        """
        Write a command to the instrument and check for errors.

        :param command: The SCPI command to write.
        :type command: str

        :raises RuntimeError: If there is an error communicating with the instrument.
        :raises AssertionError: If the instrument is not initialized.
        :raises TypeError: If the command is not a string.
        """
        if self.instrument is None:
            raise RuntimeError("Instrument is not initialized.")

        logging.debug("Writing command to instrument: %s", command)

        lock_acquired = False

        try:
            self._acquire_lock(command)
            lock_acquired = True
            self.instrument.write(command)
            self.check_for_error(command)
        except pyvisa.errors.VisaIOError as e:
            logging.error("Failed to write command '%s': %s", command, e)
            raise RuntimeError(
                "Failed to communicate with the instrument.") from e
        finally:
            if lock_acquired:
                self._lock.release()

    async def write_binary_and_check(self, command: str, data: Sequence[int | float], datatype: util.BINARY_DATATYPES = 'B') -> None:
        """
        Write binary data to the instrument and check for errors.

        :param command: The SCPI command to write.
        :type command: str
        :param data: The binary data to write.
        :type data: Sequence[int | float]
        :param datatype: The datatype of the binary data.
        :type datatype: util.BINARY_DATATYPES

        :raises RuntimeError: If there is an error communicating with the instrument.
        :raises AssertionError: If the instrument is not initialized.
        :raises TypeError: If the command is not a string or data is not a sequence.
        """
        if self.instrument is None:
            logging.error(
                "Instrument is not initialized when sending command %s.", command)
            raise RuntimeError(
                "Instrument is not initialized when sending command %s." % command)

        logging.debug("Writing binary command to instrument: %s", command)

        lock_acquired = False

        try:
            self._acquire_lock(command)
            lock_acquired = True
            self.instrument.write_binary_values(
                command, data, datatype=datatype)
            self.check_for_error(command)
        except pyvisa.errors.VisaIOError as e:
            logging.error(
                "Failed to write binary command '%s': %s", command, e)
            raise RuntimeError(
                "Failed to communicate with the instrument.") from e
        finally:
            if lock_acquired:
                self._lock.release()

    async def query_ascii_values_and_check(self, command: str, converter: util.ASCII_CONVERTER = "f") -> Sequence[Any]:
        """
        Query the instrument for ASCII values and check for errors.

        :param command: The SCPI command to send.
        :type command: str
        :param converter: The converter to use for the response.
        :type converter: util.ASCII_CONVERTER

        :return: A sequence of values returned by the instrument.
        :rtype: Sequence[Any]

        :raises RuntimeError: If there is an error communicating with the instrument.
        :raises AssertionError: If the instrument is not initialized.
        """
        logging.debug("Querying ASCII values from instrument: %s", command)

        if self.instrument is None:
            logging.error(
                "Instrument is not initialized when sending command %s.", command)
            raise RuntimeError(
                "Instrument is not initialized when sending command %s." % command)

        lock_acquired = False

        try:
            self._acquire_lock(command)
            lock_acquired = True
            result = self.instrument.query_ascii_values(command, converter)

            return result
        except pyvisa.errors.VisaIOError as e:
            logging.error(
                "Failed to query ASCII values for command %s: %s", command, e)
            # Attempt to check for errors after a failed query

            self.check_for_error(command)
            return []
        finally:
            if lock_acquired:
                self._lock.release()

    async def query_binary_value_and_check(self, command: str, datatype: util.BINARY_DATATYPES = 'B', container: type = list) -> Sequence[int | float]:
        """
        Query the instrument for binary values and check for errors.

        :param command: The SCPI command to send.
        :type command: str
        :param datatype: The datatype to use for the response.
        :type datatype: util.BINARY_DATATYPES
        :param container: The container type for the response.
        :type container: type

        :return: A sequence of values returned by the instrument.
        :rtype: Sequence[int | float]

        :raises RuntimeError: If there is an error communicating with the instrument.
        :raises AssertionError: If the instrument is not initialized.
        """
        assert self.instrument is not None, "Instrument must be initialized before fetching capture data."

        logging.debug("Querying binary values from instrument: %s", command)

        data: Optional[Sequence[int | float]] = None

        lock_acquired = False

        try:
            self._acquire_lock(command)
            lock_acquired = True
            data = self.instrument.query_binary_values(
                command, datatype=datatype, container=container
            )

            self.check_for_error(command)
        except pyvisa.errors.VisaIOError as e:
            logging.error(
                "Failed to query binary data for command %s: %s", command, e)
            raise RuntimeError(
                "Failed to communicate with the instrument.") from e
        finally:
            if lock_acquired:
                self._lock.release()

        if not data:
            logging.error(
                "No data received from the device when sending command %s.", command)
            raise RuntimeError("No data received from the device.")

        assert isinstance(
            data, list), "Expected capture data to be of type list."

        return data

    async def connect(self) -> None:
        """
        Connect to the device using the underlying transport.
        """
        if self._resource_manager is not None:
            logging.warning(
                "Resource manager already exists for %s; closing stale "
                "manager before reconnecting.",
                self.resource_string,
            )
            await self.disconnect()

        self._resource_manager = pyvisa.ResourceManager()

        try:
            self.instrument = self._resource_manager.open_resource(
                self.resource_string)  # type: ignore

            if not isinstance(self.instrument, MessageBasedResource):
                raise TypeError("Instrument is not a MessageBasedResource.")

            # Set the termination characters for writing and reading
            # This is important for SCPI communication
            # to ensure that commands and responses are properly formatted.
            self.instrument.write_termination = ''
            self.instrument.read_termination = '\n'
            self.instrument.timeout = 100
            self._wrapped_interrupt_handler = self.instrument.wrap_handler(
                self._interrupt_handler
            )
            self.instrument.install_handler(
                EventType.service_request,
                self._wrapped_interrupt_handler,
                None
            )
            self.instrument.enable_event(
                EventType.service_request, EventMechanism.handler)

            # Drain the instrument's output buffer
            logging.debug("Draining instrument's output buffer.")

            drained = 0

            while True:
                try:
                    drained += len(self.instrument.read_raw(1024))
                except pyvisa.errors.VisaIOError:
                    break

            logging.debug(
                "Drained %d bytes from instrument's output buffer.", drained)
        except Exception:
            await self.disconnect()
            raise

    async def disconnect(self) -> None:
        """
        Disconnect from the device.
        """
        instrument = self.instrument
        resource_manager = self._resource_manager

        # Clear references first so repeated disconnects are idempotent
        # and future reconnects start from a clean slate.
        self.instrument = None
        self._resource_manager = None

        if instrument is not None:
            try:
                try:
                    instrument.disable_event(
                        EventType.service_request,
                        EventMechanism.handler,
                    )
                except pyvisa.errors.VisaIOError:
                    pass

                if self._wrapped_interrupt_handler is not None:
                    try:
                        instrument.uninstall_handler(
                            EventType.service_request,
                            self._wrapped_interrupt_handler,
                            None,
                        )
                    except pyvisa.errors.VisaIOError:
                        pass

                instrument.close()
            except pyvisa.errors.VisaIOError as e:
                logging.warning("Failed to close instrument cleanly: %s", e)
            finally:
                self._wrapped_interrupt_handler = None

        if resource_manager is not None:
            try:
                resource_manager.close()
            except pyvisa.errors.VisaIOError as e:
                logging.warning(
                    "Failed to close resource manager cleanly: %s",
                    e,
                )

    @property
    def connected(self) -> bool:
        return self.instrument is not None
