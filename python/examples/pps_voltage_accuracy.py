#!/usr/bin/env python3
"""Sweep PPS voltage settings and measure VBUS with Dr. PD."""

import argparse
import asyncio
import logging
import math
import statistics
import time

from t76.drpd.device.device import Device
from t76.drpd.device.device_sink_pdos import SPR_PDOPPS
from t76.drpd.device.discovery import find_drpd_devices
from t76.drpd.device.types import Mode
from t76.drpd.device.types import SinkRequestOutcome
from t76.drpd.device.types import SinkState


def voltage_points(min_v: float, max_v: float, step_mv: int) -> list[int]:
    """Return inclusive PPS-aligned settings, including the upper limit."""
    if step_mv <= 0 or step_mv % 20:
        raise ValueError("step must be a positive multiple of 20 mV")
    low = math.ceil(round(min_v * 1000, 6) / 20) * 20
    high = math.floor(round(max_v * 1000, 6) / 20) * 20
    if low <= 0 or high < low:
        raise ValueError("Invalid PPS voltage range")
    points = list(range(low, high + 1, step_mv))
    if points[-1] != high:
        points.append(high)
    return points


async def request_voltage(
    device: Device, index: int, voltage_mv: int, current_ma: int
) -> None:
    """Request a setting and wait for acceptance and completed transition."""
    logging.debug("Requesting PDO %d: %.2f V, %d mA", index,
                 voltage_mv / 1000, current_ma)
    last_status = None
    transition = "not observed"
    try:
        async with asyncio.timeout(10):
            await device.sink.set_pdo(index, voltage_mv, current_ma)
            while True:
                status = await device.sink.get_request_status()
                if status != last_status:
                    logging.debug("Request status: %s", status)
                    last_status = status
                matches = (status.index, status.voltage_mv, status.current_ma)
                if matches == (index, voltage_mv, current_ma):
                    if status.outcome == SinkRequestOutcome.ACCEPTED:
                        ready = await device.sink.get_status()
                        negotiated = await device.sink.get_negotiated_voltage()
                        pdo = await device.sink.get_negotiated_pdo()
                        observed = (f"state={ready.value}, "
                                    f"voltage={negotiated} "
                                    f"mV, PDO={pdo}")
                        if observed != transition:
                            logging.debug("Transition: %s", observed)
                            transition = observed
                        if (ready == SinkState.PE_SNK_READY
                                and negotiated == voltage_mv
                                and isinstance(pdo, SPR_PDOPPS)):
                            return
                    elif status.outcome != SinkRequestOutcome.PENDING:
                        raise RuntimeError(
                            f"PPS request {voltage_mv} mV: "
                            f"{status.outcome.value}"
                        )
                await asyncio.sleep(0.05)
    except TimeoutError as error:
        raise TimeoutError(
            f"Timed out requesting PDO {index} at {voltage_mv} mV; "
            f"last request status={last_status}; {transition}"
        ) from error


