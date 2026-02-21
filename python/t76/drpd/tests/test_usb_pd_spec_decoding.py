"""USB-PD 3.2 field-level decoding checks for audited gaps."""

import unittest

from t76.drpd.message.data_objects import (
    ActiveCableVDO1,
    ActiveCableVDO2,
    AvsEprRDO,
    IdHeaderVDO,
    PassiveCableVDO,
    ProductVDO,
    SvdmHeaderVDO,
)
from t76.drpd.message.header import Header, MessageType
from t76.drpd.message.messages import Message
from t76.drpd.message.messages.epr_request import EPRRequestMessage
from t76.drpd.message.messages.epr_mode import EPRModeMessage
from t76.drpd.message.messages.extended_control import ExtendedControlMessage
from t76.drpd.message.messages.battery_capabilities import (
    BatteryCapabilitiesMessage,
)
from t76.drpd.message.messages.epr_sink_capabilities import (
    EPRSinkCapabilitiesMessage,
)
from t76.drpd.message.messages.epr_source_capabilities import (
    EPRSourceCapabilitiesMessage,
)
from t76.drpd.message.messages.sink_capabilities_extended import (
    SinkCapabilitiesExtendedMessage,
)
from t76.drpd.message.messages.status import StatusMessage
from t76.drpd.message.messages.vendor_defined import VendorDefinedMessage
from t76.drpd.message.sop import SOP


