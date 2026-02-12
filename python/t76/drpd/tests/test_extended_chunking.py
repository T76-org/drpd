"""Extended header and chunking behavior tests."""

import unittest

from t76.drpd.message.header import ExtendedHeader
from t76.drpd.message.messages.extended_control import ExtendedControlMessage
from t76.drpd.message.messages.generic_extended import GenericExtendedMessage
from t76.drpd.message.header import MessageType


class TestExtendedChunking(unittest.TestCase):
    """Validate CH/RCH/CHNUM/Data Size behavior."""

    def test_extended_header_field_decode(self) -> None:
        raw = 0
        raw |= 0x015         # data size
        raw |= (0b10 << 9)   # reserved
        raw |= (0b011 << 11)  # chunk number
        raw |= (1 << 14)     # request chunk
        raw |= (1 << 15)     # chunked

        ext = ExtendedHeader(raw)
        self.assertEqual(ext.data_size_bytes, 0x15)
        self.assertEqual(ext.reserved_bits, 0b10)
        self.assertEqual(ext.chunk_number, 0b011)
        self.assertTrue(ext.request_chunk)
        self.assertTrue(ext.chunked)

    def test_payload_is_limited_by_data_size(self) -> None:
        # Extended header raw=0x0004 means 4 payload bytes are valid.
        body = [0x04, 0x00, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF]
        msg = GenericExtendedMessage(
            body,
            MessageType.SECURITY_REQUEST,
        )
        self.assertEqual(msg.payload_bytes, bytes([0xAA, 0xBB, 0xCC, 0xDD]))

    def test_chunked_extended_control_decode(self) -> None:
        # Data size=2, chunk_number=2, request_chunk=1, chunked=1.
        raw = 0
        raw |= 2
        raw |= (0b010 << 11)
        raw |= (1 << 14)
        raw |= (1 << 15)
        body = [raw & 0xFF, (raw >> 8) & 0xFF, 0x03, 0x00]

        msg = ExtendedControlMessage(body)
        self.assertEqual(msg.ecdb_type, 0x03)
        self.assertEqual(msg.ecdb_data, 0x00)
        self.assertEqual(msg.ecdb_type_name, "EPR_KeepAlive")
        self.assertEqual(msg.extended_header.chunk_number, 0b010)
        self.assertTrue(msg.extended_header.request_chunk)
        self.assertTrue(msg.extended_header.chunked)


if __name__ == "__main__":
    unittest.main()
