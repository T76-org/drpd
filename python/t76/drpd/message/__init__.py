"""
USB-PD Message Module

This module contains message type definitions and factory methods for USB-PD communication.
All message classes are re-exported from the messages subpackage for direct access.
"""

from .messages import (
    Message,
    Origin,
    ExtendedMessage,
    StandardMessage,
    ControlMessage,
    AlertMessage,
    BatteryStatusMessage,
    BISTMessage,
    GetCountryInfoMessage,
    EnterUSBMessage,
    EPRModeMessage,
    EPRRequestMessage,
    GenericExtendedMessage,
    RequestMessage,
    RevisionMessage,
    SinkCapabilitiesMessage,
    SourceCapabilitiesMessage,
    SourceInformationMessage,
    UnknownMessage,
    VendorDefinedMessage,
)

__all__ = [
    # Base classes
    "Message",
    "Origin",
    "ExtendedMessage",
    "StandardMessage",
    "ControlMessage",
    # Messages
    "AlertMessage",
    "BatteryStatusMessage",
    "BISTMessage",
    "GetCountryInfoMessage",
    "EnterUSBMessage",
    "EPRModeMessage",
    "EPRRequestMessage",
    "GenericExtendedMessage",
    "RequestMessage",
    "RevisionMessage",
    "SinkCapabilitiesMessage",
    "SourceCapabilitiesMessage",
    "SourceInformationMessage",
    "UnknownMessage",
    "VendorDefinedMessage",
]
