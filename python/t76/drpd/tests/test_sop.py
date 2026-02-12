import unittest
from t76.drpd.message.sop import SOP, SOPType
from t76.drpd.message.codes import (
    KCODE_SYNC_1, KCODE_SYNC_2, KCODE_SYNC_3,
    KCODE_RST_1, KCODE_RST_2
)


class TestSOP(unittest.TestCase):
    def test_valid_sop(self):
        """
        Test the standard SOP pattern with all k-codes matching.
        This is critical because SOP is the most common message type in USB-PD
        communication and must be correctly identified for proper device interaction.
        """
        sop = SOP.from_kcodes(
            [KCODE_SYNC_1, KCODE_SYNC_1, KCODE_SYNC_1, KCODE_SYNC_2])
        self.assertEqual(sop.sop_type, SOPType.SOP)
        self.assertTrue(sop.is_valid)
        self.assertEqual(sop.matched_kcodes, 4)

    def test_sop_prime(self):
        """
        Test SOP' pattern detection.
        SOP' is used for communication with cable plugs, making it essential
        for proper cable capability discovery and configuration.
        """
        sop = SOP.from_kcodes(
            [KCODE_SYNC_1, KCODE_SYNC_1, KCODE_SYNC_3, KCODE_SYNC_3])
        self.assertEqual(sop.sop_type, SOPType.SOP_PRIME)
        self.assertTrue(sop.is_valid)

    def test_sop_double_prime(self):
        """
        Test SOP'' pattern detection.
        SOP'' is used for communication with the far-end cable plug,
        necessary for complete cable information gathering in USB-PD.
        """
        sop = SOP.from_kcodes(
            [KCODE_SYNC_1, KCODE_SYNC_3, KCODE_SYNC_1, KCODE_SYNC_3])
        self.assertEqual(sop.sop_type, SOPType.SOP_DOUBLE_PRIME)
        self.assertTrue(sop.is_valid)

    def test_hard_reset(self):
        """
        Test Hard Reset pattern detection.
        Hard Reset is a critical USB-PD message that forces devices back to default
        state, essential for error recovery and power negotiation restart.
        """
        sop = SOP.from_kcodes(
            [KCODE_RST_1, KCODE_RST_1, KCODE_RST_1, KCODE_RST_2])
        self.assertEqual(sop.sop_type, SOPType.HARD_RESET)
        self.assertTrue(sop.is_valid)

    def test_cable_reset(self):
        """
        Test Cable Reset pattern detection.
        Cable Reset is used to reset only the cable without affecting the devices,
        important for cable-specific problem resolution.
        """
        sop = SOP.from_kcodes(
            [KCODE_RST_1, KCODE_SYNC_1, KCODE_RST_1, KCODE_SYNC_3])
        self.assertEqual(sop.sop_type, SOPType.CABLE_RESET)
        self.assertTrue(sop.is_valid)

    def test_debug_sops(self):
        """
        Test debug SOP patterns (SOP' Debug and SOP'' Debug).
        Debug SOPs are used for specialized debugging and testing scenarios,
        essential for development and troubleshooting of USB-PD implementations.
        """
        sop = SOP.from_kcodes(
            [KCODE_SYNC_1, KCODE_RST_2, KCODE_RST_2, KCODE_SYNC_3])
        self.assertEqual(sop.sop_type, SOPType.SOP_PRIME_DEBUG)
        self.assertTrue(sop.is_valid)

        sop = SOP.from_kcodes(
            [KCODE_SYNC_1, KCODE_RST_2, KCODE_SYNC_3, KCODE_SYNC_2])
        self.assertEqual(sop.sop_type, SOPType.SOP_DOUBLE_PRIME_DEBUG)
        self.assertTrue(sop.is_valid)

    def test_invalid_sop(self):
        """
        Test completely invalid k-code combinations.
        This ensures that malformed or corrupted messages are properly rejected,
        preventing potential misinterpretation of USB-PD messages.
        """
        sop = SOP.from_kcodes([0x00, 0x00, 0x00, 0x00])
        self.assertEqual(sop.sop_type, SOPType.INVALID)
        self.assertFalse(sop.is_valid)
        self.assertEqual(sop.matched_kcodes, 0)

    def test_partial_match(self):
        """
        Test handling of partial matches with less than 3 matching k-codes.
        This verifies that the system properly rejects messages that don't meet
        the minimum match threshold, preventing false positives.
        """
        sop = SOP.from_kcodes([KCODE_SYNC_1, KCODE_SYNC_1, 0x00, 0x00])
        self.assertEqual(sop.sop_type, SOPType.INVALID)
        self.assertFalse(sop.is_valid)

    def test_three_matching_kcodes(self):
        """
        Test validation of SOPs with exactly 3 matching k-codes.
        USB-PD spec allows for one k-code mismatch, so this test ensures that
        messages with 3 out of 4 matching k-codes are properly accepted and typed.
        Tests both trailing and middle position mismatches.
        """
        sop = SOP.from_kcodes([KCODE_SYNC_1, KCODE_SYNC_1, KCODE_SYNC_1, 0x00])
        self.assertEqual(sop.sop_type, SOPType.SOP)
        self.assertTrue(sop.is_valid)
        self.assertEqual(sop.matched_kcodes, 3)

        sop = SOP.from_kcodes([KCODE_SYNC_1, 0x00, KCODE_SYNC_1, KCODE_SYNC_2])
        self.assertEqual(sop.sop_type, SOPType.SOP)
        self.assertTrue(sop.is_valid)
        self.assertEqual(sop.matched_kcodes, 3)

    def test_string_representation(self):
        """
        Test the string representation of SOP objects.
        Proper string representation is important for debugging, logging,
        and development purposes, ensuring that SOP objects can be easily
        inspected and their state understood.
        """
        sop = SOP.from_kcodes(
            [KCODE_SYNC_1, KCODE_SYNC_1, KCODE_SYNC_1, KCODE_SYNC_2])
        result = str(sop)
        self.assertIn("SOP", result)
        self.assertIn(str(KCODE_SYNC_1), result)


if __name__ == '__main__':
    unittest.main()
