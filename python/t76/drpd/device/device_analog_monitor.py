"""
Copyright (c) 2025 MTA, Inc.

The Device class enables communication with DRPD devices
over USB using SCPI commands.
"""

import asyncio
import math
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
    VBUS_CURRENT_CALIBRATION_POINT_COUNT = 13
    VBUS_CURRENT_CALIBRATION_INTERVAL_MA = 500

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

    async def set_vbus_calibration_table_point(
        self,
        bucket: int,
        correction: float,
    ) -> None:
        """
        Set one persisted VBUS correction table entry directly.

        :param bucket: The raw VBUS bucket to update.
        :type bucket: int
        :param correction: The additive VBUS correction in volts.
        :type correction: float
        """
        if not isinstance(bucket, int) or isinstance(bucket, bool):
            raise ValueError("bucket must be an integer")

        if bucket < 0 or bucket >= self.VBUS_CALIBRATION_POINT_COUNT:
            raise ValueError(
                "bucket must be in range [0, "
                f"{self.VBUS_CALIBRATION_POINT_COUNT - 1}]"
            )

        if not isinstance(correction, (int, float)) or isinstance(correction, bool):
            raise ValueError("correction must be numeric")

        correction_float = float(correction)
        if not math.isfinite(correction_float):
            raise ValueError("correction must be finite")

        await self._internal.write_ascii_and_check(
            f"BUS:VBUS:CAL:TAB {bucket} {correction_float:.9g}"
        )

    async def set_vbus_calibration_table(self, table: List[float]) -> None:
        """
        Replace the persisted VBUS correction table with explicit values.

        :param table: 61 additive correction entries ordered by bucket index.
        :type table: List[float]
        """
        if len(table) != self.VBUS_CALIBRATION_POINT_COUNT:
            raise ValueError(
                "table must contain "
                f"{self.VBUS_CALIBRATION_POINT_COUNT} entries"
            )

        for bucket, correction in enumerate(table):
            await self.set_vbus_calibration_table_point(bucket, correction)

    async def reset_vbus_calibration_to_defaults(self) -> None:
        """
        Restore the persisted VBUS calibration table to firmware defaults.
        """
        await self._internal.write_ascii_and_check("BUS:VBUS:CAL:DEF")

    async def get_raw_vbus_current(self) -> float:
        """
        Return the latest raw scaled VBUS current before calibration.

        :return: Raw scaled VBUS current in amps.
        :rtype: float
        """
        response = await self._internal.query_ascii_values_and_check(
            "MEAS:CURR:VBUS:RAW?",
            "f",
        )

        if len(response) != 1:
            raise ValueError(
                "Invalid MEAS:CURR:VBUS:RAW? response. Expected "
                f"1 field, got {len(response)}"
            )

        return float(response[0])

    async def get_vbus_current_calibration_table(self) -> List[float]:
        """
        Return the persisted VBUS current raw calibration table.

        :return: A list of 13 raw readings ordered by 500 mA true-current point.
        :rtype: List[float]
        """
        response = await self._internal.query_ascii_values_and_check(
            "BUS:VBUS:CAL:CURR?",
            "f",
        )

        if len(response) != self.VBUS_CURRENT_CALIBRATION_POINT_COUNT:
            raise ValueError(
                "Invalid BUS:VBUS:CAL:CURR? response. Expected "
                f"{self.VBUS_CURRENT_CALIBRATION_POINT_COUNT} fields, got "
                f"{len(response)}"
            )

        return [float(value) for value in response]

    async def calibrate_vbus_current_bucket(self, target_ma: int) -> None:
        """
        Capture a calibration point for the specified raw current.

        :param target_ma: The raw VBUS current target in milliamps.
        :type target_ma: int
        """
        if not isinstance(target_ma, int) or isinstance(target_ma, bool):
            raise ValueError("target_ma must be an integer")

        max_current_ma = (
            self.VBUS_CURRENT_CALIBRATION_POINT_COUNT - 1
        ) * self.VBUS_CURRENT_CALIBRATION_INTERVAL_MA
        if target_ma < 0 or target_ma > max_current_ma:
            raise ValueError(f"target_ma must be in range [0, {max_current_ma}]")

        if target_ma % self.VBUS_CURRENT_CALIBRATION_INTERVAL_MA != 0:
            raise ValueError(
                "target_ma must be aligned to a "
                f"{self.VBUS_CURRENT_CALIBRATION_INTERVAL_MA} mA interval"
            )

        await self._internal.write_ascii_and_check(
            f"BUS:VBUS:CAL:CURR {target_ma}"
        )

    async def set_vbus_current_calibration_table_point(
        self,
        target_ma: int,
        raw_current_a: float,
    ) -> None:
        """
        Set one persisted VBUS current raw calibration entry directly.

        :param target_ma: The true VBUS current point in milliamps.
        :type target_ma: int
        :param raw_current_a: The raw current reading in amps.
        :type raw_current_a: float
        """
        if not isinstance(target_ma, int) or isinstance(target_ma, bool):
            raise ValueError("target_ma must be an integer")

        max_current_ma = (
            self.VBUS_CURRENT_CALIBRATION_POINT_COUNT - 1
        ) * self.VBUS_CURRENT_CALIBRATION_INTERVAL_MA
        if target_ma < 0 or target_ma > max_current_ma:
            raise ValueError(f"target_ma must be in range [0, {max_current_ma}]")

        if target_ma % self.VBUS_CURRENT_CALIBRATION_INTERVAL_MA != 0:
            raise ValueError(
                "target_ma must be aligned to a "
                f"{self.VBUS_CURRENT_CALIBRATION_INTERVAL_MA} mA interval"
            )

        if not isinstance(raw_current_a, (int, float)) or isinstance(raw_current_a, bool):
            raise ValueError("raw_current_a must be numeric")

        raw_current_float = float(raw_current_a)
        if not math.isfinite(raw_current_float):
            raise ValueError("raw_current_a must be finite")

        if raw_current_float < 0.0:
            raise ValueError("raw_current_a must be non-negative")

        await self._internal.write_ascii_and_check(
            f"BUS:VBUS:CAL:CURR:TAB {target_ma} {raw_current_float:.9g}"
        )

    async def set_vbus_current_calibration_table(self, table: List[float]) -> None:
        """
        Replace the persisted VBUS current raw calibration table.

        :param table: 13 raw readings ordered by 500 mA true-current point.
        :type table: List[float]
        """
        if len(table) != self.VBUS_CURRENT_CALIBRATION_POINT_COUNT:
            raise ValueError(
                "table must contain "
                f"{self.VBUS_CURRENT_CALIBRATION_POINT_COUNT} entries"
            )

        for bucket, raw_current_a in enumerate(table):
            await self.set_vbus_current_calibration_table_point(
                bucket * self.VBUS_CURRENT_CALIBRATION_INTERVAL_MA,
                raw_current_a,
            )

    async def reset_vbus_current_calibration_to_defaults(self) -> None:
        """
        Restore the persisted VBUS current calibration table to firmware defaults.
        """
        await self._internal.write_ascii_and_check("BUS:VBUS:CAL:CURR:DEF")

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
