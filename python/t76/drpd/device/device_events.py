"""
Copyright (c) 2025 MTA, Inc.

The DeviceEventManager class manages event observation and dispatching
for DRPD devices.
"""

import inspect
from typing import Awaitable, Callable, List, Union

from .events import DeviceEvent


class DeviceEvents:
    """
    Manages event observation and dispatching for a DRPD device.

    Provides functionality to register/unregister event observers and
    dispatch events to all registered observers. Supports both
    synchronous and asynchronous observer callbacks.
    """

    # Accept either a regular callable or an async callable returning
    # an Awaitable
    EventObserver = Union[Callable[[DeviceEvent], None],
                          Callable[[DeviceEvent], Awaitable[None]]]

    def __init__(self):
        """Initialize the DeviceEventManager."""
        self._event_observers: List[DeviceEvents.EventObserver] = []

    def get_observer_count(self) -> int:
        """
        Get the number of registered event observers.

        :return: The count of registered observers.
        :rtype: int
        """
        return len(self._event_observers)

    def register_event_observer(
            self,
            observer: EventObserver) -> None:
        """
        Register an observer to be notified of events.

        :param observer: The observer function to register.
        :type observer: EventObserver
        """
        self._event_observers.append(observer)

    def unregister_event_observer(
            self,
            observer: EventObserver) -> None:
        """
        Unregister an observer from receiving event notifications.

        :param observer: The observer function to unregister.
        :type observer: EventObserver
        """
        self._event_observers.remove(observer)

    async def dispatch_event(self, event: DeviceEvent) -> None:
        """
        Dispatch an event to all registered observers.

        Call an observer which may be sync or async. If the observer
        returns a coroutine, await it. If no loop is running, run it
        to completion.

        :param event: The event to dispatch to observers.
        :type event: DeviceEvent
        """
        for observer in self._event_observers:
            result = observer(event)

            if inspect.isawaitable(result):
                await result
