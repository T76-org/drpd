"""Vendor Defined Extended (PD 3.x)."""

from typing import Dict

from ._base import ExtendedMessage


class VendorDefinedExtendedMessage(ExtendedMessage):
    """Message wrapper for Vendor_Defined_Extended payloads."""

    @property
    def name(self) -> str:
        return "Vendor_Defined_Extended"

    @property
    def renderable_properties(self) -> Dict[str, str]:
        props = super().renderable_properties
        props.update(self.renderable_extended)
        return props
