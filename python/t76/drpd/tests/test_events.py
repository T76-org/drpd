"""
Copyright (c) 2025 MTA, Inc.

Unit tests for the DeviceEventManager class.
"""

import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock

from t76.drpd.device.device_events import DeviceEvents
from t76.drpd.device.events import (
    DeviceEvent,
    DeviceConnected,
    DeviceDisconnected,
    InterruptReceived,
)


class DummyEvent(DeviceEvent):
    """A simple test event."""


class TestDeviceEventManagerRegistration(
        unittest.IsolatedAsyncioTestCase):
    """Tests for event observer registration and unregistration."""

    async def asyncSetUp(self) -> None:
        """Set up test fixtures."""
        self.events = DeviceEvents()
        self.mock_observer = MagicMock()

    async def test_register_observer(self) -> None:
        """Test registering an observer."""
        self.events.register_event_observer(self.mock_observer)

        self.assertEqual(self.events.get_observer_count(), 1)

    async def test_register_multiple_observers(self) -> None:
        """Test registering multiple observers."""
        observer1 = MagicMock()
        observer2 = MagicMock()

        self.events.register_event_observer(observer1)
        self.events.register_event_observer(observer2)

        self.assertEqual(self.events.get_observer_count(), 2)

    async def test_unregister_observer(self) -> None:
        """Test unregistering an observer."""
        self.events.register_event_observer(self.mock_observer)
        self.events.unregister_event_observer(self.mock_observer)

        self.assertEqual(self.events.get_observer_count(), 0)

    async def test_unregister_observer_not_registered(self) -> None:
        """Test unregistering an observer that was not registered."""
        observer = MagicMock()

        with self.assertRaises(ValueError):
            self.events.unregister_event_observer(observer)

    async def test_unregister_one_of_multiple_observers(self) -> None:
        """Test unregistering one observer when multiple are
        registered."""
        observer1 = MagicMock()
        observer2 = MagicMock()

        self.events.register_event_observer(observer1)
        self.events.register_event_observer(observer2)

        self.events.unregister_event_observer(observer1)

        self.assertEqual(self.events.get_observer_count(), 1)


