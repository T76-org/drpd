"""Single-ended identity evidence parsing and mode API tests."""
import asyncio
from unittest.mock import AsyncMock
import pytest
from t76.drpd.device.cable_test import CableTestResult
from t76.drpd.device.device_mode import DeviceMode
from t76.drpd.device.types import Mode


def test_cable_test_identity_and_empty():
    """Keep raw response bytes; removal has no identity payload."""
    result = CableTestResult.from_values([
        "4", "IDENTITY", "2", "1", "2", "00" * 20])
    assert result.vconn_contact == 2 and result.good_crc
    assert len(result.body) == 20
    assert CableTestResult.from_values([
        "5", "WAITING", "0", "0", "2", ""]).body == b""


@pytest.mark.parametrize("values", [
    ["1", "IDENTITY", "0", "1", "2", "00" * 20],
    ["1", "WAITING", "0", "0", "2", "00"],
    ["1", "WAITING", "0", "0", "2", "GG"],
    ["1", "IDENTITY", "1", "1", "2", "00"],
])
def test_reject_inconsistent_evidence(values):
    """Reject partial or contradictory snapshots."""
    with pytest.raises(ValueError):
        CableTestResult.from_values(values)


def test_cable_mode_api():
    """Use public SCPI and preserve transient mode token."""
    internal = AsyncMock()
    internal.query_ascii_values_and_check.return_value = [
        "1", "WAITING", "0", "0", "2", ""]
    mode = DeviceMode(internal)
    asyncio.run(mode.set(Mode.CABLE_TEST))
    internal.write_ascii_and_check.assert_awaited_with(
        "BUS:CC:ROLE CABLE_TEST")
    assert asyncio.run(mode.get_cable_test_result()).outcome == "WAITING"
    assert internal.query_ascii_values_and_check.call_args.args[0] == (
        "CABLE:TEST?")
