"""
Copyright (c) 2025 MTA, Inc.

The Device class enables communication with DRPD devices
over USB using SCPI commands.
"""

from .cable_test import CableTestResult
from .device_internal import DeviceInternal
from .types import Mode, CCBusState


class DeviceMode:
    """
    Represents the device mode-related commands for a DRPD device.
    """

    def __init__(self, internal: DeviceInternal):
        """Initialize the DeviceMode with the given internal device interface.
        :param internal: The internal device interface.
        :type internal: DeviceInternal
        """
        self._internal = internal

    async def get(self) -> Mode:
        """
        Get the current mode of the device.

        :return: The current mode of the device.
        :rtype: Mode

        Raises:
            ValueError: If the mode cannot be retrieved from the device.
        """
        result = await self._internal.query_ascii_values_and_check(
            "BUS:CC:ROLE?", DeviceInternal.parse_scpi_string)

        if not result:
            raise ValueError("Failed to retrieve mode from device.")

        return Mode.from_string(result[0])

    async def set(self, mode: Mode) -> None:
        """
        Set the mode of the device.

        Args:
            mode (Mode): The mode to set.
        """
        await self._internal.write_ascii_and_check(f"BUS:CC:ROLE {mode.value}")

    async def get_status(self) -> CCBusState:
        """
        Get the current status of the device mode.

        Returns:
            Status: The current status of the device.
        """
        result = await self._internal.query_ascii_values_and_check(
            "BUS:CC:ROLE:STAT?", DeviceInternal.parse_scpi_string)

        if not result:
            raise ValueError("Failed to retrieve status from device.")

        return CCBusState.from_string(result[0])

    async def get_cable_test_result(self) -> CableTestResult:
        """Read cable identity evidence and renew the three-second host lease.

        Start with ``mode.set(Mode.CABLE_TEST)`` and always return to
        ``Mode.DISABLED`` in a finally block. Poll at least once per second.
        No Ra cannot distinguish an empty port from an unmarked cable.
        """
        values = await self._internal.query_ascii_values_and_check(
            "CABLE:TEST?", DeviceInternal.parse_scpi_string)
        return CableTestResult.from_values(list(values))
