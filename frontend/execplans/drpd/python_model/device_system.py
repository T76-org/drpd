"""
Copyright (c) 2025 MTA, Inc.

The Device class enables communication with DRPD devices 
over USB using SCPI commands.
"""

from async_lru import alru_cache

from .device_internal import DeviceInternal

from .types import (
    MemoryUsage,
    DeviceInfo
)


class DeviceSystem:
    """
    Represents the system-related commands for a DRPD device.
    """

    def __init__(self, internal: DeviceInternal):
        """Initialize the DeviceSystem with the given internal device interface.
        :param internal: The internal device interface.
        :type internal: DeviceInternal
        """
        self._internal = internal

    @alru_cache
    async def identify(self) -> DeviceInfo:
        """
        Identify the device.
        """
        # Send the *IDN? command to the device
        result = await self._internal.query_ascii_values_and_check(
            "*IDN?", DeviceInternal.parse_scpi_string)

        assert len(
            result) == 4, "Expected 4 parameters in the identification response."

        return DeviceInfo(
            manufacturer=result[0],
            model=result[1],
            serial_number=result[2],
            firmware_version=result[3],
        )

    # System commands

    @alru_cache(ttl=1)
    async def get_memory_usage(self) -> MemoryUsage:
        """
        Get the memory usage of the device.

        :param self: The Device instance.
        :return: The memory usage information.
        :rtype: MemoryUsage

        :raises ValueError: If the response from the device does not contain the expected number of parameters.

        Note that this method caches the result for 1 second to avoid frequent calls
        to the device.
        """
        result = await self._internal.query_ascii_values_and_check("SYST:MEM?")

        assert len(
            result) == 2, "Expected 2 parameters in the memory usage response."

        return MemoryUsage(
            total=int(result[0]),
            free=int(result[1]),
        )

    @alru_cache
    async def get_clock_frequency(self) -> int:
        """
        Get the clock frequency of the device.

        :return: The clock frequency in Hz.
        :rtype: int

        :raises ValueError: If the response from the device is empty or invalid.

        Note that this method caches the result for 1s to avoid frequent calls to the device.
        """
        result = await self._internal.query_ascii_values_and_check("SYST:SP?")

        if not result:
            raise ValueError("Failed to retrieve clock frequency from device.")

        return int(result[0])

    @alru_cache(ttl=1)
    async def get_uptime(self) -> int:
        """
        Get the uptime of the device in seconds.

        :return: The uptime in seconds.
        :rtype: int

        :raises ValueError: If the response from the device is empty or invalid.

        Note that this method caches the result for 1 second to avoid frequent calls to the device.
        """
        result = await self._internal.query_ascii_values_and_check("SYST:UPT?")

        if not result:
            raise ValueError("Failed to retrieve uptime from device.")

        return result[0] / 1_000_000  # Convert from microseconds to seconds

    @alru_cache(ttl=1)
    async def get_timestamp(self) -> str:
        """
        Get the current timestamp from the device.

        :return: The current timestamp according to the device.
        :rtype: str

        :raises ValueError: If the response from the device is empty or invalid.

        Note that this method caches the result for 1 second to avoid frequent calls to the device.
        """
        result = await self._internal.query_ascii_values_and_check("SYST:TIME?")

        if not result:
            raise ValueError("Failed to retrieve timestamp from device.")

        return result[0]
