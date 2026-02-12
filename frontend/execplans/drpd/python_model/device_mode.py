"""
Copyright (c) 2025 MTA, Inc.

The Device class enables communication with DRPD devices 
over USB using SCPI commands.
"""

from .device_internal import DeviceInternal
from .types import Mode, CCBusState


class DeviceMode:
    """
    Represents the device mode-related commands for a DRPD device.
    """

    MODE_CONFIG_KEY = "device_mode"

    def __init__(self, internal: DeviceInternal):
        """Initialize the DeviceMode with the given internal device interface.
        :param internal: The internal device interface.
        :type internal: DeviceInternal
        """
        self._internal = internal

    async def load_config(self, config: dict) -> None:
        """
        Load the device mode configuration from the given config dictionary.

        :param config: The configuration dictionary.
        :type config: dict
        """
        if self.MODE_CONFIG_KEY in config:
            mode_str = config[self.MODE_CONFIG_KEY]

            try:
                mode = Mode.from_string(mode_str)
                await self.set(mode)
            except ValueError:
                await self.set(Mode.DISABLED)
        else:
            await self.set(Mode.DISABLED)

    async def save_config(self) -> dict:
        """
        Save the current device mode configuration to a dictionary.

        :return: The configuration dictionary.
        :rtype: dict
        """
        mode = await self.get()
        return {self.MODE_CONFIG_KEY: mode.value}

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
