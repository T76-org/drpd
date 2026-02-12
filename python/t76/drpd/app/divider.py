"""
Copyright (c) 2025 MTA, Inc.
"""

from textual.widgets import Static


class Divider(Static):
    """A simple divider widget for use in panels."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.add_class("divider")
