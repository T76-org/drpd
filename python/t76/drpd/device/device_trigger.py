"""
Copyright (c) 2025 MTA, Inc.

The Device class enables communication with DRPD devices
over USB using SCPI commands.
"""

from dataclasses import dataclass

from t76.drpd.device.types import (
    OnOffStatus,
    TriggerStatus,
    TriggerSyncMode,
    TriggerType
)

from .device_internal import DeviceInternal


@dataclass
class TriggerInfo:
    """
    Represents information about the trigger system of the DRPD device.
    """

    status: TriggerStatus
    type: TriggerType
    event_threshold: int
    autorepeat: OnOffStatus
    event_count: int
    sync_mode: TriggerSyncMode
    sync_pulse_length: int


class DeviceTrigger:
    """
    Represents the trigger system of the DRPD device.
    """

    def __init__(self, device_internal: DeviceInternal):
        """
        Initialize the DeviceTrigger with the given DeviceInternal.

        :param device_internal: The internal device communication handler.
        :type device_internal: DeviceInternal
        """
        self._internal = device_internal

    async def reset(self) -> None:
        """
        Reset the trigger system of the device.
        """
        await self._internal.write_ascii_and_check("TRIG:RESET")

    async def get_status(self) -> TriggerStatus:
        """
        Get the current trigger status of the device.

        :return: The current trigger status.
        """
        response = await self._internal.query_ascii_values_and_check("TRIG:STAT?", "s")
        return TriggerStatus.from_string(response[0].strip())

    async def set_type(self, trigger_type: TriggerType) -> None:
        """
        Set the trigger type of the device.

        :param trigger_type: The type of trigger to set (e.g., "EDGE", "LEVEL").
        """
        await self._internal.write_ascii_and_check(f"TRIG:EV:TYPE {trigger_type.value}")

    async def get_type(self) -> TriggerType:
        """
        Get the current trigger type of the device.

        :return: The current trigger type.
        """
        response = await self._internal.query_ascii_values_and_check("TRIG:EV:TYPE?", "s")
        return TriggerType(response[0].strip())

    async def set_event_threshold(self, count: int) -> None:
        """
        Set the event count threshold for the trigger.

        :param count: The number of events to count before triggering.
        """
        await self._internal.write_ascii_and_check(f"TRIG:EV:THRESH {count}")

    async def get_event_threshold(self) -> int:
        """
        Get the current event count threshold for the trigger.

        :return: The current event count threshold.
        """
        response = await self._internal.query_ascii_values_and_check("TRIG:EV:THRESH?")
        return int(response[0])

    async def set_autorepeat(self, enable: OnOffStatus) -> None:
        """
        Enable or disable trigger autorepeat.

        :param enable: True to enable autorepeat, False to disable.
        """
        await self._internal.write_ascii_and_check(f"TRIG:EV:AUTOREPEAT {enable.name}")

    async def get_autorepeat(self) -> OnOffStatus:
        """
        Get the current status of trigger autorepeat.

        :return: OnOffStatus indicating if autorepeat is enabled or disabled.
        """
        response = await self._internal.query_ascii_values_and_check("TRIG:EV:AUTOREPEAT?", "s")
        return OnOffStatus.from_string(response[0].strip())

    async def get_event_count(self) -> int:
        """
        Get the current event count.

        :return: The current event count.
        """
        response = await self._internal.query_ascii_values_and_check("TRIG:EV:COUNT?")
        return int(response[0])

    async def set_sync_mode(self, mode: TriggerSyncMode) -> None:
        """
        Set the trigger sync output mode.

        :param mode: The trigger output mode to set.
        """
        await self._internal.write_ascii_and_check(f"TRIG:SYNC:MODE {mode.value}")

    async def get_sync_mode(self) -> TriggerSyncMode:
        """
        Get the current trigger sync output mode.

        :return: The current trigger output mode.
        """
        response = await self._internal.query_ascii_values_and_check("TRIG:SYNC:MODE?", "s")
        return TriggerSyncMode.from_string(response[0].strip())

    async def set_sync_pulse_length(self, length_us: int) -> None:
        """
        Set the trigger output pulse length in microseconds.
        :param length_us: The pulse length in microseconds.
        """
        await self._internal.write_ascii_and_check(f"TRIG:SYNC:PULSEWIDTH {length_us}")

    async def get_sync_pulse_length(self) -> int:
        """
        Get the current trigger output pulse length in microseconds.
        :return: The pulse length in microseconds.
        """
        response = await self._internal.query_ascii_values_and_check("TRIG:SYNC:PULSEWIDTH?")
        return int(response[0])

    async def get_trigger_info(self) -> TriggerInfo:
        """
        Get comprehensive information about the trigger system.

        :return: A TriggerInfo object containing the trigger status,
                 type, event threshold, autorepeat status, event count,
                 sync mode, and sync pulse length.
        """
        status = await self.get_status()
        trigger_type = await self.get_type()
        event_threshold = await self.get_event_threshold()
        autorepeat = await self.get_autorepeat()
        event_count = await self.get_event_count()
        sync_mode = await self.get_sync_mode()
        sync_pulse_length = await self.get_sync_pulse_length()

        return TriggerInfo(
            status=status,
            type=trigger_type,
            event_threshold=event_threshold,
            autorepeat=autorepeat,
            event_count=event_count,
            sync_mode=sync_mode,
            sync_pulse_length=sync_pulse_length
        )
