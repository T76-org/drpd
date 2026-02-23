"""USB-PD 3.2 message type mapping tests."""

import unittest

from t76.drpd.message.header import (
    Header,
    MessageType,
    PortDataRole,
    PortPowerRole,
    SpecificationRevision,
)
from t76.drpd.message.sop import SOP


def _default_sop() -> SOP:
    return SOP.from_kcodes([0x18, 0x18, 0x18, 0x11])


class TestMessageTypeMatrix(unittest.TestCase):
    """Validate header decode/encode mappings against the matrix."""

    def test_control_type_round_trip(self) -> None:
        control_cases = {
            0x01: MessageType.GOOD_CRC,
            0x02: MessageType.GOTO_MIN,
            0x03: MessageType.ACCEPT,
            0x04: MessageType.REJECT,
            0x05: MessageType.PING,
            0x06: MessageType.PS_RDY,
            0x07: MessageType.GET_SOURCE_CAP,
            0x08: MessageType.GET_SINK_CAP,
            0x09: MessageType.DR_SWAP,
            0x0A: MessageType.PR_SWAP,
            0x0B: MessageType.VCONN_SWAP,
            0x0C: MessageType.WAIT,
            0x0D: MessageType.SOFT_RESET,
            0x0E: MessageType.DATA_RESET,
            0x0F: MessageType.DATA_RESET_COMPLETE,
            0x10: MessageType.NOT_SUPPORTED,
            0x11: MessageType.GET_SOURCE_CAP_EXTENDED,
            0x12: MessageType.GET_STATUS,
            0x13: MessageType.FR_SWAP,
            0x14: MessageType.GET_PPS_STATUS,
            0x15: MessageType.GET_COUNTRY_CODES,
            0x16: MessageType.GET_SINK_CAP_EXTENDED,
            0x17: MessageType.GET_SOURCE_INFO,
            0x18: MessageType.GET_REVISION,
        }
        for value, expected_type in control_cases.items():
            decoded = MessageType.from_header(value, 0, extended=False)
            self.assertEqual(decoded, expected_type)
            header = Header.from_fields(
                sop=_default_sop(),
                message_type=expected_type,
                data_object_count=0,
                message_id=3,
                specification_revision=SpecificationRevision.REV3,
                port_power_role=PortPowerRole.SOURCE,
                port_data_role=PortDataRole.DFP,
            )
            self.assertEqual(header.message_type_number, value)
            self.assertEqual(header.message_type, expected_type)

    def test_data_type_round_trip(self) -> None:
        data_cases = {
            0x01: MessageType.SOURCE_CAPABILITIES,
            0x02: MessageType.REQUEST,
            0x03: MessageType.BIST,
            0x04: MessageType.SINK_CAPABILITIES,
            0x05: MessageType.BATTERY_STATUS,
            0x06: MessageType.ALERT,
            0x07: MessageType.GET_COUNTRY_INFORMATION,
            0x08: MessageType.ENTER_USB,
            0x09: MessageType.EPR_REQUEST,
            0x0A: MessageType.EPR_MODE,
            0x0B: MessageType.SOURCE_INFORMATION,
            0x0C: MessageType.REVISION,
            0x0F: MessageType.VENDOR_DEFINED,
        }
        for value, expected_type in data_cases.items():
            decoded = MessageType.from_header(value, 1, extended=False)
            self.assertEqual(decoded, expected_type)
            header = Header.from_fields(
                sop=_default_sop(),
                message_type=expected_type,
                data_object_count=1,
                message_id=4,
                specification_revision=SpecificationRevision.REV3,
                port_power_role=PortPowerRole.SOURCE,
                port_data_role=PortDataRole.DFP,
            )
            self.assertEqual(header.message_type_number, value)
            self.assertEqual(header.message_type, expected_type)

    def test_extended_type_round_trip(self) -> None:
        extended_cases = {
            0x01: MessageType.SOURCE_CAPABILITIES_EXTENDED,
            0x02: MessageType.STATUS,
            0x03: MessageType.GET_BATTERY_CAP,
            0x04: MessageType.GET_BATTERY_STATUS,
            0x05: MessageType.BATTERY_CAPABILITIES,
            0x06: MessageType.GET_MANUFACTURER_INFO,
            0x07: MessageType.MANUFACTURER_INFO,
            0x08: MessageType.SECURITY_REQUEST,
            0x09: MessageType.SECURITY_RESPONSE,
            0x0A: MessageType.FIRMWARE_UPDATE_REQUEST,
            0x0B: MessageType.FIRMWARE_UPDATE_RESPONSE,
            0x0C: MessageType.PPS_STATUS,
            0x0D: MessageType.COUNTRY_INFO,
            0x0E: MessageType.COUNTRY_CODES,
            0x0F: MessageType.SINK_CAPABILITIES_EXTENDED,
            0x10: MessageType.EXTENDED_CONTROL,
            0x11: MessageType.EPR_SOURCE_CAPABILITIES,
            0x12: MessageType.EPR_SINK_CAPABILITIES,
            0x13: MessageType.VENDOR_DEFINED_EXTENDED,
        }
        for value, expected_type in extended_cases.items():
            decoded = MessageType.from_header(value, 1, extended=True)
            self.assertEqual(decoded, expected_type)
            header = Header.from_fields(
                sop=_default_sop(),
                message_type=expected_type,
                data_object_count=1,
                message_id=5,
                specification_revision=SpecificationRevision.REV3,
                port_power_role=PortPowerRole.SOURCE,
                port_data_role=PortDataRole.DFP,
                extended=True,
            )
            self.assertEqual(header.message_type_number, value)
            self.assertTrue(header.extended)
            self.assertEqual(header.message_type, expected_type)


if __name__ == "__main__":
    unittest.main()
