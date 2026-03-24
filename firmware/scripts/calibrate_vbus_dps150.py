#!/usr/bin/env python3

"""
Calibrate DRPD VBUS buckets using an FNIRSI DPS150 power supply.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from contextlib import suppress
from pathlib import Path
from typing import Sequence


REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_ROOT = REPO_ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))


DEFAULT_CURRENT_LIMIT_A = 0.5
DEFAULT_SETTLE_SECONDS = 1
DEFAULT_START_VOLTAGE = 1
DEFAULT_END_VOLTAGE = 19


class ScriptError(RuntimeError):
    """Raised when the calibration script cannot proceed safely."""


def build_parser() -> argparse.ArgumentParser:
    """Create the command-line parser for the calibration script."""
    parser = argparse.ArgumentParser(
        description=(
            "Calibrate DRPD VBUS buckets using a connected FNIRSI DPS150."
        )
    )
    parser.add_argument(
        "--dps150-port",
        help="Serial port for the DPS150. Auto-discovered by default.",
    )
    selection_group = parser.add_mutually_exclusive_group()
    selection_group.add_argument(
        "--drpd-serial",
        help="Serial number of the DRPD device to use.",
    )
    selection_group.add_argument(
        "--drpd-index",
        type=int,
        help="Index of the DRPD device to use from the discovered list.",
    )
    parser.add_argument(
        "--current-limit",
        type=float,
        default=DEFAULT_CURRENT_LIMIT_A,
        help="DPS150 current limit in amps. Default: %(default).2f",
    )
    parser.add_argument(
        "--settle-seconds",
        type=float,
        default=DEFAULT_SETTLE_SECONDS,
        help="Delay after each DPS150 voltage change. Default: %(default).2f",
    )
    parser.add_argument(
        "--start-voltage",
        type=int,
        default=DEFAULT_START_VOLTAGE,
        help="First integer bucket to calibrate. Default: %(default)d",
    )
    parser.add_argument(
        "--end-voltage",
        type=int,
        default=DEFAULT_END_VOLTAGE,
        help="Last integer bucket to calibrate. Default: %(default)d",
    )
    parser.add_argument(
        "--reset-to-defaults",
        action="store_true",
        help="Restore the device calibration table to defaults before calibrating.",
    )
    return parser


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    """Parse and validate command-line arguments."""
    args = build_parser().parse_args(argv)

    if args.current_limit <= 0.0:
        raise ScriptError("--current-limit must be greater than zero")

    if args.settle_seconds < 0.0:
        raise ScriptError("--settle-seconds must be non-negative")

    if args.start_voltage < 1 or args.start_voltage > 60:
        raise ScriptError("--start-voltage must be in range [1, 60]")

    if args.end_voltage < 1 or args.end_voltage > 60:
        raise ScriptError("--end-voltage must be in range [1, 60]")

    if args.start_voltage > args.end_voltage:
        raise ScriptError(
            "--start-voltage must be less than or equal to --end-voltage")

    return args


def _device_serial_number(device: object) -> str:
    """Return the USB serial number for a discovered DRPD device."""
    internal = getattr(device, "_internal", None)
    return str(getattr(internal, "serial_number", ""))


def _describe_drpd_device(device: object, index: int) -> str:
    """Format a DRPD device for error messages."""
    name = getattr(device, "name", None) or "Unknown"
    serial_number = _device_serial_number(device) or "Unknown"
    return f"[{index}] {name} (serial={serial_number})"


def discover_drpd_device(
    serial_number: str | None,
    index: int | None,
):
    """Resolve the DRPD device to use from discovery or CLI overrides."""
    try:
        from t76.drpd.device.discovery import find_drpd_devices
    except ModuleNotFoundError as exc:
        raise ScriptError(
            "Missing DRPD Python dependencies. Install the local `t76` "
            "package dependencies before running this script."
        ) from exc

    devices = find_drpd_devices()

    if not devices:
        raise ScriptError("No DRPD devices found.")

    if serial_number is not None:
        matching_devices = [
            device
            for device in devices
            if _device_serial_number(device) == serial_number
        ]

        if not matching_devices:
            known_devices = "\n".join(
                _describe_drpd_device(device, idx)
                for idx, device in enumerate(devices)
            )
            raise ScriptError(
                "No DRPD device matched --drpd-serial.\n"
                f"Discovered devices:\n{known_devices}"
            )

        if len(matching_devices) > 1:
            raise ScriptError(
                "Multiple DRPD devices matched the requested serial number."
            )

        return matching_devices[0]

    if index is not None:
        if index < 0 or index >= len(devices):
            raise ScriptError(
                f"--drpd-index must be in range [0, {len(devices) - 1}]"
            )
        return devices[index]

    if len(devices) > 1:
        known_devices = "\n".join(
            _describe_drpd_device(device, idx)
            for idx, device in enumerate(devices)
        )
        raise ScriptError(
            "Multiple DRPD devices found. Use --drpd-serial or "
            "--drpd-index.\n"
            f"Discovered devices:\n{known_devices}"
        )

    return devices[0]


def _port_field(port: object, attribute: str) -> str:
    """Return a lower-cased serial-port metadata field."""
    value = getattr(port, attribute, None)
    if value is None:
        return ""
    return str(value).lower()


def _looks_like_dps150_port(port: object) -> bool:
    """Return True when serial-port metadata looks like a DPS150."""
    haystack = " ".join(
        (
            _port_field(port, "manufacturer"),
            _port_field(port, "product"),
            _port_field(port, "description"),
            _port_field(port, "hwid"),
        )
    )
    return "fnirsi" in haystack or "dps150" in haystack or "dps-150" in haystack


def _format_port_candidate(port: object) -> str:
    """Format a serial-port candidate for diagnostics."""
    manufacturer = getattr(port, "manufacturer", None) or "Unknown"
    product = getattr(port, "product", None) or "Unknown"
    return f"{port.device} ({manufacturer}, {product})"


def discover_dps150_port(explicit_port: str | None) -> str:
    """Resolve the DPS150 serial port from discovery or an explicit port."""
    if explicit_port is not None:
        return explicit_port

    try:
        from serial.tools import list_ports
    except ModuleNotFoundError as exc:
        raise ScriptError(
            "Missing dependency: pyserial. Install it to use this script."
        ) from exc

    matching_ports = [
        port
        for port in list_ports.comports()
        if _looks_like_dps150_port(port)
    ]

    if not matching_ports:
        raise ScriptError(
            "No FNIRSI DPS150 serial ports found. Use --dps150-port."
        )

    if len(matching_ports) > 1:
        candidates = "\n".join(
            _format_port_candidate(port) for port in matching_ports
        )
        raise ScriptError(
            "Multiple FNIRSI DPS150 serial ports found. Use --dps150-port.\n"
            f"Discovered ports:\n{candidates}"
        )

    return str(matching_ports[0].device)


def print_calibration_table(table: Sequence[float]) -> None:
    """Print the calibration table in CSV and labeled forms."""
    csv_line = ",".join(f"{value:.2f}" for value in table)
    print("\nCalibration table CSV:")
    print(csv_line)
    print("\nCalibration table by bucket:")
    for bucket, value in enumerate(table):
        print(f"  {bucket:02d}: {value:.2f}")


async def calibrate(args: argparse.Namespace) -> None:
    """Run the end-to-end DPS150-driven calibration sequence."""
    try:
        from fnirsi_dps150 import DPS150
    except ModuleNotFoundError as exc:
        raise ScriptError(
            "Missing dependency: fnirsi-dps150. Install it with "
            "`python -m pip install fnirsi-dps150`."
        ) from exc
    try:
        from t76.drpd.device.types import Mode
    except ModuleNotFoundError as exc:
        raise ScriptError(
            "Missing DRPD Python dependencies. Install the local `t76` "
            "package dependencies before running this script."
        ) from exc

    device = discover_drpd_device(args.drpd_serial, args.drpd_index)
    dps150_port = discover_dps150_port(args.dps150_port)
    drpd_name = device.name or "Unknown"
    drpd_serial = _device_serial_number(device) or "Unknown"

    print(f"Using DRPD device: {drpd_name} (serial={drpd_serial})")
    print(f"Using DPS150 port: {dps150_port}")

    await device.connect()
    original_ovp_threshold: float | None = None
    original_ocp_threshold: float | None = None
    original_mode: Mode | None = None

    try:
        original_ovp_threshold = await device.vbus.get_ovp_threshold()
        original_ocp_threshold = await device.vbus.get_ocp_threshold()
        original_mode = await device.mode.get()

        if args.reset_to_defaults:
            print("Resetting device calibration table to defaults.")
            await device.analog_monitor.reset_vbus_calibration_to_defaults()
        else:
            with DPS150(dps150_port) as supply:
                supply.set_current(args.current_limit)
                supply.set_voltage(float(args.start_voltage))
                supply.enable_output()

                await device.vbus.set_ovp_threshold(60)
                await device.vbus.set_ocp_threshold(6)
                await device.mode.set(Mode.OBSERVER)

                try:
                    for bucket in range(args.start_voltage, args.end_voltage + 1):
                        target_voltage = float(bucket)
                        supply.set_voltage(target_voltage)
                        await asyncio.sleep(args.settle_seconds)
                        readback_voltage = (await device.analog_monitor.get_status()).vbus
                        print(
                            f"Bucket {bucket:02d}: DPS150 set {target_voltage:.2f} V, DRPD readback {readback_voltage:.2f} V")
                        await device.analog_monitor.calibrate_vbus_bucket(bucket)
                finally:
                    with suppress(Exception):
                        supply.disable_output()

        table = await device.analog_monitor.get_vbus_calibration_table()
        print_calibration_table(table)
    finally:
        if original_ovp_threshold is not None:
            with suppress(Exception):
                await device.vbus.set_ovp_threshold(original_ovp_threshold)
        if original_ocp_threshold is not None:
            with suppress(Exception):
                await device.vbus.set_ocp_threshold(original_ocp_threshold)
        if original_mode is not None:
            with suppress(Exception):
                await device.mode.set(original_mode)
        await device.disconnect()


def main(argv: Sequence[str] | None = None) -> int:
    """Parse arguments and run the async calibration workflow."""
    try:
        args = parse_args(argv)
        asyncio.run(calibrate(args))
    except KeyboardInterrupt:
        print("Calibration interrupted.", file=sys.stderr)
        return 130
    except ScriptError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
