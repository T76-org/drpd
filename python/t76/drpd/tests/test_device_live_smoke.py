"""
Optional live smoke test for an attached Dr. PD USBTMC device.
"""

from __future__ import annotations

import unittest

import usb.core

from t76.drpd.device.device import Device


def _find_live_drpd():
    devices = list(usb.core.find(
        find_all=True,
        idVendor=0x2E8A,
        idProduct=0x000A,
    ))
    return devices[0] if devices else None


class TestDeviceLiveSmoke(unittest.IsolatedAsyncioTestCase):
    async def test_live_drpd_identity_and_numeric_query(self) -> None:
        usb_device = _find_live_drpd()
        if usb_device is None:
            self.skipTest(
                "No Dr. PD USB device found via PyUSB "
                "(0x2e8a:0x000a enumeration returned 0 devices)."
            )

        device = Device(usb_device)
        await device.connect()
        try:
            identity = await device.system.identify()
            self.assertTrue(identity.model)

            memory = await device.system.get_memory_usage()
            self.assertGreater(memory.total, 0)
        finally:
            await device.disconnect()
