"""
Copyright (c) 2025 MTA, Inc.

The Device class enables communication with DRPD devices
over USB using SCPI commands.
"""

import asyncio
import logging

from typing import Any, Optional

import usb

from t76.drpd.device.types import DeviceStatusFlags

from ..message.bmc_sequence import BMCSequence
from ..message.header import Header
from ..message import Message

from .device_analog_monitor import DeviceAnalogMonitor
from .device_capture import DeviceCapture
from .device_events import DeviceEvents
from .device_internal import DeviceInternal
from .device_mode import DeviceMode
from .device_sink import DeviceSink
from .device_system import DeviceSystem
from .device_trigger import DeviceTrigger
from .device_vbus import DeviceVBus

from .events import (
    BMCSequenceCaptured,
    CCBusStateChanged,
    CaptureStatusChanged,
    DeviceConnected,
    DeviceDisconnected,
    InterruptReceived,
    RoleChanged,
    SinkInfoChanged,
    SinkPDOListChanged,
    TriggerStatusChanged,
    VBusManagerStateChanged,
)


class Device:
    """
    Represents a DRPD device connected via USB over USBTMC.

    :param usb_device: The USB device object representing the DRPD device.
    :type usb_device: usb.core.Device
    """

    def __init__(self, usb_device: usb.core.Device):
        self.events = DeviceEvents()
        self._internal = DeviceInternal(usb_device, self._interrupt_handler)
        self._disconnecting = False

        self.analog_monitor = DeviceAnalogMonitor(self._internal, self)
        self.mode = DeviceMode(self._internal)
        self.capture = DeviceCapture(
            self._internal, self._capture_fetched_callback)
        self.sink = DeviceSink(self._internal, self)
        self.system = DeviceSystem(self._internal)
        self.trigger = DeviceTrigger(self._internal)
        self.vbus = DeviceVBus(self._internal)

    async def connect(self) -> None:
        """
        Connect to the device and set up event handling.
        """
        self._disconnecting = False
        await self._internal.connect()

        await self.events.dispatch_event(DeviceConnected(self))

    async def disconnect(self) -> None:
        """
        Disconnect from the device and clean up event handling.
        """
        self._disconnecting = True
        try:
            await self.events.dispatch_event(DeviceDisconnected(self))
        except Exception as e:
            logging.warning(
                "Ignoring observer error while dispatching disconnect for %s: %s",
                self,
                e,
            )
        finally:
            await self._internal.disconnect()

    @property
    def name(self) -> Optional[str]:
        """
        Get the name of the device.

        :return: The name of the device.
        :rtype: str
        """
        return self._internal.name

    async def _process_interrupt(self) -> None:
        if self._disconnecting or not self._internal.connected:
            return

        # Fetch device status
        device_status = int((await self._internal.query_ascii_values_and_check("STAT:DEV?"))[0])

        if device_status & DeviceStatusFlags.VBUS_STATUS_CHANGED.value:
            bus_info = await self.vbus.get_info()
            ev = VBusManagerStateChanged(self, bus_info)
            await self.events.dispatch_event(ev)

        if device_status & DeviceStatusFlags.ROLE_CHANGED.value:
            new_role = await self.mode.get()
            ev = RoleChanged(self, new_role)
            await self.events.dispatch_event(ev)

        if device_status & DeviceStatusFlags.CAPTURE_STATUS_CHANGED.value:
            is_capturing = await self.capture.get_status()
            ev = CaptureStatusChanged(self, is_capturing)
            await self.events.dispatch_event(ev)

        if device_status & DeviceStatusFlags.CC_BUS_STATUS_CHANGED.value:
            cc_bus_state = await self.mode.get_status()
            ev = CCBusStateChanged(self, cc_bus_state)
            await self.events.dispatch_event(ev)

        if device_status & DeviceStatusFlags.TRIGGER_STATUS_CHANGED.value:
            trigger_info = await self.trigger.get_trigger_info()
            ev = TriggerStatusChanged(self, trigger_info)
            await self.events.dispatch_event(ev)

        if device_status & DeviceStatusFlags.SINK_PDO_LIST_CHANGED.value:
            try:
                pdo_count = await self.sink.get_pdo_count()
                new_pdos = []

                for index in range(pdo_count):
                    new_pdos.append(await self.sink.get_pdo_at_index(index))

                ev = SinkPDOListChanged(self, new_pdos)
                await self.events.dispatch_event(ev)
            except RuntimeError as ex:
                logging.warning("Failed to get PDO list: %s", ex)

        if device_status & DeviceStatusFlags.SINK_STATUS_CHANGED.value:
            try:
                sink_info = await self.sink.get_sink_info()
                ev = SinkInfoChanged(self, sink_info)
                await self.events.dispatch_event(ev)
            except RuntimeError as ex:
                logging.warning("Failed to get sink info: %s", ex)

        if device_status & DeviceStatusFlags.MESSAGE_RECEIVED.value:
            try:
                await self.capture.fetch_extant_captures()
            except RuntimeError as ex:
                if self._disconnecting or not self._internal.connected:
                    return
                logging.warning("Failed to fetch capture data: %s", ex)

        ev = InterruptReceived(self)

        await self.events.dispatch_event(ev)

    async def _safe_process_interrupt(self) -> None:
        try:
            await self._process_interrupt()
        except (AssertionError, RuntimeError, ValueError, TimeoutError) as e:
            if self._disconnecting or not self._internal.connected:
                return
            logging.warning("Ignoring interrupt handling error: %s", e)

    def _interrupt_handler(self, _: Any, __: Any, ___: Any) -> None:
        if self._disconnecting or not self._internal.connected:
            return

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            asyncio.run(self._safe_process_interrupt())
            return

        loop.create_task(self._safe_process_interrupt())

    def _capture_fetched_callback(self, capture: BMCSequence) -> None:
        # Advise observers of the interrupt event
        ev = BMCSequenceCaptured(self, capture)

        asyncio.create_task(self.events.dispatch_event(ev))

    def register_event_observer(
            self,
            observer: DeviceEvents.EventObserver) -> None:
        """
        Register an observer to be notified of events.

        :param observer: The observer function to register.
        :type observer: DeviceEventManager.EventObserver
        """
        self.events.register_event_observer(observer)

    def unregister_event_observer(
            self,
            observer: DeviceEvents.EventObserver) -> None:
        """
        Unregister an observer from receiving event notifications.

        :param observer: The observer function to unregister.
        :type observer: DeviceEventManager.EventObserver
        """
        logging.warning("Unregistering observer: %s", observer)
        self.events.unregister_event_observer(observer)

    # Encoder commands

    async def send_encoder_message(self, header: Header, message: Optional[Message] = None) -> None:
        """
        Send an encoded message using the device's encoder.

        :param sop: The SOP block to use for the message.
        :type sop: SOP
        :param header: The header of the message.
        :type header: Header
        :param message: The message to send, if any.
        :type message: Optional[Message]

        :raises ValueError: If the message cannot be sent.
        """
        body: bytes = b''

        if message is not None:
            body = b''.join(m.to_bytes(4, 'little') for m in message.body)

        payload = header.encode() + body

        assert len(payload) > 0, "Payload must not be empty."

        await self._internal.write_binary_and_check("EN:SE", payload)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Device):
            return NotImplemented

        return self._internal.resource_string == other._internal.resource_string

    def __hash__(self) -> int:
        return hash(self._internal.resource_string)

    def __repr__(self):
        return f"Dr. PD Device(name={self._internal.name}, serial_number={self._internal.serial_number})"
