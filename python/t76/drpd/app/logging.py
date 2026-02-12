"""
Copyright (c) 2025 MTA, Inc.

Sets up logging for the DRPD application.
"""

import logging

from textual.logging import TextualHandler

logging.basicConfig(
    level=logging.INFO,
    handlers=[TextualHandler()],
    format="%(asctime)s - %(filename)s - %(lineno)d - %(levelname)s - %(message)s"
)
