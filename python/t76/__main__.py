#!/usr/bin/env python3
"""
Command-line interface for the t76 module.

This script runs when the module is executed with: python -m t76
"""

import argparse

from . import __apps__, __version__


def main():
    """Main entry point for the command-line interface."""
    parser = argparse.ArgumentParser(
        prog="t76",
        description="A simple Python module with greeting and calculator functionality"
    )

    parser.add_argument(
        "--version",
        action="version",
        version=f"t76 {__version__}"
    )

    parser.add_argument(
        "--apps",
        action="store_true",
        help="List available applications"
    )

    args = parser.parse_args()

    if args.apps:
        print("Available applications:")
        for app in __apps__:
            print(f" - {app['drpd']} (t76.drpd)")
        return


if __name__ == "__main__":
    main()
