"""
Copyright (c) 2025 MTA, Inc.

Base class for transport implementations.
"""

from abc import ABC, abstractmethod


class Transport(ABC):
    """
    Base class for transport implementations.
    """

    @abstractmethod
    async def connect(self) -> None:
        """
        Connect to the transport.
        This method should be implemented by subclasses to establish a connection.
        """

    @abstractmethod
    async def send(self, data: bytes, timeout: float = 1.0) -> None:
        """
        Send data over the transport.

        Args:
            data (bytes): The data to send.
            timeout (float): The timeout for sending the data.
        """

    async def send_line(self, line: str, timeout: float = 0.1) -> None:
        """
        Send a line of data to the USB device.

        Args:
            line (str): The line to send. A newline character is automatically appended.
            timeout (float): The timeout for the send operation in seconds. Default is 0.1.

        Raises:
            TimeoutError: If the send operation times out.
        """
        await self.send((line + '\n').encode('utf-8'), timeout)

    @abstractmethod
    async def receive(self, size: int, timeout: float = 1.0) -> bytes:
        """
        Receive data from the transport.

        Args:
            size (int): The number of bytes to receive.
            timeout (float): The timeout for receiving the data.

        Returns:
            bytes: The received data.
        """

    async def receive_line(self, timeout: float = 0.1) -> str:
        """
        Receive a line of data from the transport.

        Args:
            timeout (float): The timeout for the receive operation in seconds. Default is 0.1.

        Returns:
            str: The received line, with trailing newline characters stripped.

        Raises:
            TimeoutError: If the receive operation times out.
        """
        buffer = bytearray()
        while True:
            char = await self.receive(1, timeout)
            if char == b'\n':
                break
            buffer.extend(char)

        return buffer.decode('utf-8').rstrip('\r\n')

    @abstractmethod
    async def disconnect(self) -> None:
        """
        Disconnect from the transport.
        This method should be implemented by subclasses to close the connection.
        """

    @property
    @abstractmethod
    def connected(self) -> bool:
        """
        Check if the transport is connected.

        Returns:
            bool: True if connected, False otherwise.
        """
