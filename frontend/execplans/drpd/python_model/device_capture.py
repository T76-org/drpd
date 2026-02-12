"""
Copyright (c) 2025 MTA, Inc.

The Device class enables communication with DRPD devices 
over USB using SCPI commands.
"""

from typing import Callable

from async_lru import alru_cache

from ..message.bmc_sequence import BMCSequence

from .device_internal import DeviceInternal

from .types import OnOffStatus


class DeviceCapture:
    """
    Provides methods to control and retrieve data captures from a DRPD device.
    :param internal: The internal device communication handler.
    :type internal: DeviceInternal
    """

    ENABLED_CONFIG_KEY = "enabled"

    def __init__(self, internal: DeviceInternal, capture_fetched_callback: Callable[[BMCSequence], None]):
        self._internal = internal
        self._capture_fetched_callback = capture_fetched_callback

    async def load_config(self, config: dict) -> None:
        """
        Load capture configuration from a dictionary.

        :param config: A dictionary containing capture configuration.
        :type config: dict
        """
        if self.ENABLED_CONFIG_KEY in config:
            if OnOffStatus.from_string(config[self.ENABLED_CONFIG_KEY]) == OnOffStatus.ON:
                await self.start()
            else:
                await self.stop()
        else:
            await self.stop()

    async def save_config(self) -> dict:
        """
        Save the current capture configuration to a dictionary.

        :return: A dictionary containing the current capture configuration.
        :rtype: dict
        """
        status = await self.get_status()
        return {
            self.ENABLED_CONFIG_KEY: status.name
        }

    async def start(self) -> None:
        """
        Start capturing data on the device.
        """
        await self._internal.write_ascii_and_check("BUS:CC:CAP:EN ON")

    async def stop(self) -> None:
        """
        Stop capturing data on the device.
        """
        await self._internal.write_ascii_and_check("BUS:CC:CAP:EN OFF")

    async def get_status(self) -> OnOffStatus:
        """
        Get the current capture status of the device.

        :return: The current capture status.
        :rtype: OnOffStatus

        :raises ValueError: If the response from the device does not contain the expected value.
        """
        result = await self._internal.query_ascii_values_and_check(
            "BUS:CC:CAP:EN?", DeviceInternal.parse_scpi_string)

        if not result:
            raise ValueError("Failed to retrieve capture status from device.")

        return OnOffStatus.from_string(result[0])

    @alru_cache
    async def get_cycle_length(self) -> float:
        """
        Get the current capture cycle length of the device.

        :return: The current capture cycle length in seconds.
        :rtype: float

        :raises ValueError: If the response from the device does not contain the expected value.
        """
        result = await self._internal.query_ascii_values_and_check(
            "BUS:CC:CAP:CYCLETIME?", DeviceInternal.parse_scpi_string)

        if not result:
            raise ValueError(
                "Failed to retrieve capture cycle length from device.")

        return float(result[0]) / 1e9  # Convert from nanoseconds to seconds

    async def reset(self) -> None:
        """
        Reset the capture data on the device.
        """
        await self._internal.write_ascii_and_check("BUS:CC:CAP:CLEAR")

    async def get_capture_count(self) -> int:
        """
        Get the number of available captures on the device.

        :return: The number of available captures.
        :rtype: int

        :raises ValueError: If the response from the device does not contain a valid integer.
        """
        result = await self._internal.query_ascii_values_and_check("BUS:CC:CAP:COUNT?")

        if not result:
            raise ValueError(
                "Failed to retrieve available captures from device.")

        return int(result[0])

    async def _fetch_next_capture(self) -> None:
        """
        Fetch the next capture data from the device.

        :return: The capture data as a sequence of integers.
        :rtype: BMCSequence

        :raises RuntimeError: If there is an error communicating with the instrument.
        """
        data = await self._internal.query_binary_value_and_check("BUS:CC:CAPture:DATA?")

        result = BMCSequence.from_scpi_response(list(map(int, data)), await self.get_cycle_length())

        self._capture_fetched_callback(result)

    async def fetch_extant_captures(self) -> None:
        """
        Fetch all extant captures from the device and notify observers.
        """

        while True:
            captures_available = await self.get_capture_count()

            if captures_available == 0:
                break

            while captures_available > 0:
                await self._fetch_next_capture()
                captures_available -= 1
