"""Renderable output quality checks."""

import unittest

from t76.drpd.message.header import ExtendedHeader
from t76.drpd.message.messages.extended_control import ExtendedControlMessage
from t76.drpd.message.messages.request import RequestMessage


class TestRenderableFields(unittest.TestCase):
    """Ensure renderable fields are concise and professional."""

    def test_extended_header_has_no_meaning_fields(self) -> None:
        header = ExtendedHeader(0x0001)
        data = header.to_dict()
        for key in data:
            self.assertNotIn("Meaning", key)

    def test_request_message_uses_neutral_rdo_label(self) -> None:
        # A minimal Request body with object position set to 1.
        msg = RequestMessage([0x00, 0x00, 0x00, 0x10])
        props = msg.renderable_properties
        self.assertIn("RDO", props)
        self.assertNotIn("RDO (guessed)", props)

    def test_extended_renderable_has_no_guess_language(self) -> None:
        msg = ExtendedControlMessage([0x01, 0x00, 0x03])
        props = msg.renderable_properties
        bad_terms = ("guess", "guessed", "best-effort", "spec section")
        for key, value in props.items():
            key_lower = key.lower()
            value_lower = str(value).lower()
            for term in bad_terms:
                self.assertNotIn(term, key_lower)
                self.assertNotIn(term, value_lower)


if __name__ == "__main__":
    unittest.main()

