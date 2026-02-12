"""Message factory compliance tests."""

import unittest

from t76.drpd.message.messages import (
    AlertMessage,
    BatteryCapabilitiesMessage,
    BatteryStatusMessage,
    BISTMessage,
    ControlMessage,
    CountryCodesMessage,
    CountryInfoExtendedMessage,
    EPRModeMessage,
    EPRRequestMessage,
    EPRSinkCapabilitiesMessage,
    EPRSourceCapabilitiesMessage,
    EnterUSBMessage,
    ExtendedControlMessage,
    FirmwareUpdateRequestMessage,
    FirmwareUpdateResponseMessage,
    GetBatteryCapabilitiesMessage,
    GetBatteryStatusMessage,
    GetCountryInfoMessage,
    GetManufacturerInfoMessage,
    ManufacturerInfoMessage,
    Message,
    PPSStatusMessage,
    RequestMessage,
    RevisionMessage,
    SecurityRequestMessage,
    SecurityResponseMessage,
    SinkCapabilitiesExtendedMessage,
    SinkCapabilitiesMessage,
    SourceCapabilitiesExtendedMessage,
    SourceCapabilitiesMessage,
    SourceInformationMessage,
    StatusMessage,
    VendorDefinedExtendedMessage,
    VendorDefinedMessage,
)
from t76.drpd.message.header import Header, MessageType
from t76.drpd.message.sop import SOP


def _default_sop() -> SOP:
    return SOP.from_kcodes([0x18, 0x18, 0x18, 0x11])


class TestMessageClassCompliance(unittest.TestCase):
    """Ensure each implemented type resolves to the intended class."""

    def test_control_messages_use_control_wrapper(self) -> None:
        control_types = [
            MessageType.GOOD_CRC,
            MessageType.ACCEPT,
            MessageType.REJECT,
            MessageType.GET_STATUS,
            MessageType.GET_SOURCE_INFO,
            MessageType.GET_REVISION,
        ]
        for msg_type in control_types:
            header = Header.from_fields(
                sop=_default_sop(),
                message_type=msg_type,
                data_object_count=0,
            )
            msg = Message.from_body(header, [])
            self.assertIsInstance(msg, ControlMessage)

    def test_standard_data_message_classes(self) -> None:
        standard_cases = [
            (MessageType.SOURCE_CAPABILITIES, SourceCapabilitiesMessage),
            (MessageType.REQUEST, RequestMessage),
            (MessageType.BIST, BISTMessage),
            (MessageType.SINK_CAPABILITIES, SinkCapabilitiesMessage),
            (MessageType.BATTERY_STATUS, BatteryStatusMessage),
            (MessageType.ALERT, AlertMessage),
            (MessageType.GET_COUNTRY_INFORMATION, GetCountryInfoMessage),
            (MessageType.ENTER_USB, EnterUSBMessage),
            (MessageType.EPR_REQUEST, EPRRequestMessage),
            (MessageType.EPR_MODE, EPRModeMessage),
            (MessageType.SOURCE_INFORMATION, SourceInformationMessage),
            (MessageType.REVISION, RevisionMessage),
            (MessageType.VENDOR_DEFINED, VendorDefinedMessage),
        ]
        for msg_type, expected_cls in standard_cases:
            header = Header.from_fields(
                sop=_default_sop(),
                message_type=msg_type,
                data_object_count=1,
            )
            msg = Message.from_body(header, [0x00, 0x00, 0x00, 0x00])
            self.assertIsInstance(msg, expected_cls)

    def test_extended_message_classes(self) -> None:
        extended_cases = [
            (MessageType.SOURCE_CAPABILITIES_EXTENDED,
             SourceCapabilitiesExtendedMessage, [0x00, 0x00]),
            (MessageType.STATUS, StatusMessage, [0x00, 0x00]),
            (MessageType.GET_BATTERY_CAP, GetBatteryCapabilitiesMessage,
             [0x01, 0x00, 0x01]),
            (MessageType.GET_BATTERY_STATUS, GetBatteryStatusMessage,
             [0x01, 0x00, 0x01]),
            (MessageType.BATTERY_CAPABILITIES, BatteryCapabilitiesMessage,
             [0x00, 0x00]),
            (MessageType.GET_MANUFACTURER_INFO, GetManufacturerInfoMessage,
             [0x02, 0x00, 0x01, 0x00]),
            (MessageType.MANUFACTURER_INFO, ManufacturerInfoMessage,
             [0x00, 0x00]),
            (MessageType.SECURITY_REQUEST, SecurityRequestMessage,
             [0x00, 0x00]),
            (MessageType.SECURITY_RESPONSE, SecurityResponseMessage,
             [0x00, 0x00]),
            (MessageType.FIRMWARE_UPDATE_REQUEST,
             FirmwareUpdateRequestMessage, [0x00, 0x00]),
            (MessageType.FIRMWARE_UPDATE_RESPONSE,
             FirmwareUpdateResponseMessage, [0x00, 0x00]),
            (MessageType.PPS_STATUS, PPSStatusMessage, [0x00, 0x00]),
            (MessageType.COUNTRY_INFO, CountryInfoExtendedMessage,
             [0x00, 0x00]),
            (MessageType.COUNTRY_CODES, CountryCodesMessage, [0x00, 0x00]),
            (MessageType.SINK_CAPABILITIES_EXTENDED,
             SinkCapabilitiesExtendedMessage, [0x00, 0x00]),
            (MessageType.EXTENDED_CONTROL, ExtendedControlMessage,
             [0x01, 0x00, 0x01]),
            (MessageType.EPR_SOURCE_CAPABILITIES,
             EPRSourceCapabilitiesMessage, [0x00, 0x00]),
            (MessageType.EPR_SINK_CAPABILITIES,
             EPRSinkCapabilitiesMessage, [0x00, 0x00]),
            (MessageType.VENDOR_DEFINED_EXTENDED,
             VendorDefinedExtendedMessage, [0x00, 0x00]),
        ]
        for msg_type, expected_cls, body in extended_cases:
            header = Header.from_fields(
                sop=_default_sop(),
                message_type=msg_type,
                data_object_count=1,
                extended=True,
            )
            msg = Message.from_body(header, body)
            self.assertIsInstance(msg, expected_cls)


if __name__ == "__main__":
    unittest.main()
