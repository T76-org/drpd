"""
Unit tests for the VBUS calibration helper script.
"""

from pathlib import Path
import importlib.util
import sys
import unittest


REPO_ROOT = Path(__file__).resolve().parents[4]
CALIBRATION_SCRIPT = REPO_ROOT / "firmware" / "scripts" / "calibrate.py"

spec = importlib.util.spec_from_file_location(
    "drpd_calibration_script",
    CALIBRATION_SCRIPT,
)
assert spec is not None
assert spec.loader is not None
calibration_script = importlib.util.module_from_spec(spec)
sys.modules["drpd_calibration_script"] = calibration_script
spec.loader.exec_module(calibration_script)


class TestCurrentCalibrationAutofill(unittest.TestCase):
    """Verify current calibration autofill helper behavior."""

    def test_average_scale_factor_excludes_zero_current(self) -> None:
        scale_factor = calibration_script._average_current_calibration_scale_factor({
            0: 0.02,
            500: 0.625,
            1000: 1.25,
        })

        self.assertEqual(scale_factor, 1.25)

    def test_autofill_uses_average_scale_factor_for_remaining_buckets(self) -> None:
        scale_factor, autofilled = calibration_script._autofill_current_calibration_values(
            {
                500: 0.6,
                1000: 1.3,
            },
            [1500, 2000],
        )

        self.assertAlmostEqual(scale_factor, 1.25)
        self.assertAlmostEqual(autofilled[1500], 1.875)
        self.assertAlmostEqual(autofilled[2000], 2.5)

    def test_autofill_is_unavailable_without_nonzero_buckets(self) -> None:
        scale_factor, autofilled = calibration_script._autofill_current_calibration_values(
            {
                0: 0.01,
            },
            [500, 1000],
        )

        self.assertIsNone(scale_factor)
        self.assertEqual(autofilled, {})

    def test_autofill_preserves_captured_buckets(self) -> None:
        _, autofilled = calibration_script._autofill_current_calibration_values(
            {
                500: 0.625,
            },
            [500, 1000],
        )

        self.assertNotIn(500, autofilled)
        self.assertAlmostEqual(autofilled[1000], 1.25)


if __name__ == "__main__":
    unittest.main()
