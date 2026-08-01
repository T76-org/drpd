"""
Copyright (c) 2025 MTA, Inc.

The Device class enables communication with DRPD devices
over USB using SCPI commands.
"""

from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional

from t76.drpd.device.device_sink_pdos import DeviceSinkPDO
from t76.drpd.device.types import (
    Mode,
    SinkRequestOutcome,
    SinkRequestStatus,
    SinkState,
)

from .device_internal import DeviceInternal

if TYPE_CHECKING:
    from t76.drpd.device.device import Device


@dataclass
class SinkInfo:
    """
    Represents comprehensive information about the sink system of the DRPD device.
    """

    status: SinkState
    negotiated_pdo: Optional[DeviceSinkPDO]
    negotiated_voltage: float
    negotiated_current: float
    error_status: bool


class DeviceSink:
    """
    Represents the sink system of the DRPD device.
    """

    def __init__(
        self,
        device_internal: DeviceInternal,
        device: Optional["Device"] = None
    ):
        """
        Initialize the DeviceSink with the given DeviceInternal.

        :param device_internal: The internal device communication
            handler.
        :type device_internal: DeviceInternal
        :param device: The parent Device instance for event
            subscription.
        :type device: Optional[Device]
        """
        self._internal = device_internal
        self._device = device
        self._current_role: Optional[Mode] = None

        if device is not None:
            device.events.register_event_observer(
                self._on_device_event
            )

    async def _on_device_event(self, event) -> None:
        """
        Handle device events, specifically tracking RoleChanged
        events to maintain the current role.

        :param event: The device event.
        :type event: DeviceEvent
        """
        from .events import RoleChanged

        if isinstance(event, RoleChanged):
            self._current_role = event.new_role

    async def _validate_sink_mode(self) -> None:
        """
        Validate that the device is in SINK mode.

        Uses the cached role from RoleChanged events if available,
        otherwise queries the device.

        :raises RuntimeError: If the device is not in SINK mode.
        """
        # Use cached role if available
        if self._current_role is not None:
            device_mode = self._current_role
        else:
            # Fallback to querying device if role hasn't been
            # tracked yet
            mode = await self._internal.query_ascii_values_and_check(
                "BUS:CC:ROLE?", "s"
            )
            device_mode = Mode.from_string(mode[0].strip())
            self._current_role = device_mode

        if device_mode != Mode.SINK:
            raise RuntimeError(
                f"Device must be in SINK mode, but is in "
                f"{device_mode.value} mode"
            )

    async def load_config(self, config: dict) -> None:
        """
        Load the sink configuration from a dictionary.

        :param config: A dictionary representing the sink
            configuration.
        :type config: dict
        """

    async def save_config(self) -> dict:
        """
        Save the current sink configuration to a dictionary.

        :return: A dictionary representing the sink configuration.
        :rtype: dict
        """
        return {}

    async def get_pdo_count(self) -> int:
        """
        Get the number of available PDOs from the source.

        :return: The number of available PDOs.
        :rtype: int
        """
        await self._validate_sink_mode()
        response = (
            await self._internal.query_ascii_values_and_check(
                "SINK:PDO:COUNT?"
            )
        )
        return int(response[0])

    async def get_pdo_at_index(self, index: int) -> Optional[DeviceSinkPDO]:
        """
        Get the PDO at the specified index.

        :param index: The index of the requested PDO (0-based).
        :type index: int
        :return: The PDO at the specified index.
        :rtype: DeviceSinkPDO
        """
        await self._validate_sink_mode()
        response = (
            await self._internal.query_ascii_values_and_check(
                f"SINK:PDO? {index}", "s"
            )
        )
        return DeviceSinkPDO.from_response(list(response))

    async def set_pdo(
        self, index: int, voltage_mv: int, current_ma: int
    ) -> None:
        """
        Request a Fixed Supply PDO at the specified index with a
        specific current.

        :param index: The index of the Fixed Supply PDO to request
            (0-based).
        :type index: int
        :param current_ma: The desired current in milliamps. Set to 0
            to request the maximum available current.
        :type current_ma: int
        """
        await self._validate_sink_mode()
        await self._internal.write_ascii_and_check(
            f"SINK:PDO {index} {voltage_mv} {current_ma}"
        )

    async def set_epr_enabled(self, enabled: bool) -> None:
        """
        Set whether Sink policy may enter EPR mode during future negotiation.

        :param enabled: True to allow EPR entry, False to stay SPR-only.
        :type enabled: bool
        """
        await self._validate_sink_mode()
        state = "ON" if enabled else "OFF"
        await self._internal.write_ascii_and_check(f"SINK:EPR:EN {state}")

    async def get_epr_enabled(self) -> bool:
        """
        Get whether Sink policy may enter EPR mode during negotiation.

        :return: True if EPR entry is enabled.
        :rtype: bool
        """
        await self._validate_sink_mode()
        response = (
            await self._internal.query_ascii_values_and_check(
                "SINK:EPR:EN?", "s"
            )
        )
        return response[0].strip().upper() == "ON"

    async def set_pps_status_query_enabled(self, enabled: bool) -> None:
        """
        Set whether Sink policy sends Get_PPS_Status after SPR PPS transitions.
        """
        await self._validate_sink_mode()
        state = "ON" if enabled else "OFF"
        await self._internal.write_ascii_and_check(
            f"SINK:PPS:STATUS:EN {state}"
        )

    async def get_pps_status_query_enabled(self) -> bool:
        """
        Query whether Sink policy sends Get_PPS_Status after PPS transitions.
        """
        await self._validate_sink_mode()
        response = (
            await self._internal.query_ascii_values_and_check(
                "SINK:PPS:STATUS:EN?", "s"
            )
        )
        return response[0].strip().upper() == "ON"

    async def get_request_status(self) -> SinkRequestStatus:
        """
        Query the most recent Sink PDO request outcome.
        """
        await self._validate_sink_mode()
        response = (
            await self._internal.query_ascii_values_and_check(
                "SINK:REQUEST:STATUS?", "s"
            )
        )
        parts = [str(part).strip() for part in response]
        if len(parts) == 1 and "," in parts[0]:
            parts = [part.strip() for part in parts[0].split(",")]
        if not parts:
            raise ValueError("Empty SINK:REQUEST:STATUS? response")

        outcome = SinkRequestOutcome.from_string(parts[0])
        if outcome == SinkRequestOutcome.NONE:
            return SinkRequestStatus(outcome, None, None, None)
        if len(parts) != 4:
            raise ValueError(
                "SINK:REQUEST:STATUS? response must contain "
                "outcome,index,voltage_mv,current_ma"
            )
        return SinkRequestStatus(
            outcome=outcome,
            index=int(parts[1]),
            voltage_mv=int(parts[2]),
            current_ma=int(parts[3]),
        )

    async def get_spr_capability_count(self) -> int:
        response = await self._internal.query_ascii_values_and_check(
            "SINK:CAP:SPR:COUNT?"
        )
        return int(response[0])

    async def get_spr_capability_pdo(self, index: int) -> int:
        response = await self._internal.query_ascii_values_and_check(
            f"SINK:CAP:SPR? {index}"
        )
        return int(str(response[0]), 0)

    async def set_spr_capability_pdo(self, index: int, raw_pdo: int) -> None:
        await self._internal.write_ascii_and_check(
            f"SINK:CAP:SPR {index} {raw_pdo}"
        )

    async def get_epr_capability_count(self) -> int:
        response = await self._internal.query_ascii_values_and_check(
            "SINK:CAP:EPR:COUNT?"
        )
        return int(response[0])

    async def get_epr_capability_pdo(self, index: int) -> int:
        response = await self._internal.query_ascii_values_and_check(
            f"SINK:CAP:EPR? {index}"
        )
        return int(str(response[0]), 0)

    async def set_epr_capability_pdo(self, index: int, raw_pdo: int) -> None:
        await self._internal.write_ascii_and_check(
            f"SINK:CAP:EPR {index} {raw_pdo}"
        )

    async def get_status(self) -> SinkState:
        """
        Get the current state of the sink state machine.

        :return: The current sink state.
        :rtype: SinkState
        """
        await self._validate_sink_mode()
        response = (
            await self._internal.query_ascii_values_and_check(
                "SINK:STATUS?", "s"
            )
        )
        return SinkState.from_string(response[0].strip())

    async def get_negotiated_pdo(self) -> Optional[DeviceSinkPDO]:
        """
        Get information about the negotiated PDO.

        :return: The negotiated PDO.
        :rtype: DeviceSinkPDO
        """
        await self._validate_sink_mode()

        response = (
            await self._internal.query_ascii_values_and_check(
                "SINK:STATUS:PDO?", "s"
            )
        )

        return DeviceSinkPDO.from_response(list(response))

    async def get_negotiated_voltage(self) -> int:
        """
        Get the negotiated voltage in millivolts.

        :return: The negotiated voltage in millivolts.
        :rtype: int
        """
        await self._validate_sink_mode()
        response = (
            await self._internal.query_ascii_values_and_check(
                "SINK:STATUS:VOLTAGE?"
            )
        )
        return int(response[0])

    async def get_negotiated_current(self) -> int:
        """
        Get the negotiated current in milliamps.

        :return: The negotiated current in milliamps.
        :rtype: int
        """
        await self._validate_sink_mode()
        response = (
            await self._internal.query_ascii_values_and_check(
                "SINK:STATUS:CURRENT?"
            )
        )
        return int(response[0])

    async def get_error_status(self) -> bool:
        """
        Get the error status of the sink.

        :return: True if the sink is in an error state, False
            otherwise.
        :rtype: bool
        """
        await self._validate_sink_mode()
        response = (
            await self._internal.query_ascii_values_and_check(
                "SINK:STATUS:ERROR?"
            )
        )
        return int(response[0]) == 1

    async def get_sink_info(self) -> SinkInfo:
        """
        Get comprehensive information about the sink system.

        :return: A SinkInfo object containing the PDO count, sink status,
                 negotiated PDO, negotiated voltage, negotiated current,
                 and error status.
        :rtype: SinkInfo
        """
        status = await self.get_status()
        negotiated_pdo = await self.get_negotiated_pdo()
        negotiated_voltage = await self.get_negotiated_voltage()
        negotiated_current = await self.get_negotiated_current()
        error_status = await self.get_error_status()

        return SinkInfo(
            status=status,
            negotiated_pdo=negotiated_pdo,
            negotiated_voltage=negotiated_voltage,
            negotiated_current=negotiated_current,
            error_status=error_status
        )
