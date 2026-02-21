"""
Unit tests for PPS setup modal.
"""

import unittest
from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch

from textual.widgets import Input

from t76.drpd.app.main_screen.sink_pps_setup_modal import SinkPPSSetupModal
from t76.drpd.device.device_sink_pdos import SPR_PDOPPS


class TestSinkPPSSetupModal(unittest.IsolatedAsyncioTestCase):
    """Tests for PPS setup modal validation and submission."""

    def _build_modal(
        self,
        pdo: SPR_PDOPPS,
        pdo_index: int = 1,
    ) -> tuple[SinkPPSSetupModal, MagicMock, Input, Input, MagicMock]:
        """Create modal with mocked dependencies and inputs."""
        device = MagicMock()
        device.sink = MagicMock()
        device.sink.set_pdo = AsyncMock()
        device.sink.get_negotiated_voltage = AsyncMock(return_value=9000)
        device.sink.get_negotiated_current = AsyncMock(return_value=3000)

        modal = SinkPPSSetupModal(device=device, pdo_index=pdo_index, pdo=pdo)
        voltage_input = Input(id="voltage-input")
        current_input = Input(id="current-input")
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

    async def test_blank_current_is_rejected(self) -> None:
        """Modal should reject submission when current is blank."""
        modal, device, voltage_input, current_input, error_label = (
            self._build_modal(
                SPR_PDOPPS(
                    min_voltage=5.0,
                    max_voltage=21.0,
                    max_current=5.0,
                )
            )
        )
        voltage_input.value = "15.0"
        current_input.value = ""

        await modal.handle_ok()

        device.sink.set_pdo.assert_not_awaited()
        error_label.update.assert_called_with("Please enter a current value")

    async def test_voltage_step_is_enforced(self) -> None:
        """Modal should reject PPS voltage that is not a 20mV step."""
        modal, device, voltage_input, current_input, error_label = (
            self._build_modal(
                SPR_PDOPPS(
                    min_voltage=5.0,
                    max_voltage=21.0,
                    max_current=5.0,
                )
            )
        )
        voltage_input.value = "15.25"
        current_input.value = "3.0"

        await modal.handle_ok()

        device.sink.set_pdo.assert_not_awaited()
        error_label.update.assert_called_with(
            "Voltage must be in 0.020V increments for PPS"
        )

    async def test_current_step_is_enforced(self) -> None:
        """Modal should reject PPS current that is not a 50mA step."""
        modal, device, voltage_input, current_input, error_label = (
            self._build_modal(
                SPR_PDOPPS(
                    min_voltage=5.0,
                    max_voltage=21.0,
                    max_current=5.0,
                )
            )
        )
        voltage_input.value = "15.0"
        current_input.value = "3.025"

        await modal.handle_ok()

        device.sink.set_pdo.assert_not_awaited()
        error_label.update.assert_called_with(
            "Current must be in 0.050A increments for PPS"
        )

    async def test_valid_voltage_and_current_submits_request(self) -> None:
        """Modal should submit request for valid voltage/current values."""
        modal, device, voltage_input, current_input, _error_label = (
            self._build_modal(
                SPR_PDOPPS(
                    min_voltage=5.0,
                    max_voltage=21.0,
                    max_current=5.0,
                ),
                pdo_index=2,
            )
        )
        voltage_input.value = "15.020"
        current_input.value = "3.050"
        mock_app = MagicMock()

        with patch.object(
            SinkPPSSetupModal, "app",
            new_callable=PropertyMock,
            return_value=mock_app,
        ):
            await modal.handle_ok()

        device.sink.set_pdo.assert_awaited_once_with(2, 15020, 3050)
        mock_app.pop_screen.assert_called_once()
