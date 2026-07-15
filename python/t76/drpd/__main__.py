"""
Copyright (c) 2025 MTA, Inc.
"""

import argparse
from collections.abc import Sequence

from t76 import __version__

from .app import DRPDApp


def main(argv: Sequence[str] | None = None) -> None:
    """Run the Dr. PD terminal application."""
    parser = argparse.ArgumentParser(
        prog="drpd",
        description="Terminal application for Dr. PD devices",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"drpd {__version__}",
    )
    parser.parse_args(argv)

    app = DRPDApp()
    app.run()


if __name__ == "__main__":
    main()
