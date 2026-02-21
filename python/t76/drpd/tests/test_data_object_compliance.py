"""Compliance tests for USB-PD data object classes."""

import unittest

from t76.drpd.message.data_objects import (
    ActiveCableVDO1,
    ActiveCableVDO2,
    ActiveCableVDO3,
    AlertDataObject,
    AmaVDO,
    AttentionVDO,
    AvsEprRDO,
    AvsSprRDO,
    BatteryRDO,
    BatterySinkPDO,
    BatteryStatusExtendedADO,
    BatterySupplyPDO,
    BistCarrierMode,
    BistDataObject,
    BistReservedOrUnknown,
    BistSharedTestModeEntry,
    BistSharedTestModeExit,
    BistTestData,
    CertStatVDO,
    EPRAvsApdo,
    EprAvsSinkApdo,
    EnterModePayloadVDO,
    ExitModePayloadVDO,
    ExtendedADO,
    ExtendedAlertType,
    FixedSinkPDO,
    FixedSupplyExtendedADO,
    FixedSupplyPDO,
    FixedVariableRDO,
    GenericPayloadVDO,
    IdHeaderVDO,
    ManufacturerInfoExtendedADO,
    ModesVDO,
    PassiveCableVDO,
    PpsRDO,
    ProductTypeDfpVDO,
    ProductTypeUfpVDO,
    ProductVDO,
    RequestDO,
    SPRAvsApdo,
    SPRPpsApdo,
    SinkPDO,
    SourcePDO,
    SprPpsSinkApdo,
    SvidsVDO,
    SvdmHeaderVDO,
    UnknownApdo,
    UnknownSinkApdo,
    UnknownVDO,
    UvdmHeaderVDO,
    VariableSinkPDO,
    VariableSupplyPDO,
    VDO,
    VpdVDO,
)


