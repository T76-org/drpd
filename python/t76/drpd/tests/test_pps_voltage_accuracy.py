"""Hardware-free checks for the PPS automation example."""

import argparse
import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from t76.drpd.device.device_sink_pdos import SPR_PDOPPS
from t76.drpd.device.types import SinkRequestOutcome
from t76.drpd.device.types import SinkRequestStatus
from t76.drpd.device.types import SinkState

SCRIPT = Path(__file__).resolve().parents[3] / "examples/pps_voltage_accuracy.py"
SPEC = importlib.util.spec_from_file_location("pps_accuracy", SCRIPT)
example = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(example)


def test_points_include_endpoint_without_exceeding_range():
    """A non-divisible span includes the maximum exactly once."""
    assert example.voltage_points(3.3, 3.56, 100) == [3300, 3400, 3500, 3560]
    with pytest.raises(ValueError):
        example.voltage_points(3.3, 11, 25)


def test_sweep_summarizes_measured_error(capsys):
    """Exercise negotiation, averaging, and summary units together."""
    import asyncio

    sink = SimpleNamespace(
        get_status=AsyncMock(return_value=SinkState.PE_SNK_READY),
        get_pdo_count=AsyncMock(return_value=1),
        get_pdo_at_index=AsyncMock(return_value=SPR_PDOPPS(5, 5, 3)),
        set_pdo=AsyncMock(),
        get_request_status=AsyncMock(return_value=SinkRequestStatus(
            SinkRequestOutcome.ACCEPTED, 0, 5000, 500
        )),
        get_negotiated_voltage=AsyncMock(return_value=5000),
        get_negotiated_pdo=AsyncMock(return_value=SPR_PDOPPS(5, 5, 3)),
        get_error_status=AsyncMock(return_value=False),
    )
    device = SimpleNamespace(sink=sink, analog_monitor=SimpleNamespace(
        get_vbus_voltage=AsyncMock(side_effect=[5.01, 5.03])
    ))
    args = argparse.Namespace(current_ma=500,
                              step_mv=100, settle=0, samples=2)
    asyncio.run(example.sweep(device, args))
    output = capsys.readouterr().out
    assert "Tested 1 settings across 1 PPS profiles." in output
    assert "Mean absolute voltage error: 20.0 mV" in output
    assert "Worst voltage error: +20.0 mV at 5.00 V" in output
    assert "Maximum absolute percentage error: 0.40%" in output
    sink.set_pdo.assert_awaited_once_with(0, 5000, 500)


def test_cleanup_on_failure(monkeypatch):
    """Always disable the sink and disconnect when a sweep fails."""
    import asyncio

    device = SimpleNamespace(connect=AsyncMock(), disconnect=AsyncMock(),
                             mode=SimpleNamespace(set=AsyncMock()),
                             sink=SimpleNamespace(
                                 get_epr_enabled=AsyncMock(return_value=True),
                                 set_epr_enabled=AsyncMock(),
                             ))
    monkeypatch.setattr(example, "find_drpd_devices", lambda: [device])
    monkeypatch.setattr(example, "sweep", AsyncMock(
        side_effect=RuntimeError("source disconnected")
    ))
    with pytest.raises(RuntimeError):
        asyncio.run(example.run(argparse.Namespace()))
    assert device.mode.set.await_args_list[-1].args == (example.Mode.DISABLED,)
    device.disconnect.assert_awaited_once()
    assert [call.args for call in
            device.sink.set_epr_enabled.await_args_list] == [(False,), (True,)]
    assert [call.args for call in device.mode.set.await_args_list] == [
        (example.Mode.SINK,), (example.Mode.DISABLED,),
        (example.Mode.SINK,), (example.Mode.DISABLED,),
    ]


def test_request_timeout_explains_setting():
    """Even an empty transport timeout identifies the requested setting."""
    import asyncio

    device = SimpleNamespace(sink=SimpleNamespace(
        set_pdo=AsyncMock(side_effect=TimeoutError())
    ))
    with pytest.raises(TimeoutError, match="PDO 2 at 3300 mV"):
        asyncio.run(example.request_voltage(device, 2, 3300, 500))


def test_initial_timeout_explains_stage():
    """Initial negotiation errors carry context instead of empty text."""
    import asyncio

    device = SimpleNamespace(sink=SimpleNamespace(
        get_status=AsyncMock(side_effect=TimeoutError())
    ))
    with pytest.raises(TimeoutError, match="initial negotiation"):
        asyncio.run(example.sweep(device, argparse.Namespace()))
