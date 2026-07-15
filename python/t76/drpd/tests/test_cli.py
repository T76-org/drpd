"""Tests for the Dr. PD command-line entry point."""

from unittest.mock import patch

import pytest

from t76.drpd.__main__ import main


def test_help_exits_without_starting_app(capsys: pytest.CaptureFixture[str]) -> None:
    """The help option prints usage without opening the terminal app."""
    with patch("t76.drpd.__main__.DRPDApp") as app_class:
        with pytest.raises(SystemExit) as error:
            main(["--help"])

    assert error.value.code == 0
    assert "usage: drpd" in capsys.readouterr().out
    app_class.assert_not_called()


def test_version_exits_without_starting_app(
    capsys: pytest.CaptureFixture[str],
) -> None:
    """The version option reports package version without opening app."""
    with patch("t76.drpd.__main__.DRPDApp") as app_class:
        with pytest.raises(SystemExit) as error:
            main(["--version"])

    assert error.value.code == 0
    assert capsys.readouterr().out == "drpd 0.9.19\n"
    app_class.assert_not_called()


def test_no_arguments_runs_app() -> None:
    """The command starts the terminal app when given no options."""
    with patch("t76.drpd.__main__.DRPDApp") as app_class:
        main([])

    app_class.return_value.run.assert_called_once_with()