class TestDataObjectCompliance(unittest.TestCase):
    """Exercise all primary data object class families."""

    def test_source_pdo_factory_coverage(self) -> None:
        self.assertIsInstance(SourcePDO.from_raw(0x00000000), FixedSupplyPDO)
        self.assertIsInstance(SourcePDO.from_raw(0x40000000), VariableSupplyPDO)
        self.assertIsInstance(SourcePDO.from_raw(0x80000000), BatterySupplyPDO)
        self.assertIsInstance(SourcePDO.from_raw(0xC0000000), SPRPpsApdo)
        self.assertIsInstance(SourcePDO.from_raw(0xD0000000), EPRAvsApdo)
        self.assertIsInstance(SourcePDO.from_raw(0xE0000000), SPRAvsApdo)
        self.assertIsInstance(SourcePDO.from_raw(0xF0000000), UnknownApdo)

    def test_sink_pdo_factory_coverage(self) -> None:
        self.assertIsInstance(SinkPDO.from_raw(0x00000000), FixedSinkPDO)
        self.assertIsInstance(SinkPDO.from_raw(0x40000000), VariableSinkPDO)
        self.assertIsInstance(SinkPDO.from_raw(0x80000000), BatterySinkPDO)
        self.assertIsInstance(SinkPDO.from_raw(0xC0000000), SprPpsSinkApdo)
        self.assertIsInstance(SinkPDO.from_raw(0xD0000000), EprAvsSinkApdo)
        self.assertIsInstance(SinkPDO.from_raw(0xF0000000), UnknownSinkApdo)

    def test_bist_factory_coverage(self) -> None:
        self.assertIsInstance(BistDataObject.from_raw(0x50000000),
                              BistCarrierMode)
        self.assertIsInstance(BistDataObject.from_raw(0x80000000),
                              BistTestData)
        self.assertIsInstance(BistDataObject.from_raw(0x90000000),
                              BistSharedTestModeEntry)
        self.assertIsInstance(BistDataObject.from_raw(0xA0000000),
                              BistSharedTestModeExit)
        self.assertIsInstance(BistDataObject.from_raw(0x00000000),
                              BistReservedOrUnknown)

    def test_extended_alert_factory_coverage(self) -> None:
        self.assertIsInstance(ExtendedADO.from_raw(0x00000000),
                              FixedSupplyExtendedADO)
        self.assertIsInstance(ExtendedADO.from_raw(0x00010000),
                              BatteryStatusExtendedADO)
        self.assertIsInstance(ExtendedADO.from_raw(0x00020000),
                              ManufacturerInfoExtendedADO)
        self.assertIsInstance(ExtendedADO.from_raw(0x00FF0000), ExtendedADO)

    def test_request_factory_paths(self) -> None:
        self.assertIsInstance(RequestDO.guess_from_raw(0x10000000),
                              FixedVariableRDO)
        self.assertIsInstance(RequestDO.guess_from_raw(0x10020001), PpsRDO)

        self.assertIsInstance(
            RequestDO.from_raw_and_pdo(0x10000000, FixedSupplyPDO(0x0)),
            FixedVariableRDO,
        )
        self.assertIsInstance(
            RequestDO.from_raw_and_pdo(0x10000000, VariableSupplyPDO(0x0)),
            FixedVariableRDO,
        )
        self.assertIsInstance(
            RequestDO.from_raw_and_pdo(0x10000000, BatterySupplyPDO(0x0)),
            BatteryRDO,
        )
        self.assertIsInstance(
            RequestDO.from_raw_and_pdo(0x10000000, SPRPpsApdo(0xC0000000)),
            PpsRDO,
        )
        self.assertIsInstance(
            RequestDO.from_raw_and_pdo(0x10000000, SPRAvsApdo(0xE0000000)),
            AvsSprRDO,
        )
        self.assertIsInstance(
            RequestDO.from_raw_and_pdo(0x10000000, EPRAvsApdo(0xD0000000)),
            AvsEprRDO,
        )

    def test_request_rdo_voltage_scaling(self) -> None:
        # Output voltage field = 1000 units in bits [20:9].
        raw = 0x10000000 | (1000 << 9)
        pps = PpsRDO(raw)
        spr_avs = AvsSprRDO(raw)
        epr_avs = AvsEprRDO(raw)

        self.assertAlmostEqual(pps.target_voltage, 20.0)
        self.assertAlmostEqual(spr_avs.target_voltage, 25.0)
        self.assertAlmostEqual(epr_avs.target_voltage, 25.0)

    def test_encode_and_to_dict_basics(self) -> None:
        source = SourcePDO.from_raw(0x12345678)
        sink = SinkPDO.from_raw(0x12345678)
        rdo = RequestDO.guess_from_raw(0x12345678)
        ado = AlertDataObject(0x12345678)
        bdo = BistDataObject.from_raw(0x12345678)

        self.assertEqual(len(source.encode()), 4)
        self.assertEqual(len(sink.encode()), 4)
        self.assertEqual(len(rdo.encode()), 4)
        self.assertEqual(len(ado.encode()), 4)
        self.assertEqual(len(bdo.encode()), 4)

        self.assertIsInstance(source.to_dict(), dict)
        self.assertIsInstance(sink.to_dict(), dict)
        self.assertIsInstance(rdo.to_dict(), dict)
        self.assertIsInstance(ado.to_dict(), dict)
        self.assertIsInstance(bdo.to_dict(), dict)

    def test_vendor_vdo_family_basics(self) -> None:
        vdo_classes = [
            VDO,
            UvdmHeaderVDO,
            SvdmHeaderVDO,
            GenericPayloadVDO,
            UnknownVDO,
            IdHeaderVDO,
            CertStatVDO,
            ProductVDO,
            ProductTypeUfpVDO,
            ProductTypeDfpVDO,
            PassiveCableVDO,
            ActiveCableVDO1,
            ActiveCableVDO2,
            ActiveCableVDO3,
            AmaVDO,
            VpdVDO,
            SvidsVDO,
            ModesVDO,
            ExitModePayloadVDO,
            EnterModePayloadVDO,
            AttentionVDO,
        ]
        for klass in vdo_classes:
            if klass in {GenericPayloadVDO, UnknownVDO}:
                obj = klass(0x12345678, 0)
            else:
                obj = klass(0x12345678)
            self.assertEqual(len(obj.encode()), 4)
            self.assertIsInstance(obj.to_dict(), dict)

    def test_extended_alert_enum_stability(self) -> None:
        self.assertEqual(ExtendedAlertType.FIXED_SUPPLY.value, 0)
        self.assertEqual(ExtendedAlertType.BATTERY_STATUS.value, 1)
        self.assertEqual(ExtendedAlertType.MANUFACTURER_INFO.value, 2)


if __name__ == "__main__":
    unittest.main()
