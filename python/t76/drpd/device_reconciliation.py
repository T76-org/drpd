"""
Helpers for selecting the active device from discovery results.
"""

from typing import Optional, Sequence, TypeVar


DeviceType = TypeVar("DeviceType")


def choose_active_device(
        current_device: Optional[DeviceType],
        discovered_devices: Sequence[DeviceType],
        allow_auto_connect_single: bool) -> Optional[DeviceType]:
    """
    Choose the next active device from the current discovery snapshot.
    """
    if current_device in discovered_devices:
        return current_device

    if allow_auto_connect_single and len(discovered_devices) == 1:
        return discovered_devices[0]

    return None
