#!/usr/bin/env python3

"""
Calibrate DRPD VBUS buckets using an FNIRSI DPS150 power supply.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Sequence


REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_ROOT = REPO_ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))


DEFAULT_CURRENT_LIMIT_A = 0.5
DEFAULT_SETTLE_SECONDS = 2
DEFAULT_START_VOLTAGE = 1
DEFAULT_END_VOLTAGE = 19
DEFAULT_FIRMWARE_CHANNEL = "production"
DRPD_FIRMWARE_RELEASES_URL = "https://api.github.com/repos/T76-org/drpd/releases"
DRPD_FIRMWARE_DOWNLOAD_BASE_URL = "https://t76.org/drpd/releases"
DRPD_FIRMWARE_ASSET_NAME = "drpd-firmware-combined.uf2"
FIRMWARE_REENUMERATE_TIMEOUT_SECONDS = 15
FIRMWARE_REENUMERATE_INTERVAL_SECONDS = 0.5
PICO_SDK_PICOTOOL_ROOT = Path.home() / ".pico-sdk" / "picotool"
DEFAULT_FIRMWARE_CACHE_DIR = (
    Path(tempfile.gettempdir()) / "drpd-firmware-cache"
)
FirmwareChannel = Literal["production", "beta"]


class ScriptError(RuntimeError):
    """Raised when the calibration script cannot proceed safely."""


@dataclass(frozen=True)
class FirmwareVersion:
    """Parsed DRPD firmware version."""

    major: int
    minor: int
    patch: int
    beta_number: int | None
    text: str

    @property
    def is_beta(self) -> bool:
        return self.beta_number is not None

    @property
    def is_stable(self) -> bool:
        return self.beta_number is None


@dataclass(frozen=True)
class FirmwareRelease:
    """Selectable firmware release metadata."""

    version: FirmwareVersion
    version_text: str
    channel: FirmwareChannel
    download_url: str
    size: int | None


FIRMWARE_VERSION_PATTERN = re.compile(
    r"^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-beta\.([1-9]\d*))?$"
)


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
    parser.add_argument(
        "--flash-uf2",
        type=Path,
        help="Flash the specified UF2 with picotool and exit.",
    )
    parser.add_argument(
        "--picotool",
        type=Path,
        help=(
            "Path to picotool. Auto-discovered from ~/.pico-sdk/picotool "
            "or PATH by default."
        ),
    )
    parser.add_argument(
        "--skip-firmware-prepare",
        action="store_true",
        help="Skip erase/download/flash preparation before calibration.",
    )
    parser.add_argument(
        "--firmware-channel",
        choices=("production", "beta"),
        default=DEFAULT_FIRMWARE_CHANNEL,
        help="Firmware update channel for calibration prep. Default: %(default)s",
    )
    parser.add_argument(
        "--firmware-cache-dir",
        type=Path,
        default=DEFAULT_FIRMWARE_CACHE_DIR,
        help=(
            "Directory for cached firmware downloads. "
            f"Default: {DEFAULT_FIRMWARE_CACHE_DIR}"
        ),
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
        help="Restore the device calibration table to defaults and exit without calibrating.",
    )
    return parser


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    """Parse and validate command-line arguments."""
    args = build_parser().parse_args(argv)

    if args.flash_uf2 is not None and not args.flash_uf2.expanduser().is_file():
        raise ScriptError(
            f"--flash-uf2 must reference an existing file: {args.flash_uf2}"
        )

    if args.picotool is not None and not args.picotool.expanduser().is_file():
        raise ScriptError(
            f"--picotool must reference an existing file: {args.picotool}"
        )

    firmware_cache_dir = args.firmware_cache_dir.expanduser()
    if firmware_cache_dir.exists() and not firmware_cache_dir.is_dir():
        raise ScriptError(
            "--firmware-cache-dir must reference a directory when it exists: "
            f"{args.firmware_cache_dir}"
        )

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


def parse_firmware_version(value: str) -> FirmwareVersion:
    """Parse a DRPD firmware version or GitHub tag."""
    match = FIRMWARE_VERSION_PATTERN.match(value.strip())
    if match is None:
        raise ScriptError(f"Invalid firmware version: {value}")

    major = int(match.group(1))
    minor = int(match.group(2))
    patch = int(match.group(3))
    beta_number = int(match.group(4)) if match.group(4) is not None else None
    text = (
        f"{major}.{minor}.{patch}"
        if beta_number is None
        else f"{major}.{minor}.{patch}-beta.{beta_number}"
    )
    return FirmwareVersion(
        major=major,
        minor=minor,
        patch=patch,
        beta_number=beta_number,
        text=text,
    )


def compare_firmware_versions(
    left: FirmwareVersion,
    right: FirmwareVersion,
) -> int:
    """Compare two parsed firmware versions."""
    left_key = (left.major, left.minor, left.patch)
    right_key = (right.major, right.minor, right.patch)
    if left_key != right_key:
        return 1 if left_key > right_key else -1

    if left.is_stable and right.is_beta:
        return 1
    if left.is_beta and right.is_stable:
        return -1
    return (left.beta_number or 0) - (right.beta_number or 0)


def _firmware_release_sort_key(
    release: FirmwareRelease,
) -> tuple[int, int, int, int, int]:
    """Return a sortable key matching the frontend firmware ordering."""
    return (
        release.version.major,
        release.version.minor,
        release.version.patch,
        1 if release.version.is_stable else 0,
        release.version.beta_number or 0,
    )


def _firmware_asset_from_release(
    release: dict[str, Any],
    version_text: str,
) -> tuple[str, int | None] | None:
    """Return the derived public firmware URL and GitHub asset size."""
    assets = release.get("assets")
    if not isinstance(assets, list):
        return None

    for asset in assets:
        if not isinstance(asset, dict):
            continue
        if asset.get("name") != DRPD_FIRMWARE_ASSET_NAME:
            continue
        size = asset.get("size")
        return (
            f"{DRPD_FIRMWARE_DOWNLOAD_BASE_URL}/{version_text}/"
            f"{DRPD_FIRMWARE_ASSET_NAME}",
            size if isinstance(size, int) else None,
        )
    return None


def normalize_github_firmware_releases(
    releases: Sequence[dict[str, Any]],
) -> list[FirmwareRelease]:
    """Convert GitHub release API records into selectable firmware releases."""
    normalized: list[FirmwareRelease] = []
    for release in releases:
        tag_name = release.get("tag_name")
        if not isinstance(tag_name, str):
            continue

        if release.get("draft") is True:
            print(f"Skipping draft firmware release {tag_name}")
            continue

        try:
            version = parse_firmware_version(tag_name)
        except ScriptError:
            print(f"Skipping firmware release with invalid tag {tag_name}")
            continue

        prerelease = release.get("prerelease") is True
        if prerelease and version.is_stable:
            print(
                f"Skipping prerelease firmware release with stable tag {tag_name}"
            )
            continue
        if not prerelease and version.is_beta:
            print(f"Skipping stable firmware release with beta tag {tag_name}")
            continue

        asset = _firmware_asset_from_release(release, version.text)
        if asset is None:
            print(
                f"Skipping firmware release {version.text}; missing "
                f"{DRPD_FIRMWARE_ASSET_NAME}"
            )
            continue

        download_url, size = asset
        normalized.append(
            FirmwareRelease(
                version=version,
                version_text=version.text,
                channel="beta" if prerelease else "production",
                download_url=download_url,
                size=size,
            )
        )
    return normalized


def select_release_for_channel(
    releases: Sequence[FirmwareRelease],
    channel: FirmwareChannel,
) -> FirmwareRelease | None:
    """Select the newest firmware release eligible for an update channel."""
    eligible = [
        release
        for release in releases
        if channel == "beta" or release.channel == "production"
    ]
    if not eligible:
        return None
    return max(eligible, key=_firmware_release_sort_key)


def fetch_github_firmware_releases() -> list[dict[str, Any]]:
    """Fetch DRPD firmware release metadata from GitHub."""
    request = urllib.request.Request(
        DRPD_FIRMWARE_RELEASES_URL,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "drpd-vbus-calibration-script",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = response.read()
    except urllib.error.URLError as exc:
        raise ScriptError(f"GitHub releases request failed: {exc}") from exc

    try:
        decoded = json.loads(data.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ScriptError("GitHub releases response was not valid JSON") from exc

    if not isinstance(decoded, list):
        raise ScriptError(
            "GitHub releases response did not contain a release list"
        )

    return [release for release in decoded if isinstance(release, dict)]


def discover_latest_firmware_release(channel: FirmwareChannel) -> FirmwareRelease:
    """Discover the newest firmware release matching the requested channel."""
    raw_releases = fetch_github_firmware_releases()
    releases = normalize_github_firmware_releases(raw_releases)
    release = select_release_for_channel(releases, channel)
    if release is None:
        raise ScriptError(f"No firmware release found for channel {channel}")

    print(
        f"Selected firmware {release.version_text} "
        f"({release.channel}) from {release.download_url}"
    )
    return release


def download_firmware_release(
    release: FirmwareRelease,
    cache_dir: Path,
) -> Path:
    """Download a firmware release into the local cache if needed."""
    release_cache_dir = cache_dir.expanduser() / release.version_text
    firmware_path = release_cache_dir / DRPD_FIRMWARE_ASSET_NAME

    if firmware_path.is_file():
        cached_size = firmware_path.stat().st_size
        if release.size is None or cached_size == release.size:
            print(f"Using cached firmware: {firmware_path}")
            return firmware_path
        print(
            f"Cached firmware size mismatch for {firmware_path}; "
            "downloading again."
        )

    release_cache_dir.mkdir(parents=True, exist_ok=True)
    temp_path = firmware_path.with_suffix(f"{firmware_path.suffix}.part")
    request = urllib.request.Request(
        release.download_url,
        headers={"User-Agent": "drpd-vbus-calibration-script"},
    )

    print(f"Downloading firmware: {release.download_url}")
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            with temp_path.open("wb") as output:
                shutil.copyfileobj(response, output)
    except (OSError, urllib.error.URLError) as exc:
        with suppress(OSError):
            temp_path.unlink()
        raise ScriptError(f"Firmware download failed: {exc}") from exc

    downloaded_size = temp_path.stat().st_size
    if release.size is not None and downloaded_size != release.size:
        with suppress(OSError):
            temp_path.unlink()
        raise ScriptError(
            "Downloaded firmware size mismatch: "
            f"expected {release.size}, got {downloaded_size}"
        )

    temp_path.replace(firmware_path)
    print(f"Cached firmware: {firmware_path}")
    return firmware_path


def ensure_calibration_dependencies_available() -> None:
    """Fail before firmware prep if calibration dependencies are unavailable."""
    missing: list[str] = []

    dependency_imports = (
        ("fnirsi_dps150", "fnirsi-dps150"),
        ("serial.tools.list_ports", "pyserial"),
        ("t76.drpd.device.discovery", "local t76 dependencies"),
        ("t76.drpd.device.types", "local t76 dependencies"),
    )

    for module_name, dependency_name in dependency_imports:
        try:
            __import__(module_name)
        except ModuleNotFoundError as exc:
            missing.append(exc.name or dependency_name)

    if missing:
        unique_missing = ", ".join(sorted(set(missing)))
        raise ScriptError(
            "Missing Python dependencies for calibration: "
            f"{unique_missing}. Run firmware/scripts/setup_vbus_calibration_env.sh "
            "and use firmware/scripts/.venv/bin/python."
        )


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


def _version_sort_key(version: str) -> tuple[tuple[int, ...], int, str]:
    """Return a key that sorts stable version directories after prereleases."""
    version_core, _, suffix = version.partition("-")
    numeric_parts: list[int] = []

    for part in version_core.split("."):
        if not part.isdigit():
            break
        numeric_parts.append(int(part))

    stable_rank = 1 if not suffix else 0
    return (tuple(numeric_parts), stable_rank, version)


def discover_picotool(explicit_picotool: Path | None) -> Path:
    """Resolve picotool from an override, ~/.pico-sdk, or PATH."""
    if explicit_picotool is not None:
        return explicit_picotool.expanduser().resolve()

    pico_sdk_candidates = [
        candidate
        for candidate in PICO_SDK_PICOTOOL_ROOT.glob("*/picotool/picotool")
        if candidate.is_file()
    ]

    if pico_sdk_candidates:
        newest_candidate = max(
            pico_sdk_candidates,
            key=lambda candidate: _version_sort_key(candidate.parents[1].name),
        )
        return newest_candidate.resolve()

    path_candidate = shutil.which("picotool")
    if path_candidate is not None:
        return Path(path_candidate).resolve()

    raise ScriptError(
        "Could not find picotool. Use --picotool or install it under "
        "~/.pico-sdk/picotool."
    )


def run_picotool_command(
    explicit_picotool: Path | None,
    arguments: Sequence[str],
    failure_context: str,
) -> None:
    """Run picotool with streamed output and ScriptError failure handling."""
    picotool_path = discover_picotool(explicit_picotool)
    command = [str(picotool_path), *arguments]

    print(f"Using picotool: {picotool_path}", flush=True)
    print(f"Running: {' '.join(command)}", flush=True)

    try:
        result = subprocess.run(command, check=False)
    except OSError as exc:
        raise ScriptError(f"Could not run picotool: {exc}") from exc

    if result.returncode != 0:
        raise ScriptError(
            f"{failure_context} failed with exit code {result.returncode}"
        )


def flash_uf2(uf2_path: Path, explicit_picotool: Path | None) -> None:
    """Flash a UF2 with picotool and raise ScriptError on failure."""
    resolved_uf2_path = uf2_path.expanduser().resolve()
    print(f"Flashing UF2: {resolved_uf2_path}", flush=True)
    run_picotool_command(
        explicit_picotool,
        [
            "load",
            "-fx",
            str(resolved_uf2_path),
        ],
        "picotool load",
    )


def erase_device_flash(explicit_picotool: Path | None) -> None:
    """Erase all flash while keeping the device available to picotool."""
    run_picotool_command(
        explicit_picotool,
        ["erase", "-a", "-F"],
        "picotool erase",
    )


def load_firmware_for_calibration(
    uf2_path: Path,
    explicit_picotool: Path | None,
) -> None:
    """Load and execute the cached firmware after the erase step."""
    resolved_uf2_path = uf2_path.expanduser().resolve()
    run_picotool_command(
        explicit_picotool,
        [
            "load",
            "-x",
            str(resolved_uf2_path),
        ],
        "picotool load",
    )


def wait_for_drpd_device(
    serial_number: str | None,
    index: int | None,
    timeout_seconds: float = FIRMWARE_REENUMERATE_TIMEOUT_SECONDS,
) -> None:
    """Wait for a flashed DRPD device to re-enumerate."""
    deadline = time.monotonic() + timeout_seconds
    last_error: ScriptError | None = None

    while True:
        try:
            device = discover_drpd_device(serial_number, index)
        except ScriptError as exc:
            last_error = exc
            if time.monotonic() >= deadline:
                raise ScriptError(
                    "Timed out waiting for DRPD device after firmware load. "
                    f"Last error: {last_error}"
                ) from exc
            time.sleep(FIRMWARE_REENUMERATE_INTERVAL_SECONDS)
            continue

        print(f"DRPD device re-enumerated: {_describe_drpd_device(device, 0)}")
        return


def prepare_firmware_for_calibration(args: argparse.Namespace) -> None:
    """Erase the device and load the latest selected firmware."""
    release = discover_latest_firmware_release(args.firmware_channel)
    firmware_path = download_firmware_release(release, args.firmware_cache_dir)

    print("Erasing DRPD flash before calibration firmware load.")
    erase_device_flash(args.picotool)
    print(f"Loading calibration firmware: {firmware_path}")
    load_firmware_for_calibration(firmware_path, args.picotool)
    print("Waiting for DRPD device to re-enumerate.")
    wait_for_drpd_device(args.drpd_serial, args.drpd_index)


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

        print("Resetting device calibration table to defaults.")
        await device.analog_monitor.reset_vbus_calibration_to_defaults()

        if not args.reset_to_defaults:
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
        if args.flash_uf2 is not None:
            flash_uf2(args.flash_uf2, args.picotool)
        else:
            if not args.skip_firmware_prepare:
                ensure_calibration_dependencies_available()
                prepare_firmware_for_calibration(args)
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
