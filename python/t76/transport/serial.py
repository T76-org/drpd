"""
Copyright (c) 2025 MTA Inc.

An asyncio protocol wrapper for serial communications.
"""

from typing import Optional

import asyncio
import serial_asyncio
import usb

from .transport import Transport
from .usb_discovery import get_serial_port_for_device


class SerialTransport(Transport):
    """
    An asyncio protocol wrapper for USB serial.

    This class provides a protocol interface for communicating with USB devices
    over a serial connection.
    """

    def __init__(self, usb_device: Optional[usb.core.Device] = None, serial_port: Optional[str] = None):
        """
        Initialize the SerialTransport with a USB device and an optional serial port.

        Args:
            usb_device (Optional[usb.core.Device]): The USB device to communicate with.
            serial_port (Optional[str]): The serial port to use. If not provided, it will
                be determined from the USB device.
        """
        if usb_device is None and serial_port is None:
            raise ValueError(
                "Either usb_device or serial_port must be provided.")

        if usb_device is not None and serial_port is not None:
            raise ValueError(
                "Only one of usb_device or serial_port should be provided.")

        self.usb_device = usb_device

        self.serial_port = serial_port

        if self.usb_device is not None:
            self.serial_port = get_serial_port_for_device(self.usb_device)

        if self.serial_port is None:
            raise ValueError("Serial port could not be determined.")

        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None

    async def connect(self):
        """Connect to the USB device over the serial port."""

        assert self.serial_port is not None, "Serial port must be set before connecting."

        self.reader, self.writer = await serial_asyncio.open_serial_connection(url=self.serial_port, timeout=1.0)

    async def send(self, data: bytes, timeout: float = 0.1):
        """
        Send data to the USB device.

        Args:
            data (bytes): The data to send.
            timeout (float): The timeout for the send operation in seconds. Default is 0.1.
        """
        if self.writer is None:
            raise RuntimeError(
                "Connection not established. Call connect() first.")

        try:
            self.writer.write(data)
            await asyncio.wait_for(self.writer.drain(), timeout)
        except TimeoutError as exc:
            raise TimeoutError(
                f"Send operation timed out after {timeout} seconds.") from exc

    async def receive(self, size: int = 1, timeout: float = 0.1) -> bytes:
        """
        Receive data from the device.

        Args:
            size (int): The number of bytes to read. Default is 1024.
            timeout (float): The timeout for the read operation in seconds. Default is 1.0.
        Raises:
            TimeoutError: If the read operation times out.
        Returns:
            bytes: The received data.
        """
        if self.reader is None:
            raise RuntimeError(
                "Connection not established. Call connect() first.")

        try:
            return await asyncio.wait_for(self.reader.read(size), timeout)
        except TimeoutError as exc:
            raise TimeoutError(
                f"Read operation timed out after {timeout} seconds.") from exc

    async def receive_line(self, timeout: float = 0.1) -> str:
        """
        Receive a line of data from the device.

        Args:
            timeout (float): The timeout for the read operation in seconds. Default is 0.1.

        Raises:
            TimeoutError: If the read operation times out.

        Returns:
            str: The received line of data.
        """
        if self.reader is None:
            raise RuntimeError(
                "Connection not established. Call connect() first.")

        try:
            line = await asyncio.wait_for(self.reader.readline(), timeout)
            return line.decode('utf-8').strip()
        except TimeoutError as exc:
            raise TimeoutError(
                f"Read operation timed out after {timeout} seconds.") from exc

    async def disconnect(self) -> None:
        """Close the serial connection."""
        if self.writer:
            self.writer.close()
            self.writer = None
        if self.reader:
            self.reader = None
        self.serial_port = None
        self.usb_device = None

    @property
    def connected(self) -> bool:
        """Check if the transport is connected.

        Returns:
            bool: True if connected, False otherwise.
        """
        return self.writer is not None and self.reader is not None
