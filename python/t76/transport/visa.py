"""
Copyright (c) 2025 MTA, Inc.

VISA Transport Module

This module provides a transport implementation using PyVISA for communication with VISA-compatible instruments.
"""

from typing import Optional

import pyvisa

from .transport import Transport


class VisaTransport(Transport):
    """
    A transport implementation using PyVISA for communication with VISA-compatible instruments.

    This class provides methods to connect, send, and receive data from instruments that support the VISA protocol.
    """

    def __init__(self, resource_string: str):
        """
        Initialize the VisaTransport with a VISA resource string.

        Args:
            resource_string (str): The VISA resource string identifying the instrument.
        """
        self.resource_string = resource_string
        self.instrument: Optional[pyvisa.resources.MessageBasedResource] = None

    async def connect(self) -> None:
        """Connect to the VISA instrument."""
        rm = pyvisa.ResourceManager()

        self.instrument = rm.open_resource(
            self.resource_string)  # type: ignore

        if not isinstance(self.instrument, pyvisa.resources.MessageBasedResource):
            raise TypeError("Resource is not a MessageBasedResource")

        self.instrument.write_termination = ''
        self.instrument.read_termination = ''

    async def send(self, data: bytes, timeout: float = 1.0) -> None:
        """
        Send data to the VISA instrument.

        Args:
            data (bytes): The data to send.
            timeout (float): The timeout for sending the data in seconds. Defaults to 0.1
        """
        if self.instrument is None:
            raise ConnectionError(
                "Instrument not connected. Call connect() first.")

        self.instrument.timeout = timeout
        self.instrument.write_raw(data)

    async def receive(self, size: int, timeout: float = 1.0) -> bytes:
        """
        Receive data from the VISA instrument.

        Args:
            size (int): The number of bytes to receive.
            timeout (float): The timeout for receiving the data in seconds. Defaults to 1.0.

        Returns:
            bytes: The received data.
        """
        if self.instrument is None:
            raise ConnectionError(
                "Instrument not connected. Call connect() first.")

        self.instrument.timeout = timeout
        data = self.instrument.read_bytes(size)
        return data

    async def receive_line(self, timeout: float = 0.1) -> str:
        assert self.instrument is not None, "Instrument not connected. Call connect() first."

        self.instrument.timeout = timeout
        return self.instrument.read()

    async def disconnect(self) -> None:
        """Disconnect from the VISA instrument."""
        if self.instrument is not None:
            self.instrument.close()
            self.instrument = None

    @property
    def connected(self) -> bool:
        """Check if the transport is connected to the instrument."""
        return self.instrument is not None and self.instrument.session is not None