class TestDeviceEventManagerDispatching(
        unittest.IsolatedAsyncioTestCase):
    """Tests for event dispatching."""

    async def asyncSetUp(self) -> None:
        """Set up test fixtures."""
        self.events = DeviceEvents()
        self.mock_device = MagicMock()

    async def test_dispatch_event_to_sync_observer(self) -> None:
        """Test dispatching an event to a synchronous observer."""
        observer = MagicMock()
        event = DummyEvent(self.mock_device)

        self.events.register_event_observer(observer)
        await self.events.dispatch_event(event)

        observer.assert_called_once_with(event)

    async def test_dispatch_event_to_async_observer(self) -> None:
        """Test dispatching an event to an asynchronous observer."""
        observer = AsyncMock()
        event = DummyEvent(self.mock_device)

        self.events.register_event_observer(observer)
        await self.events.dispatch_event(event)

        observer.assert_called_once_with(event)

    async def test_dispatch_event_to_multiple_observers(self) -> None:
        """Test dispatching an event to multiple observers."""
        observer1 = MagicMock()
        observer2 = AsyncMock()
        observer3 = MagicMock()
        event = DummyEvent(self.mock_device)

        self.events.register_event_observer(observer1)
        self.events.register_event_observer(observer2)
        self.events.register_event_observer(observer3)

        await self.events.dispatch_event(event)

        observer1.assert_called_once_with(event)
        observer2.assert_called_once_with(event)
        observer3.assert_called_once_with(event)

    async def test_dispatch_event_with_no_observers(self) -> None:
        """Test dispatching an event when no observers are registered.
        """
        event = DummyEvent(self.mock_device)

        # Should not raise
        await self.events.dispatch_event(event)

    async def test_dispatch_multiple_events_to_observer(self) -> None:
        """Test dispatching multiple events to an observer."""
        observer = MagicMock()

        self.events.register_event_observer(observer)

        event1 = DummyEvent(self.mock_device)
        event2 = DummyEvent(self.mock_device)

        await self.events.dispatch_event(event1)
        await self.events.dispatch_event(event2)

        self.assertEqual(observer.call_count, 2)
        observer.assert_any_call(event1)
        observer.assert_any_call(event2)

    async def test_dispatch_event_unregistered_observer_not_called(
            self) -> None:
        """Test that unregistered observers are not called."""
        observer1 = MagicMock()
        observer2 = MagicMock()
        event = DummyEvent(self.mock_device)

        self.events.register_event_observer(observer1)
        self.events.register_event_observer(observer2)
        self.events.unregister_event_observer(observer1)

        await self.events.dispatch_event(event)
        observer1.assert_not_called()
        observer2.assert_called_once_with(event)

    async def test_dispatch_event_async_observer_awaited(self) -> None:
        """Test that async observer is properly awaited."""
        call_order = []

        async def async_observer(_: DeviceEvent) -> None:
            call_order.append("async_observer_start")
            await asyncio.sleep(0.01)
            call_order.append("async_observer_end")

        event = DummyEvent(self.mock_device)

        self.events.register_event_observer(async_observer)
        call_order.append("dispatch_start")
        await self.events.dispatch_event(event)
        call_order.append("dispatch_end")

        # Verify the order: async observer should complete before
        # dispatch returns
        self.assertEqual(
            call_order,
            [
                "dispatch_start",
                "async_observer_start",
                "async_observer_end",
                "dispatch_end",
            ],
        )

    async def test_dispatch_event_with_mixed_observers(self) -> None:
        """Test dispatching event with both sync and async observers."""
        call_log = []

        def sync_observer(_: DeviceEvent) -> None:
            call_log.append("sync")

        async def async_observer(_: DeviceEvent) -> None:
            call_log.append("async_start")
            await asyncio.sleep(0.001)
            call_log.append("async_end")

        event = DummyEvent(self.mock_device)

        self.events.register_event_observer(sync_observer)
        self.events.register_event_observer(async_observer)
        await self.events.dispatch_event(event)

        # Both observers should have been called
        self.assertIn("sync", call_log)
        self.assertIn("async_start", call_log)
        self.assertIn("async_end", call_log)

    async def test_dispatch_event_observer_exception_propagates(
            self) -> None:
        """Test that exceptions in observers propagate."""
        def failing_observer(event: DeviceEvent) -> None:
            raise ValueError("Observer error")

        event = DummyEvent(self.mock_device)

        self.events.register_event_observer(failing_observer)

        with self.assertRaises(ValueError) as context:
            await self.events.dispatch_event(event)

        self.assertIn("Observer error", str(context.exception))

    async def test_dispatch_event_async_observer_exception_propagates(
            self) -> None:
        """Test that exceptions in async observers propagate."""
        async def failing_observer(event: DeviceEvent) -> None:
            raise RuntimeError("Async observer error")

        event = DummyEvent(self.mock_device)

        self.events.register_event_observer(failing_observer)

        with self.assertRaises(RuntimeError) as context:
            await self.events.dispatch_event(event)

        self.assertIn("Async observer error", str(context.exception))


class TestDeviceEventManagerIntegration(
        unittest.IsolatedAsyncioTestCase):
    """Integration tests for DeviceEventManager."""

    async def asyncSetUp(self) -> None:
        """Set up test fixtures."""
        self.events = DeviceEvents()
        self.mock_device = MagicMock()

    async def test_full_observer_lifecycle(self) -> None:
        """Test the full lifecycle of an observer."""
        observer = AsyncMock()

        # Register
        self.events.register_event_observer(observer)
        self.assertEqual(self.events.get_observer_count(), 1)

        # Dispatch multiple events
        event1 = InterruptReceived(self.mock_device)
        event2 = DeviceConnected(self.mock_device)
        event3 = DeviceDisconnected(self.mock_device)

        await self.events.dispatch_event(event1)
        await self.events.dispatch_event(event2)
        await self.events.dispatch_event(event3)

        self.assertEqual(observer.call_count, 3)

        # Unregister
        self.events.unregister_event_observer(observer)
        self.assertEqual(self.events.get_observer_count(), 0)

        # Verify no more calls after unregistration
        event4 = InterruptReceived(self.mock_device)
        await self.events.dispatch_event(event4)

        self.assertEqual(observer.call_count, 3)

    async def test_observer_can_unregister_itself(self) -> None:
        """Test that an observer can unregister itself during handling.
        """
        call_count = [0]
        observer_func: DeviceEvents.EventObserver | None = None

        def self_unregistering_observer(
                _: DeviceEvent) -> None:
            call_count[0] += 1
            if call_count[0] == 1:
                assert observer_func is not None
                self.events.unregister_event_observer(
                    observer_func)

        observer_func = self_unregistering_observer

        self.events.register_event_observer(observer_func)

        event1 = DummyEvent(self.mock_device)
        event2 = DummyEvent(self.mock_device)

        await self.events.dispatch_event(event1)
        await self.events.dispatch_event(event2)

        # Observer should only be called once since it unregistered
        # itself
        self.assertEqual(call_count[0], 1)


if __name__ == "__main__":
    unittest.main()
