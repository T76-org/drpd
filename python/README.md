# t76 Python Package

Python tooling for DRPD devices, including:

- A Python API for device discovery and control
- USB-PD message decoding helpers
- A Textual terminal app UI

## Quick Setup (`.venv`)

From the `python/` directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e .
```

For development dependencies:

```bash
python -m pip install -e ".[dev]"
```

To leave the environment:

```bash
deactivate
```

## Run the Textual App

Launch the DRPD Textual app with:

```bash
python3 -m t76.drpd
```

If your `.venv` is active, `python -m t76.drpd` works as well.

You can also list available top-level apps with:

```bash
python -m t76 --apps
```

## Library Usage

### Discover and Connect to a DRPD Device

```python
import asyncio

from t76.drpd.device import find_drpd_devices


async def main() -> None:
    devices = find_drpd_devices()
    if not devices:
        print("No DRPD devices found.")
        return

    device = devices[0]
    await device.connect()
    try:
        mode = await device.mode.get()
        print(f"Connected to {device.name}, mode={mode}")
    finally:
        await device.disconnect()


asyncio.run(main())
```

### Decode USB-PD Messages

The `t76.drpd.message` package exposes message classes and decoding helpers.

Example imports:

```python
from t76.drpd.message import Message, SourceCapabilitiesMessage, VendorDefinedMessage
```

For captured BMC/PD data, see `BMCSequence.from_scpi_response(...)` in `t76.drpd.message.bmc_sequence`.

## Run Tests

With the `.venv` active:

```bash
bash run_tests.sh
```

Or directly:

```bash
python -m pytest t76/drpd/tests/ -v --tb=short
```

