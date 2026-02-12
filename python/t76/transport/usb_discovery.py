"""
Copyright (c) 2025 MTA Inc.

Provides discovery services for usb devices, including serial port mapping.
"""
from typing import Optional

import logging
import serial
import serial.tools
import serial.tools.list_ports
import usb


def discover_usb_devices(vendor_id: int, product_id: int) -> list[usb.core.Device]:
    """Discover USB devices matching the given vendor and product IDs."""

    devices = usb.core.find(
        idVendor=vendor_id, idProduct=product_id, find_all=True)

    if devices is None:
        return []

    return [device for device in devices if isinstance(device, usb.core.Device)]


def get_serial_port_for_device(device: usb.core.Device) -> Optional[str]:
    """
    Get the serial port for a USB device.

    Args:
        device (usb.core.Device): The USB device to get the serial port for.

    Returns:
        str: The serial port of the device, or None if not found.
    """
    # Get device attributes safely (these are dynamically added at runtime)
    device_vendor_id = getattr(device, 'idVendor', None)
    device_product_id = getattr(device, 'idProduct', None)
    device_product = getattr(device, 'product', 'Unknown')

    if device_vendor_id is None or device_product_id is None:
        logging.warning("USB device missing vendor or product ID")
        return None

    for port in serial.tools.list_ports.comports():
        if port.vid == device_vendor_id and port.pid == device_product_id:
            logging.debug(
                "Found serial port %s for USB device %s (%s:%s)",
                port.device, device_product, device_vendor_id, device_product_id)

            return port.device

        logging.debug(
            "Port %s does not match USB device %s (%s:%s)",
            port.device, device_product, device_vendor_id, device_product_id)

    return None
