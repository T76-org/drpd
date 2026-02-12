"""
Copyright (c) 2025 MTA, Inc.

The discovery module provides functionality to discover DRPD devices connected via USB.
"""
from typing import List

from t76.transport import discover_usb_devices

from .device import Device


def find_drpd_devices() -> List[Device]:
    """
    Discover DRPD devices connected via USB.

    Returns:
        list: A list of discovered DRPD devices.
    """
    devices = discover_usb_devices(
        0x2e8a, 0x000a)  # TODO replace with actual VID and PID
    return [Device(usb_device) for usb_device in devices]
