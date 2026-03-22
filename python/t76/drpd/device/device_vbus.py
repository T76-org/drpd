"""
Copyright (c) 2025 MTA, Inc.

The Device class enables communication with DRPD devices
over USB using SCPI commands.
"""

from dataclasses import dataclass

from t76.drpd.device.types import (
    VBusState
)

from .device_internal import DeviceInternal


@dataclass
class VBusInfo:
    """
    Represents information about the VBus system of the DRPD device.
    """

    state: VBusState
    ovp_threshold: float
    ocp_threshold: float
    ovp_event_timestamp_us: int | None
    ocp_event_timestamp_us: int | None


class DeviceVBus:
    """
    Represents the VBus system of the DRPD device.
    """

    OVP_KEY = "vbus_ovp_threshold"
    OCP_KEY = "vbus_ocp_threshold"

    def __init__(self, device_internal: DeviceInternal):
        """
        Initialize the DeviceVBus with the given DeviceInternal.

        :param device_internal: The internal device communication handler.
        :type device_internal: DeviceInternal
        """
        self._internal = device_internal

    async def load_config(self, config: dict) -> None:
        """
        Load the VBus configuration from a dictionary.
        :param config: A dictionary representing the VBus configuration.
        :type config: dict
        """
        if self.OVP_KEY in config:
            try:
                await self.set_ovp_threshold(float(config[self.OVP_KEY]))
            except ValueError:
                await self.set_ovp_threshold(60.0)

        if self.OCP_KEY in config:
            try:
                await self.set_ocp_threshold(float(config[self.OCP_KEY]))
            except ValueError:
                await self.set_ocp_threshold(6.0)

    async def save_config(self) -> dict:
        """
        Save the current trigger configuration to a dictionary.

        :return: A dictionary representing the trigger configuration.
        :rtype: dict
        """
        config = {
            self.OVP_KEY: await self.get_ovp_threshold(),
            self.OCP_KEY: await self.get_ocp_threshold(),
        }

        return config

    async def reset(self) -> None:
        """
        Reset the device's VBus
        """
        await self._internal.write_ascii_and_check("BUS:VBUS:RESET")

    async def get_state(self) -> VBusState:
        """
        Get the current VBus status of the device.

        :return: The current VBus status.
        """
        state, _, _ = await self._get_status_fields()
        return state

    async def _get_status_fields(self) -> tuple[VBusState, int | None, int | None]:
        """
        Query the expanded VBUS status response.

        :return: Tuple of state, OVP event timestamp, and OCP event timestamp.
        :rtype: tuple[VBusState, int | None, int | None]
        """
        response = await self._internal.query_ascii_values_and_check("BUS:VBUS:STAT?", "s")
        if len(response) < 3:
            raise ValueError(
                f"Invalid BUS:VBUS:STAT? response. Expected 3 fields, got {len(response)}"
            )

        def parse_optional_timestamp(value: str) -> int | None:
            token = value.strip().upper()
            if token == "NONE":
                return None
            return int(value)

        return (
            VBusState.from_string(response[0].strip()),
            parse_optional_timestamp(response[1]),
            parse_optional_timestamp(response[2]),
        )

    async def get_ovp_threshold(self) -> float:
        """
        Get the Over Voltage Protection (OVP) threshold.

        :return: The OVP threshold in volts.
        :rtype: float
        """
        response = await self._internal.query_ascii_values_and_check("BUS:VBUS:OVPT?", "f")
        return response[0]

    async def set_ovp_threshold(self, threshold: float) -> None:
        """
        Set the Over Voltage Protection (OVP) threshold.

        :param threshold: The OVP threshold in volts.
        :type threshold: float
        """
        await self._internal.write_ascii_and_check(f"BUS:VBUS:OVPT {threshold:.2f}")

    async def get_ocp_threshold(self) -> float:
        """
        Get the Over Current Protection (OCP) threshold.

        :return: The OCP threshold in amps.
        :rtype: float
        """
        response = await self._internal.query_ascii_values_and_check("BUS:VBUS:OCPT?", "f")
        return response[0]

    async def set_ocp_threshold(self, threshold: float) -> None:
        """
        Set the Over Current Protection (OCP) threshold.

        :param threshold: The OCP threshold in amps.
        :type threshold: float
        """
        await self._internal.write_ascii_and_check(f"BUS:VBUS:OCPT {threshold:.2f}")

    async def get_info(self) -> VBusInfo:
        """
        Get comprehensive information about the VBus system.

        :return: A VBusInfo object containing the VBus state,
                 OVP threshold, and OCP threshold.
        :rtype: VBusInfo
        """
        state, ovp_event_timestamp_us, ocp_event_timestamp_us = await self._get_status_fields()
        ovp_threshold = await self.get_ovp_threshold()
        ocp_threshold = await self.get_ocp_threshold()

        return VBusInfo(
            state=state,
            ovp_threshold=ovp_threshold,
            ocp_threshold=ocp_threshold,
            ovp_event_timestamp_us=ovp_event_timestamp_us,
            ocp_event_timestamp_us=ocp_event_timestamp_us,
        )
