"""
USB-PD Message Types and Classes

This package contains all USB-PD message type definitions and their implementations.
Classes are organized per message type for better maintainability.
"""

from ._base import (
    Message,
    Origin,
    ExtendedMessage,
    StandardMessage
)
from .alert import AlertMessage
from .battery_status import BatteryStatusMessage
from .bist import BISTMessage
from .country_info import GetCountryInfoMessage
from .control import ControlMessage
from .enter_usb import EnterUSBMessage
from .epr_mode import EPRModeMessage
from .epr_request import EPRRequestMessage
from .generic_extended import GenericExtendedMessage
from .source_capabilities_extended import SourceCapabilitiesExtendedMessage
from .status import StatusMessage
from .get_battery_cap import GetBatteryCapabilitiesMessage
from .get_battery_status import GetBatteryStatusMessage
from .battery_capabilities import BatteryCapabilitiesMessage
from .get_manufacturer_info import GetManufacturerInfoMessage
from .manufacturer_info import ManufacturerInfoMessage
from .security_request import SecurityRequestMessage
from .security_response import SecurityResponseMessage
from .firmware_update_request import FirmwareUpdateRequestMessage
from .firmware_update_response import FirmwareUpdateResponseMessage
from .pps_status import PPSStatusMessage
from .country_info_extended import CountryInfoExtendedMessage
from .country_codes import CountryCodesMessage
from .sink_capabilities_extended import SinkCapabilitiesExtendedMessage
from .extended_control import ExtendedControlMessage
from .epr_source_capabilities import EPRSourceCapabilitiesMessage
from .epr_sink_capabilities import EPRSinkCapabilitiesMessage
from .vendor_defined_extended import VendorDefinedExtendedMessage
from .request import RequestMessage
from .revision import RevisionMessage
from .sink_capabilities import SinkCapabilitiesMessage
from .source_capabilities import SourceCapabilitiesMessage
from .source_information import SourceInformationMessage
from .unknown import UnknownMessage
from .vendor_defined import VendorDefinedMessage

# Register all message factories with the base Message class
Message.register_factory("extended", GenericExtendedMessage)
Message.register_factory("control", ControlMessage)
Message.register_factory("Source_Capabilities", SourceCapabilitiesMessage)
Message.register_factory("Request", RequestMessage)
Message.register_factory("BIST", BISTMessage)
Message.register_factory("Sink_Capabilities", SinkCapabilitiesMessage)
Message.register_factory("Battery_Status", BatteryStatusMessage)
Message.register_factory("Alert", AlertMessage)
Message.register_factory("Get_Country_Info", GetCountryInfoMessage)
Message.register_factory("Enter_USB", EnterUSBMessage)
Message.register_factory("EPR_Request", EPRRequestMessage)
Message.register_factory("EPR_Mode", EPRModeMessage)
Message.register_factory("Source_Info", SourceInformationMessage)
Message.register_factory("Revision", RevisionMessage)
Message.register_factory("Vendor_Defined", VendorDefinedMessage)
Message.register_factory("unknown", UnknownMessage)

# Extended message specific factories
Message.register_factory("Source_Capabilities_Extended",
                         SourceCapabilitiesExtendedMessage)
Message.register_factory("Status", StatusMessage)
Message.register_factory("Get_Battery_Cap", GetBatteryCapabilitiesMessage)
Message.register_factory("Get_Battery_Status", GetBatteryStatusMessage)
Message.register_factory("Battery_Capabilities", BatteryCapabilitiesMessage)
Message.register_factory("Get_Manufacturer_Info", GetManufacturerInfoMessage)
Message.register_factory("Manufacturer_Info", ManufacturerInfoMessage)
Message.register_factory("Security_Request", SecurityRequestMessage)
Message.register_factory("Security_Response", SecurityResponseMessage)
Message.register_factory("Firmware_Update_Request",
                         FirmwareUpdateRequestMessage)
Message.register_factory("Firmware_Update_Response",
                         FirmwareUpdateResponseMessage)
Message.register_factory("PPS_Status", PPSStatusMessage)
Message.register_factory("Country_Info", CountryInfoExtendedMessage)
Message.register_factory("Country_Codes", CountryCodesMessage)
Message.register_factory("Sink_Capabilities_Extended",
                         SinkCapabilitiesExtendedMessage)
Message.register_factory("Extended_Control", ExtendedControlMessage)
Message.register_factory("EPR_Source_Capabilities",
                         EPRSourceCapabilitiesMessage)
Message.register_factory("EPR_Sink_Capabilities",
                         EPRSinkCapabilitiesMessage)
Message.register_factory("Vendor_Defined_Extended",
                         VendorDefinedExtendedMessage)

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
    "SourceCapabilitiesExtendedMessage",
    "StatusMessage",
    "GetBatteryCapabilitiesMessage",
    "GetBatteryStatusMessage",
    "BatteryCapabilitiesMessage",
    "GetManufacturerInfoMessage",
    "ManufacturerInfoMessage",
    "SecurityRequestMessage",
    "SecurityResponseMessage",
    "FirmwareUpdateRequestMessage",
    "FirmwareUpdateResponseMessage",
    "PPSStatusMessage",
    "CountryInfoExtendedMessage",
    "CountryCodesMessage",
    "SinkCapabilitiesExtendedMessage",
    "ExtendedControlMessage",
    "EPRSourceCapabilitiesMessage",
    "EPRSinkCapabilitiesMessage",
    "VendorDefinedExtendedMessage",
    "RequestMessage",
    "RevisionMessage",
    "SinkCapabilitiesMessage",
    "SourceCapabilitiesMessage",
    "SourceInformationMessage",
    "UnknownMessage",
    "VendorDefinedMessage",
]