async def sweep(device: Device, args: argparse.Namespace) -> None:
    """Sweep every PPS APDO and print a summary of measured errors."""
    logging.info("Negotiating with the supply (EPR disabled)...")
    last_state = None
    try:
        async with asyncio.timeout(10):
            while True:
                state = await device.sink.get_status()
                if state != last_state:
                    logging.debug("Sink state: %s", state.value)
                    last_state = state
                if state == SinkState.PE_SNK_READY:
                    break
                await asyncio.sleep(0.1)
    except TimeoutError as error:
        raise TimeoutError(
            f"Timed out waiting for initial negotiation; "
            f"last sink state={last_state}. Check the DUT connection "
            "and that the supply supports USB-PD."
        ) from error
    logging.debug("Reading advertised power profiles")
    pdos = [
        (index, await device.sink.get_pdo_at_index(index))
        for index in range(await device.sink.get_pdo_count())
    ]
    for index, pdo in pdos:
        logging.debug("PDO %d: %s", index, pdo)
    pps = [(i, p) for i, p in pdos if isinstance(p, SPR_PDOPPS)]
    if not pps:
        raise RuntimeError("The connected source advertises no PPS APDOs")
    errors = []
    for index, pdo in pps:
        if args.current_ma > round(pdo.max_current * 1000):
            raise ValueError(f"Current exceeds PPS PDO {index} limit")
        points = voltage_points(
            pdo.min_voltage, pdo.max_voltage, args.step_mv
        )
        logging.info("PDO %d: %.2f–%.2f V, %d settings at %d mA",
                     index, pdo.min_voltage, pdo.max_voltage,
                     len(points), args.current_ma)
        last_progress = time.monotonic()
        for count, mv in enumerate(points, start=1):
            await request_voltage(device, index, mv, args.current_ma)
            await asyncio.sleep(args.settle)
            readings = []
            for _ in range(args.samples):
                reading = await device.analog_monitor.get_vbus_voltage()
                if not math.isfinite(reading):
                    raise RuntimeError("Non-finite VBUS reading")
                readings.append(reading)
                await asyncio.sleep(0.1)
            if (await device.sink.get_negotiated_voltage() != mv
                    or await device.sink.get_error_status()
                    or not isinstance(
                        await device.sink.get_negotiated_pdo(), SPR_PDOPPS
                    )):
                raise RuntimeError("PPS contract changed during sampling")
            mean = statistics.mean(readings)
            error_mv = mean * 1000 - mv
            errors.append((index, mv, mean, error_mv))
            if time.monotonic() - last_progress >= 10:
                logging.info("PDO %d: %d/%d settings measured (%.2f V)",
                             index, count, len(points), mv / 1000)
                last_progress = time.monotonic()
    worst = max(errors, key=lambda result: abs(result[3]))
    worst_percent = max(abs(error / mv * 100)
                        for _, mv, _, error in errors)
    mean_absolute = statistics.mean(abs(row[3]) for row in errors)
    print(f"Tested {len(errors)} settings across {len(pps)} PPS profiles.",
          flush=True)
    print(f"Mean absolute voltage error: {mean_absolute:.1f} mV")
    print(f"Worst voltage error: {worst[3]:+.1f} mV at "
          f"{worst[1] / 1000:.2f} V (measured {worst[2]:.4f} V, "
          f"PDO {worst[0]})")
    print(f"Maximum absolute percentage error: {worst_percent:.2f}%")


async def run(args: argparse.Namespace) -> None:
    """Connect to one instrument and disable its sink on every exit."""
    logging.info("Connecting to Dr. PD...")
    devices = find_drpd_devices()
    if len(devices) != 1:
        raise RuntimeError(f"Connect exactly one Dr. PD; found {len(devices)}")
    device = devices[0]
    logging.debug("Connecting to Dr. PD")
    await device.connect()
    try:
        logging.debug("Enabling sink mode")
        await device.mode.set(Mode.SINK)
        original_epr = None
        try:
            original_epr = await device.sink.get_epr_enabled()
            logging.debug("Disabling EPR entry for this SPR PPS test")
            await device.sink.set_epr_enabled(False)
            # Restart negotiation in case EPR entry was already underway.
            logging.debug("Restarting negotiation with EPR disabled")
            await device.mode.set(Mode.DISABLED)
            await device.mode.set(Mode.SINK)
            await sweep(device, args)
        finally:
            try:
                if original_epr is not None:
                    logging.debug("Restoring EPR entry setting: %s",
                                 original_epr)
                    await device.sink.set_epr_enabled(original_epr)
            finally:
                logging.debug("Disabling sink mode")
                await device.mode.set(Mode.DISABLED)
    finally:
        logging.debug("Disconnecting from Dr. PD")
        await device.disconnect()


def main() -> None:
    """Parse sweep options and run the example."""
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--step-mv", type=int, default=100)
    parser.add_argument("--current-ma", type=int, default=500)
    parser.add_argument("--samples", type=int, default=5)
    parser.add_argument("--settle", type=float, default=0.5)
    args = parser.parse_args()
    if args.step_mv <= 0 or args.step_mv % 20:
        parser.error("--step-mv must be a positive multiple of 20")
    if args.current_ma <= 0 or args.current_ma % 50:
        parser.error("--current-ma must be a positive multiple of 50")
    if args.samples < 1 or not math.isfinite(args.settle) or args.settle < 0:
        parser.error("--samples must be positive and --settle finite and >= 0")
    try:
        asyncio.run(run(args))
    except KeyboardInterrupt:
        parser.exit(130, "Test interrupted.\n")
    except (OSError, RuntimeError, TimeoutError, ValueError) as error:
        detail = str(error) or repr(error)
        parser.exit(1, f"Test stopped: {type(error).__name__}: {detail}\n")


if __name__ == "__main__":
    main()
