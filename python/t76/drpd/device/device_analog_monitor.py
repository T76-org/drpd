"""
Copyright (c) 2025 MTA, Inc.

The Device class enables communication with DRPD devices
over USB using SCPI commands.
"""

import asyncio
from typing import TYPE_CHECKING, List, Optional

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

    VBUS_CALIBRATION_POINT_COUNT = 61

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

        if len(result) not in (9, 10, 12, 13):
            raise ValueError(
                "Expected 9, 10, 12, or 13 parameters in the voltage response."
            )

        if len(result) in (10, 13):
            vbus_timestamp_us = int(result[0])
            data_offset = 1
        else:
            vbus_timestamp_us = None
            data_offset = 0

        if len(result) - data_offset >= 12:
            accumulation_elapsed_time_us = int(result[data_offset + 9])
            accumulated_charge_mah = int(result[data_offset + 10])
            accumulated_energy_mwh = int(result[data_offset + 11])
        else:
            accumulation_elapsed_time_us = None
            accumulated_charge_mah = None
            accumulated_energy_mwh = None

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
            accumulation_elapsed_time_us=accumulation_elapsed_time_us,
            accumulated_charge_mah=accumulated_charge_mah,
            accumulated_energy_mwh=accumulated_energy_mwh,
        )

    async def get_vbus_calibration_table(self) -> List[float]:
        """
        Return the persisted VBUS calibration correction table.

        :return: A list of 61 correction entries ordered by bucket index.
        :rtype: List[float]
        """
        response = await self._internal.query_ascii_values_and_check(
            "BUS:VBUS:CAL?",
            "f",
        )

        if len(response) != self.VBUS_CALIBRATION_POINT_COUNT:
            raise ValueError(
                "Invalid BUS:VBUS:CAL? response. Expected "
                f"{self.VBUS_CALIBRATION_POINT_COUNT} fields, got "
                f"{len(response)}"
            )

        return [float(value) for value in response]

    async def calibrate_vbus_bucket(self, bucket: int) -> None:
        """
        Capture a calibration point for the specified raw-voltage bucket.

        :param bucket: The raw VBUS bucket to calibrate.
        :type bucket: int
        """
        if not isinstance(bucket, int) or isinstance(bucket, bool):
            raise ValueError("bucket must be an integer")

        if bucket < 0 or bucket >= self.VBUS_CALIBRATION_POINT_COUNT:
            raise ValueError(
                "bucket must be in range [0, "
                f"{self.VBUS_CALIBRATION_POINT_COUNT - 1}]"
            )

        await self._internal.write_ascii_and_check(f"BUS:VBUS:CAL {bucket}")

    async def reset_vbus_calibration_to_defaults(self) -> None:
        """
        Restore the persisted VBUS calibration table to firmware defaults.
        """
        await self._internal.write_ascii_and_check("BUS:VBUS:CAL:DEF")

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
