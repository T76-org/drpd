"""
Copyright (c) 2025 MTA, Inc.

Data Objects module for USB Power Delivery message processing.
Provides access to various Data Object classes for BIST, Power, Request, Alert, and Vendor messages.
"""

# Alert Data Objects
from .alert import (
    AlertDataObject,
    ExtendedADO,
    ExtendedAlertType,
    FixedSupplyExtendedADO,
    BatteryStatusExtendedADO,
    ManufacturerInfoExtendedADO,
)

# BIST Data Objects
from .bist import (
    BistDataObject,
    BistCarrierMode,
    BistTestData,
    BistSharedTestModeEntry,
    BistSharedTestModeExit,
    BistReservedOrUnknown,
)

# Power Data Objects (Source and Sink)
from .power import (
    BatterySupplyPDO,
    EPRAvsApdo,
    FixedSupplyPDO,
    SourcePDO,
    SPRAvsApdo,
    SPRPpsApdo,
    UnknownApdo,
    VariableSupplyPDO,
)
from .sink import (
    BatterySinkPDO,
    EprAvsSinkApdo,
    FixedSinkPDO,
    SinkPDO,
    SprPpsSinkApdo,
    UnknownSinkApdo,
    VariableSinkPDO,
)

# Request Data Objects
from .request import (
    RequestDO,
    FixedVariableRDO,
    BatteryRDO,
    PpsRDO,
    AvsSprRDO,
    AvsEprRDO,
)

# Vendor Data Objects (VDOs)
from .vendor import (
    # Base and Generic VDOs
    VDO,
    UvdmHeaderVDO,
    SvdmHeaderVDO,
    GenericPayloadVDO,
    UnknownVDO,

    # Identity VDOs
    IdHeaderVDO,
    CertStatVDO,
    ProductVDO,

    # Product Type VDOs
    ProductTypeUfpVDO,
    ProductTypeDfpVDO,
    PassiveCableVDO,
    ActiveCableVDO1,
    ActiveCableVDO2,
    ActiveCableVDO3,
    AmaVDO,
    VpdVDO,

    # Discovery and Mode VDOs
    SvidsVDO,
    ModesVDO,
    EnterModePayloadVDO,
    ExitModePayloadVDO,
    AttentionVDO,
)

# Define what's available to importers of this package
__all__ = [
    # Alert Data Objects
    'AlertDataObject',
    'ExtendedADO',
    'ExtendedAlertType',
    'FixedSupplyExtendedADO',
    'BatteryStatusExtendedADO',
    'ManufacturerInfoExtendedADO',

    # BIST Data Objects
    'BistDataObject',
    'BistCarrierMode',
    'BistTestData',
    'BistSharedTestModeEntry',
    'BistSharedTestModeExit',
    'BistReservedOrUnknown',

    # Power Data Objects - Source
    'BatterySupplyPDO',
    'EPRAvsApdo',
    'FixedSupplyPDO',
    'SourcePDO',
    'SPRAvsApdo',
    'SPRPpsApdo',
    'UnknownApdo',
    'VariableSupplyPDO',

    # Power Data Objects - Sink
    'BatterySinkPDO',
    'EprAvsSinkApdo',
    'FixedSinkPDO',
    'SinkPDO',
    'SprPpsSinkApdo',
    'UnknownSinkApdo',
    'VariableSinkPDO',

    # Request Data Objects
    'RequestDO',
    'FixedVariableRDO',
    'BatteryRDO',
    'PpsRDO',
    'AvsSprRDO',
    'AvsEprRDO',

    # Vendor Data Objects - Base and Generic
    'VDO',
    'UvdmHeaderVDO',
    'SvdmHeaderVDO',
    'GenericPayloadVDO',
    'UnknownVDO',

    # Vendor Data Objects - Identity
    'IdHeaderVDO',
    'CertStatVDO',
    'ProductVDO',

    # Vendor Data Objects - Product Types
    'ProductTypeUfpVDO',
    'ProductTypeDfpVDO',
    'PassiveCableVDO',
    'ActiveCableVDO1',
    'ActiveCableVDO2',
    'ActiveCableVDO3',
    'AmaVDO',
    'VpdVDO',

    # Vendor Data Objects - Discovery and Modes
    'SvidsVDO',
    'ModesVDO',
    'EnterModePayloadVDO',
    'ExitModePayloadVDO',
    'AttentionVDO',
]
