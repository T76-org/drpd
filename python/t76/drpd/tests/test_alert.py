import unittest

from t76.drpd.message import AlertMessage
from t76.drpd.message.data_objects.alert import (
    AlertDataObject,
    BatteryStatusExtendedADO,
    ManufacturerInfoExtendedADO,
    ExtendedAlertType,
)


class TestAlertMessage(unittest.TestCase):
    def test_alert_standard_no_extended(self):
        """
        Alert is a standard data message. With no Extended Alert Event,
        body should contain only a single ADO and no additional words.
        """
        # ADO with OCP event (bit 2) set, no extended alert (bit 8 cleared)
        ado = AlertDataObject(0x00000004)
        encoded = AlertMessage.encode(ado)

        # Parse back
        msg = AlertMessage(list(encoded))
        parsed_ado = msg.alert_data_object

        self.assertTrue(parsed_ado.ocp_event)
        self.assertFalse(parsed_ado.extended_alert_event)
        self.assertEqual(msg.extended_alert_data, [])

    def test_alert_with_additional_words(self):
        """
        When Extended Alert Event is set, additional 32-bit words follow the ADO
        in the same standard message body. Ensure they parse as ExtendedADOs.
        """
        # ADO with OTP (bit 3) and Extended Alert Event (bit 8)
        ado = AlertDataObject(0x00000088)

        # Create two extended alert words:
        # BatteryStatus (type=1) with battery_index=5
        bse_raw = (ExtendedAlertType.BATTERY_STATUS << 16) | 0x00000005
        bse = BatteryStatusExtendedADO(bse_raw)

        # ManufacturerInfo (type=2) with manufacturer info 0x1234
        mie_raw = (ExtendedAlertType.MANUFACTURER_INFO << 16) | 0x00001234
        mie = ManufacturerInfoExtendedADO(mie_raw)

        encoded = AlertMessage.encode(ado, [bse, mie])

        # Parse back
        msg = AlertMessage(list(encoded))
        parsed_ado = msg.alert_data_object
        extras = msg.extended_alert_data

        self.assertTrue(parsed_ado.otp_event)
        self.assertTrue(parsed_ado.extended_alert_event)
        self.assertEqual(len(extras), 2)

        # Validate types and fields
        self.assertIsInstance(extras[0], BatteryStatusExtendedADO)
        self.assertEqual(extras[0].type, ExtendedAlertType.BATTERY_STATUS)

        self.assertIsInstance(extras[1], ManufacturerInfoExtendedADO)
        self.assertEqual(extras[1].type, ExtendedAlertType.MANUFACTURER_INFO)


if __name__ == '__main__':
    unittest.main()
