"""
Unit tests for AVS setup modal.
"""

import unittest
from typing import Union
from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch

from t76.drpd.app.main_screen.sink_avs_setup_modal import SinkAVSSetupModal
from t76.drpd.device.device_sink_pdos import EPR_PDOAVs, SPR_PDOAVs


class _FakeInput:
    """Minimal stand-in for Textual Input used by validation tests."""

    def __init__(self, value: str = "") -> None:
        self.value = value


class TestSinkAVSSetupModal(unittest.IsolatedAsyncioTestCase):
    """Tests for AVS setup modal validation and submission."""

    def _build_modal(
        self,
        pdo: Union[SPR_PDOAVs, EPR_PDOAVs],
        pdo_index: int = 1,
    ) -> tuple[SinkAVSSetupModal, MagicMock, _FakeInput, _FakeInput, MagicMock]:
        """Create modal with mocked dependencies and inputs."""
        device = MagicMock()
        device.sink = MagicMock()
        device.sink.set_pdo = AsyncMock()
        device.sink.get_negotiated_voltage = AsyncMock(return_value=9000)

        modal = SinkAVSSetupModal(device=device, pdo_index=pdo_index, pdo=pdo)
        voltage_input = _FakeInput()
        current_input = _FakeInput()
        error_label = MagicMock()
        modal.error_label = error_label

        def query_one(selector: str, *_args):
            if selector == "#voltage-input":
                return voltage_input
            if selector == "#current-input":
                return current_input
            raise AssertionError(f"Unexpected query selector: {selector}")

        modal.query_one = MagicMock(side_effect=query_one)
        return modal, device, voltage_input, current_input, error_label

    async def test_blank_voltage_is_rejected(self) -> None:
        """Modal should reject submission when voltage is blank."""
        modal, device, voltage_input, current_input, error_label = (
            self._build_modal(
                SPR_PDOAVs(
                    min_voltage=9.0,
                    max_voltage=21.0,
                    max_power=140.0,
                )
            )
        )
        voltage_input.value = ""
        current_input.value = ""

        await modal.handle_ok()

        device.sink.set_pdo.assert_not_awaited()
        error_label.update.assert_called_with("Please enter a voltage value")

    async def test_blank_current_is_rejected(self) -> None:
        """Modal should reject submission when current is blank."""
        modal, device, voltage_input, current_input, error_label = (
            self._build_modal(
                SPR_PDOAVs(
                    min_voltage=9.0,
                    max_voltage=21.0,
                    max_power=140.0,
                ),
                pdo_index=3,
            )
        )
        voltage_input.value = "15.0"
        current_input.value = ""

        await modal.handle_ok()

        device.sink.set_pdo.assert_not_awaited()
        error_label.update.assert_called_with("Please enter a current value")

    async def test_voltage_step_is_enforced(self) -> None:
        """Modal should reject AVS voltage that is not a 25mV step."""
        modal, device, voltage_input, current_input, error_label = (
            self._build_modal(
                EPR_PDOAVs(
                    min_voltage=15.0,
                    max_voltage=48.0,
                    max_power=240.0,
                )
            )
        )
        voltage_input.value = "20.030"
        current_input.value = "3.0"

        await modal.handle_ok()

        device.sink.set_pdo.assert_not_awaited()
        error_label.update.assert_called_with(
            "Voltage must be in 0.025V increments for AVS"
        )

    async def test_current_step_is_enforced(self) -> None:
        """Modal should reject AVS current that is not a 50mA step."""
        modal, device, voltage_input, current_input, error_label = (
            self._build_modal(
                EPR_PDOAVs(
                    min_voltage=15.0,
                    max_voltage=48.0,
                    max_power=240.0,
                )
            )
        )
        voltage_input.value = "20.0"
        current_input.value = "3.025"

        await modal.handle_ok()

        device.sink.set_pdo.assert_not_awaited()
        error_label.update.assert_called_with(
            "Current must be in 0.050A increments"
        )

    async def test_current_above_power_limit_is_rejected(self) -> None:
        """Modal should reject current that exceeds max AVS power."""
        modal, device, voltage_input, current_input, error_label = (
            self._build_modal(
                EPR_PDOAVs(
                    min_voltage=15.0,
                    max_voltage=48.0,
                    max_power=240.0,
                )
            )
        )
        voltage_input.value = "20.0"
        current_input.value = "20.0"

        await modal.handle_ok()

        device.sink.set_pdo.assert_not_awaited()
        self.assertIn(
            "Current exceeds AVS max power",
            error_label.update.call_args.args[0],
        )

    async def test_valid_voltage_and_current_submits_request(self) -> None:
        """Modal should submit request for valid voltage/current values."""
        modal, device, voltage_input, current_input, _error_label = (
            self._build_modal(
                EPR_PDOAVs(
                    min_voltage=15.0,
                    max_voltage=48.0,
                    max_power=240.0,
                ),
                pdo_index=5,
            )
        )
        voltage_input.value = "24.0"
        current_input.value = "5.0"
        mock_app = MagicMock()

        with patch.object(
            SinkAVSSetupModal, "app",
            new_callable=PropertyMock,
            return_value=mock_app,
        ):
            await modal.handle_ok()

        device.sink.set_pdo.assert_awaited_once_with(5, 24000, 5000)
        mock_app.pop_screen.assert_called_once()
