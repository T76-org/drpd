"""
Copyright (c) 2025 MTA, Inc.

The Device class enables communication with DRPD devices 
over USB using SCPI commands.
"""

import asyncio
from typing import TYPE_CHECKING, Optional

from async_lru import alru_cache

from .device_internal import DeviceInternal
from .events import AnalogMonitorStatusChanged
from .types import (AnalogMonitorChannels)

if TYPE_CHECKING:
    from .device import Device


class DeviceAnalogMonitor:
    """
    Represents the analog monitor-related commands for a DRPD device.
    """

    def __init__(self, internal: DeviceInternal, device: Optional["Device"] = None):
        """Initialize the DeviceAnalogMonitor with the given internal
        device interface.

        :param internal: The internal device interface.
        :type internal: DeviceInternal
        :param device: Optional reference to the Device object for event
                       dispatching.
        :type device: Optional[Device]
        """
        self._internal = internal
        self._device = device
        self._recurring_task: Optional[asyncio.Task] = None

    @alru_cache(ttl=0.1)
    async def get_status(self) -> AnalogMonitorChannels:
        """
        Get the analog monitor voltages from the device.

        :return: An AnalogMonitorChannels object containing the voltages.
        :rtype: AnalogMonitorChannels

        :raises ValueError: If the response from the device does not contain the expected number of parameters.
        """
        result = await self._internal.query_ascii_values_and_check(
            "MEAS:ALL?",
            "s",
        )

        if len(result) not in (9, 10):
            raise ValueError(
                "Expected 9 or 10 parameters in the voltage response."
            )

        if len(result) == 10:
            vbus_timestamp_us = int(result[0])
            data_offset = 1
        else:
            vbus_timestamp_us = None
            data_offset = 0

        return AnalogMonitorChannels(
            vbus_timestamp_us=vbus_timestamp_us,
            vbus=float(result[data_offset + 0]),
            ibus=float(result[data_offset + 1]),
            dut_cc1=float(result[data_offset + 2]),
            dut_cc2=float(result[data_offset + 3]),
            usds_cc1=float(result[data_offset + 4]),
            usds_cc2=float(result[data_offset + 5]),
            adc_vref=float(result[data_offset + 6]),
            ground_ref=float(result[data_offset + 7]),
            current_vref=float(result[data_offset + 8]),
        )

    async def start_recurring_status_updates(
            self,
            frequency: float) -> None:
        """
        Start a recurring task that periodically fetches analog monitor
        status and emits an event with the result.

        :param frequency: The frequency (in seconds) at which to update
                          the status.
        :type frequency: float

        :raises RuntimeError: If a recurring task is already running.
        """
        if self._recurring_task is not None:
            raise RuntimeError(
                "A recurring status update task is already running."
            )

        self._recurring_task = asyncio.create_task(
            self._recurring_status_update(frequency)
        )

    async def stop_recurring_status_updates(self) -> None:
        """
        Stop the recurring status update task.

        :raises RuntimeError: If no recurring task is currently running.
        """
        if self._recurring_task is None:
            raise RuntimeError(
                "No recurring status update task is currently running."
            )

        self._recurring_task.cancel()

        try:
            await self._recurring_task
        except asyncio.CancelledError:
            pass

        self._recurring_task = None

    async def _recurring_status_update(self, frequency: float) -> None:
        """
        Internal method that implements the recurring status update loop.

        :param frequency: The frequency (in seconds) at which to update
                          the status.
        :type frequency: float
        """
        try:
            while True:
                await asyncio.sleep(frequency)

                status = await self.get_status()

                assert self._device is not None, "Device reference is required for event dispatching."

                event = AnalogMonitorStatusChanged(self._device, status)
                result = self._device.events.dispatch_event(event)

                if asyncio.iscoroutine(result):
                    await result
        except asyncio.CancelledError:
            pass
