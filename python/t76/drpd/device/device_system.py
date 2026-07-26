"""
Copyright (c) 2025 MTA, Inc.

The Device class enables communication with DRPD devices
over USB using SCPI commands.
"""

import math

from async_lru import alru_cache

from .device_internal import DeviceInternal

from .types import (
    MemoryUsage,
    DeviceInfo
)


class DeviceBMCDecoderConfiguration:
    """Manage persisted BMC decoder physical-layer settings."""

    VREF_MIN_VOLTS = 0.20
    VREF_MAX_VOLTS = 2.50
    VREF_STEP_VOLTS = 0.05
    VREF_DEFAULT_VOLTS = 0.70
    PWM_MIN_HZ = 10_000
    PWM_MAX_HZ = 500_000
    PWM_STEP_HZ = 1_000
    PWM_DEFAULT_HZ = 100_000

    def __init__(self, internal: DeviceInternal):
        """Initialize configuration access with device transport."""
        self._internal = internal

    async def get_cc_vref_voltage(self) -> float:
        """Return persisted CC reference voltage in volts."""
        values = await self._internal.query_ascii_values_and_check(
            "SYST:CONF:PHY:BMCD:CC:VREF:VOLT?"
        )
        if len(values) != 1:
            raise ValueError("Expected one CC reference voltage value.")
        return float(values[0])

    async def set_cc_vref_voltage(self, voltage: float) -> None:
        """Validate, persist, and immediately apply CC reference voltage."""
        steps = (voltage - self.VREF_MIN_VOLTS) / self.VREF_STEP_VOLTS
        if (
            not isinstance(voltage, (int, float))
            or not math.isfinite(voltage)
            or voltage < self.VREF_MIN_VOLTS
            or voltage > self.VREF_MAX_VOLTS
            or abs(steps - round(steps)) > 1e-9
        ):
            raise ValueError("CC reference voltage must be 0.20–2.50 V in 0.05 V increments.")
        await self._internal.write_ascii_and_check(
            f"SYST:CONF:PHY:BMCD:CC:VREF:VOLT {voltage:.2f}"
        )

    async def reset_cc_vref_voltage(self) -> None:
        """Restore and persist build-time CC reference voltage default."""
        await self._internal.write_ascii_and_check(
            "SYST:CONF:PHY:BMCD:CC:VREF:VOLT:RES"
        )

    async def get_cc_vref_pwm_frequency_hz(self) -> int:
        """Return persisted CC reference PWM frequency in hertz."""
        values = await self._internal.query_ascii_values_and_check(
            "SYST:CONF:PHY:BMCD:CC:VREF:PWM:FREQ?"
        )
        if len(values) != 1:
            raise ValueError("Expected one CC reference PWM frequency value.")
        return int(values[0])

    async def set_cc_vref_pwm_frequency_hz(self, frequency_hz: int) -> None:
        """Validate, persist, and immediately apply PWM frequency."""
        if (
            not isinstance(frequency_hz, int)
            or isinstance(frequency_hz, bool)
            or frequency_hz < self.PWM_MIN_HZ
            or frequency_hz > self.PWM_MAX_HZ
            or frequency_hz % self.PWM_STEP_HZ != 0
        ):
            raise ValueError(
                "CC reference PWM frequency must be 10000–500000 Hz "
                "in 1000 Hz increments."
            )
        await self._internal.write_ascii_and_check(
            f"SYST:CONF:PHY:BMCD:CC:VREF:PWM:FREQ {frequency_hz}"
        )

    async def reset_cc_vref_pwm_frequency_hz(self) -> None:
        """Restore and persist build-time PWM frequency default."""
        await self._internal.write_ascii_and_check(
            "SYST:CONF:PHY:BMCD:CC:VREF:PWM:FREQ:RES"
        )


class DeviceSystemConfiguration:
    """System configuration namespace."""

    def __init__(self, internal: DeviceInternal):
        """Initialize nested system configuration groups."""
        self.bmc_decoder = DeviceBMCDecoderConfiguration(internal)