class TestUsbPdSpecDecoding(unittest.TestCase):
    """Validate field extraction against USB-PD 3.2 tables."""

    @staticmethod
    def _default_sop() -> SOP:
        return SOP.from_kcodes([0x18, 0x18, 0x18, 0x11])

    def test_epr_mode_uses_table_6_50_fields(self) -> None:
        # Action=Enter Failed (0x04), Data=0x02, Reserved=0.
        msg = EPRModeMessage([0x00, 0x00, 0x02, 0x04])

        self.assertEqual(msg.action, 0x04)
        self.assertEqual(msg.data, 0x02)
        self.assertEqual(msg.reserved, 0x0000)
        self.assertEqual(msg.action_text, "Enter Failed")
        self.assertIn("VCONN Source", msg.data_text)

    def test_svdm_header_command_is_b4_to_b0(self) -> None:
        # Set B5=1 (reserved) and B4..0=0b00010 (Discover SVIDs).
        raw = (0xFF00 << 16) | (1 << 15) | (1 << 13) | (1 << 11)
        raw |= (1 << 6) | (1 << 5) | 0x02
        vdo = SvdmHeaderVDO(raw)

        self.assertEqual(vdo.command, 0x02)

    def test_id_header_vdo_uses_table_6_33_fields(self) -> None:
        # Cable path: SOP' Product Type=100b (Active Cable), Modal=1,
        # Connector Type=11b (Type-C Plug), VID=0x1234.
        raw = (0b100 << 27) | (1 << 26) | (0b11 << 21) | 0x1234
        vdo = IdHeaderVDO(raw)

        self.assertEqual(vdo.sop_prime_cable_vpd_product_type, 0b100)
        self.assertTrue(vdo.modal_operation_supported)
        self.assertEqual(vdo.connector_type, 0b11)
        self.assertEqual(vdo.usb_vendor_id, 0x1234)

    def test_product_vdo_pid_and_bcd_device_order(self) -> None:
        # Table 6.38: B31..16 PID, B15..0 bcdDevice.
        raw = (0xABCD << 16) | 0x1234
        vdo = ProductVDO(raw)

        self.assertEqual(vdo.pid, 0xABCD)
        self.assertEqual(vdo.bcd_device, 0x1234)

    def test_passive_cable_vdo_fields(self) -> None:
        # EPR capable, VCONN required, 50V, 5A, USB4 Gen4, latency 40-50ns.
        raw = (1 << 17) | (0b0101 << 13) | (0b01 << 11)
        raw |= (0b11 << 9) | (0b10 << 5) | 0b100
        vdo = PassiveCableVDO(raw)

        props = vdo.to_dict()
        self.assertEqual(props["EPR Capable"], "Yes")
        self.assertEqual(props["Maximum VBUS Voltage"], "50V")
        self.assertEqual(props["VBUS Current Handling"], "5A")
        self.assertIn("Gen 4", props["USB Highest Speed"])

    def test_active_cable_vdo1_and_vdo2_fields(self) -> None:
        raw_vdo1 = (1 << 17) | (0b0010 << 13) | (0b11 << 11)
        raw_vdo1 |= (0b11 << 9) | (1 << 8) | (1 << 7)
        raw_vdo1 |= (0b10 << 5) | (1 << 4) | (1 << 3) | 0b011

        vdo1 = ActiveCableVDO1(raw_vdo1).to_dict()
        self.assertEqual(vdo1["EPR Capable"], "Yes")
        self.assertEqual(vdo1["Cable Termination Type"], "Both ends active")
        self.assertEqual(vdo1["VBUS Through Cable"], "Yes")
        self.assertEqual(vdo1["SOP'' Controller Present"], "Yes")

        raw_vdo2 = (70 << 24) | (80 << 16) | (0b010 << 12)
        raw_vdo2 |= (1 << 3) | (1 << 0)
        vdo2 = ActiveCableVDO2(raw_vdo2).to_dict()

        self.assertEqual(vdo2["Max Operating Temp (C)"], 70)
        self.assertEqual(vdo2["Shutdown Temp (C)"], 80)
        self.assertEqual(vdo2["USB Lanes Supported"], "Two lanes")
        self.assertEqual(vdo2["USB Gen"], "Gen 2 or higher")

    def test_vendor_defined_discover_identity_parses_active_cable(self) -> None:
        # Structured VDM Header: Discover Identity ACK.
        header = (0xFF00 << 16) | (1 << 15) | (1 << 13) | (1 << 11)
        header |= (1 << 6) | 0x01

        id_header = (0b100 << 27) | (1 << 26) | 0x1234
        cert_stat = 0x01020304
        product = (0xABCD << 16) | 0x0102
        active_vdo1 = (1 << 17) | (0b11 << 11)
        active_vdo2 = (70 << 24) | (80 << 16)

        words = [header, id_header, cert_stat, product, active_vdo1,
                 active_vdo2]

        body = []
        for word in words:
            body.extend(word.to_bytes(4, "little"))

        msg = VendorDefinedMessage(body)
        names = [type(v).__name__ for v in msg.payload_vdos]

        self.assertIn("ActiveCableVDO1", names)
        self.assertIn("ActiveCableVDO2", names)

    def test_status_message_decodes_sop_sdb(self) -> None:
        # 7-byte SOP SDB payload.
        payload = [
            35,         # Internal Temp
            0b00011110,  # Present Input: ext+AC+battery+non-battery
            0x21,       # Present Battery Input
            0b00011110,  # Event flags OCP/OTP/OVP/CL
            0b00000100,  # Temperature status: warning
            0b00111110,  # Power status reasons
            0b00010010,  # New power state=2, indicator=2 (blinking)
        ]
        msg = StatusMessage([0x07, 0x00] + payload)
        props = msg.renderable_properties

        self.assertEqual(props["SDB Type"], "SOP")
        self.assertEqual(props["Internal Temp"], "35C")
        self.assertEqual(props["Present Input External"], "Yes")
        self.assertEqual(props["Present Input External Type"], "AC")
        self.assertEqual(props["Event OCP"], "Yes")
        self.assertEqual(props["Temperature Status"], "Warning")

    def test_status_message_decodes_cable_spdb(self) -> None:
        # 2-byte SOP'/SOP'' SDB payload.
        msg = StatusMessage([0x02, 0x00, 60, 0x01])
        props = msg.renderable_properties
        self.assertEqual(props["SDB Type"], "SOP'/SOP''")
        self.assertEqual(props["Internal Temp"], "60C")
        self.assertEqual(props["Thermal Shutdown"], "Yes")

    def test_battery_capabilities_decodes_bcdb(self) -> None:
        # Data size=9, VID, PID, design cap=200.0Wh, full cap=190.0Wh.
        payload = [0x34, 0x12, 0x78, 0x56, 0xD0, 0x07, 0x6C, 0x07, 0x00]
        msg = BatteryCapabilitiesMessage([0x09, 0x00] + payload)
        props = msg.renderable_properties

        self.assertEqual(props["VID"], "0x1234")
        self.assertEqual(props["PID"], "0x5678")
        self.assertEqual(props["Battery Design Capacity"], "200.0Wh")
        self.assertEqual(props["Last Full Charge Capacity"], "190.0Wh")
        self.assertEqual(props["Invalid Battery Reference"], "No")

    def test_sink_capabilities_extended_decodes_skedb(self) -> None:
        payload = [0x34, 0x12, 0x78, 0x56]  # VID, PID
        payload += [0x44, 0x33, 0x22, 0x11]  # XID
        payload += [2, 3, 1, 0b00000001]  # FW, HW, ver, load step
        payload += [0x61, 0x85]  # sink load chars
        payload += [0b00000111, 3, 0x21, 0b00101111]  # compliance+touch+
        payload += [45, 60, 100, 80, 120, 140]  # PDP bytes
        msg = SinkCapabilitiesExtendedMessage([0x18, 0x00] + payload)
        props = msg.renderable_properties

        self.assertEqual(props["VID"], "0x1234")
        self.assertEqual(props["PID"], "0x5678")
        self.assertEqual(props["SKEDB Version"], "1")
        self.assertEqual(props["Load Step Slew Rate"], "500 mA/us")
        self.assertEqual(props["Requires LPS Source"], "Yes")
        self.assertEqual(props["PPS Charging Supported"], "Yes")
        self.assertEqual(props["AVS Supported"], "Yes")
        self.assertEqual(props["SPR SINK OPERATIONAL PDP W"], "60W")

    def test_epr_capabilities_decode_pdo_lists(self) -> None:
        # One fixed PDO (5V @ 3A) for each message for smoke coverage.
        fixed_source_pdo = 0x0001912C
        fixed_sink_pdo = 0x0001912C

        src = EPRSourceCapabilitiesMessage(
            [0x04, 0x00] + list(fixed_source_pdo.to_bytes(4, "little"))
        )
        snk = EPRSinkCapabilitiesMessage(
            [0x04, 0x00] + list(fixed_sink_pdo.to_bytes(4, "little"))
        )
        self.assertEqual(src.renderable_properties["PDO Count"], "1")
        self.assertEqual(snk.renderable_properties["PDO Count"], "1")

    def test_epr_request_uses_rdo_decode(self) -> None:
        # Build an EPR AVS request and include requested PDO copy (DO2).
        # RDO: ObjPos=9, OutputVoltage=2000 units, OperatingCurrent=20 units.
        # AVS voltage units are 25mV -> 50.00V decoded value.
        raw_rdo = (9 << 28) | (1 << 22) | (2000 << 9) | 20
        raw_pdo_copy = 0xD0000000  # APDO type = EPR AVS
        msg = EPRRequestMessage(
            list(raw_rdo.to_bytes(4, "little")) +
            list(raw_pdo_copy.to_bytes(4, "little"))
        )
        props = msg.renderable_properties

        self.assertEqual(msg.raw_rdo, raw_rdo)
        self.assertEqual(msg.raw_requested_pdo_copy, raw_pdo_copy)
        self.assertIsInstance(msg.rdo, AvsEprRDO)
        self.assertIn("RDO", props)
        self.assertIn("Object Position", props["RDO"])
        self.assertIn("Augmented Power Data Object Kind", props["RDO"])
        self.assertIn("EPR AVS", props["RDO"])

    def test_chunked_epr_source_capabilities_reassembly(self) -> None:
        header = Header.from_fields(
            sop=self._default_sop(),
            message_type=MessageType.EPR_SOURCE_CAPABILITIES,
            data_object_count=1,
            extended=True,
        )

        pdo1 = 0x0001912C
        pdo2 = 0x0002D12C
        full_payload = list(pdo1.to_bytes(4, "little")) + list(
            pdo2.to_bytes(4, "little")
        )

        # Chunk 0: size=8 bytes, CH=1, CHNUM=0
        ext0 = 0
        ext0 |= 8
        ext0 |= (1 << 15)
        body0 = [ext0 & 0xFF, (ext0 >> 8) & 0xFF] + full_payload[:4]

        # Chunk 1: size=8 bytes, CH=1, CHNUM=1
        ext1 = 0
        ext1 |= 8
        ext1 |= (1 << 11)
        ext1 |= (1 << 15)
        body1 = [ext1 & 0xFF, (ext1 >> 8) & 0xFF] + full_payload[4:]

        first = Message.from_body(header, body0)
        self.assertEqual(first.name, "EPR_Source_Capabilities")
        self.assertEqual(first.renderable_properties["PDO Count"], "0")

        second = Message.from_body(header, body1)
        self.assertEqual(second.name, "EPR_Source_Capabilities")
        self.assertEqual(second.renderable_properties["PDO Count"], "2")

    def test_extended_control_ecdb_two_byte_decode(self) -> None:
        # Extended Header data size=2, payload type=EPR_Get_Source_Cap, data=0.
        msg = ExtendedControlMessage([0x02, 0x00, 0x01, 0x00])
        props = msg.renderable_properties

        self.assertEqual(msg.ecdb_type, 0x01)
        self.assertEqual(msg.ecdb_data, 0x00)
        self.assertEqual(msg.ecdb_type_name, "EPR_Get_Source_Cap")
        self.assertEqual(props["ECDB Size Valid"], "Yes")
        self.assertEqual(props["ECDB Data Valid"], "Yes")

    def test_extended_control_known_type_rejects_nonzero_data(self) -> None:
        # Known type (0x03) with non-zero data should be flagged invalid.
        msg = ExtendedControlMessage([0x02, 0x00, 0x03, 0x7F])
        props = msg.renderable_properties
        self.assertEqual(msg.ecdb_type_name, "EPR_KeepAlive")
        self.assertEqual(msg.ecdb_data, 0x7F)
        self.assertFalse(msg.ecdb_data_valid)
        self.assertEqual(props["ECDB Data Valid"], "No")

    def test_extended_control_rejects_truncated_ecdb(self) -> None:
        # Data Size=2, but only one ECDB byte present.
        msg = ExtendedControlMessage([0x02, 0x00, 0x01])
        props = msg.renderable_properties
        self.assertFalse(msg.ecdb_size_valid)
        self.assertEqual(msg.ecdb_type_name, "Unavailable")
        self.assertEqual(props["ECDB Size Valid"], "No")
        self.assertEqual(props["ECDB Data Valid"], "No")


if __name__ == "__main__":
    unittest.main()
    @staticmethod
    def _default_sop() -> SOP:
        return SOP.from_kcodes([0x18, 0x18, 0x18, 0x11])
