"""
Protected test SCPI command group for DRPD devices.
"""

from .device_internal import DeviceInternal
from .types import DiagnosticCCChannel, DiagnosticCCRole, OnOffStatus


class DeviceTest:
    """
    Provides access to firmware TEST:* SCPI commands.
    """

    def __init__(self, internal: DeviceInternal):
        self._internal = internal

    async def set_vbus_manager_state(self, state: OnOffStatus) -> None:
        await self._internal.write_ascii_and_check(
            f"TEST:VBUSMAN:EN {state.name}"
        )

    async def get_vbus_manager_state(self) -> OnOffStatus:
        response = await self._internal.query_ascii_values_and_check(
            "TEST:VBUSMAN:EN?", "s"
        )
        return OnOffStatus.from_string(response[0])

    async def set_cc1_role(self, role: DiagnosticCCRole) -> None:
        await self._internal.write_ascii_and_check(
            f"TEST:CCROLE:CC1 {role.value}"
        )

    async def get_cc1_role(self) -> DiagnosticCCRole:
        response = await self._internal.query_ascii_values_and_check(
            "TEST:CCROLE:CC1?", "s"
        )
        return DiagnosticCCRole.from_string(response[0])

    async def set_cc2_role(self, role: DiagnosticCCRole) -> None:
        await self._internal.write_ascii_and_check(
            f"TEST:CCROLE:CC2 {role.value}"
        )

    async def get_cc2_role(self) -> DiagnosticCCRole:
        response = await self._internal.query_ascii_values_and_check(
            "TEST:CCROLE:CC2?", "s"
        )
        return DiagnosticCCRole.from_string(response[0])

    async def set_dut_channel(self, channel: DiagnosticCCChannel) -> None:
        await self._internal.write_ascii_and_check(
            f"TEST:CCBUS:DUT:CHANNEL {channel.value}"
        )

    async def get_dut_channel(self) -> DiagnosticCCChannel:
        response = await self._internal.query_ascii_values_and_check(
            "TEST:CCBUS:DUT:CHANNEL?", "s"
        )
        return DiagnosticCCChannel.from_string(response[0])

    async def set_usds_channel(self, channel: DiagnosticCCChannel) -> None:
        await self._internal.write_ascii_and_check(
            f"TEST:CCBUS:USDS:CHANNEL {channel.value}"
        )

    async def get_usds_channel(self) -> DiagnosticCCChannel:
        response = await self._internal.query_ascii_values_and_check(
            "TEST:CCBUS:USDS:CHANNEL?", "s"
        )
        return DiagnosticCCChannel.from_string(response[0])

    async def set_cc_mux_state(self, state: OnOffStatus) -> None:
        await self._internal.write_ascii_and_check(
            f"TEST:CCBUS:MUX {state.name}"
        )

    async def get_cc_mux_state(self) -> OnOffStatus:
        response = await self._internal.query_ascii_values_and_check(
            "TEST:CCBUS:MUX?", "s"
        )
        return OnOffStatus.from_string(response[0])