class DeviceSystem:
    """
    Represents the system-related commands for a DRPD device.
    """

    def __init__(self, internal: DeviceInternal):
        """Initialize the DeviceSystem with the given internal device interface.
        :param internal: The internal device interface.
        :type internal: DeviceInternal
        """
        self._internal = internal
        self.configuration = DeviceSystemConfiguration(internal)

    @alru_cache
    async def identify(self) -> DeviceInfo:
        """
        Identify the device.
        """
        # Send the *IDN? command to the device
        result = await self._internal.query_ascii_values_and_check(
            "*IDN?", DeviceInternal.parse_scpi_string)

        assert len(
            result) == 4, "Expected 4 parameters in the identification response."

        hardware_revision = None
        try:
            hardware_revision = await self.get_hardware_revision()
        except (AssertionError, RuntimeError, ValueError, TimeoutError):
            hardware_revision = None

        return DeviceInfo(
            manufacturer=result[0],
            model=result[1],
            serial_number=result[2],
            firmware_version=result[3],
            hardware_revision=hardware_revision,
        )

    # System commands

    async def reset(self) -> None:
        """
        Reset the instrument to its power-on state.
        """
        await self._internal.write_ascii_and_check("*RST")

    @alru_cache
    async def get_hardware_revision(self) -> str:
        """
        Query the detected hardware revision.

        :return: Hardware revision string.
        :rtype: str
        """
        result = await self._internal.query_ascii_values_and_check(
            "SYST:HW:REV?", DeviceInternal.parse_scpi_string)

        if not result:
            raise ValueError("Failed to retrieve hardware revision.")

        return str(result[0])

    async def enter_firmware_updater(self) -> None:
        """
        Reboot into the resident firmware updater bootloader.
        """
        await self._internal.write_ascii_and_check("SYST:FIRM:UPD")

    @alru_cache(ttl=1)
    async def get_memory_usage(self) -> MemoryUsage:
        """
        Get the memory usage of the device.

        :param self: The Device instance.
        :return: The memory usage information.
        :rtype: MemoryUsage

        :raises ValueError: If the response from the device does not contain the expected number of parameters.

        Note that this method caches the result for 1 second to avoid frequent calls
        to the device.
        """
        result = await self._internal.query_ascii_values_and_check("SYST:MEM?")

        assert len(
            result) == 2, "Expected 2 parameters in the memory usage response."

        return MemoryUsage(
            total=int(result[0]),
            free=int(result[1]),
        )

    @alru_cache
    async def get_clock_frequency(self) -> int:
        """
        Get the clock frequency of the device.

        :return: The clock frequency in Hz.
        :rtype: int

        :raises ValueError: If the response from the device is empty or invalid.

        Note that this method caches the result for 1s to avoid frequent calls to the device.
        """
        result = await self._internal.query_ascii_values_and_check("SYST:SP?")

        if not result:
            raise ValueError("Failed to retrieve clock frequency from device.")

        return int(result[0])

    @alru_cache(ttl=0.5)
    async def get_uptime(self) -> int:
        """
        Get the uptime of the device in seconds.

        :return: The uptime in seconds.
        :rtype: int

        :raises ValueError: If the response from the device is empty or invalid.

        Note that this method caches the result for 1 second to avoid frequent calls to the device.
        """
        result = await self._internal.query_ascii_values_and_check("SYST:UPT?")

        if not result:
            raise ValueError("Failed to retrieve uptime from device.")

        return result[0] / 1_000_000  # Convert from microseconds to seconds

    @alru_cache(ttl=1)
    async def get_timestamp(self) -> str:
        """
        Get the current timestamp from the device.

        :return: The current timestamp according to the device.
        :rtype: str

        :raises ValueError: If the response from the device is empty or invalid.

        Note that this method caches the result for 1 second to avoid frequent calls to the device.
        """
        result = await self._internal.query_ascii_values_and_check("SYST:TIME?")

        if not result:
            raise ValueError("Failed to retrieve timestamp from device.")

        return result[0]
