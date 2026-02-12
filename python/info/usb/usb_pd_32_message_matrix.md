# USB-PD 3.2 Message Matrix

This matrix is the Step 1 canonical inventory for message coverage.
It is derived from the local specification file:
`info/usb/USB-PD 3.2 spec.pdf`.

## Scope and Evidence

Primary spec anchors used for this matrix:

- `6.2.1.1 Message Header`
- `6.2.1.1.8 Message Type`
- `6.2.1.2 Extended Message Header`
- `6.3 Control Message`
- `6.4 Data Message`
- `6.5 Extended Message`
- `Table 65 Control Message Types`
- `Table 66 Data Message Types`
- `Table 615 Extended Message Types`
- `Table 668 Extended Control Message Types`

The repository environment now has Poppler available (`pdftotext`,
`pdfinfo`), and table/section extraction was verified directly from
`info/usb/USB-PD 3.2 spec.pdf`.
All rows below are ready for step-by-step code compliance audit.

## Header Field Definitions

### Standard Message Header (16 bits)

Spec reference: `6.2.1.1 Message Header`

- `bit 15`: `Extended`
- `bits 14..12`: `Number of Data Objects`
- `bits 11..9`: `MessageID`
- `bit 8`: `Port Power Role` (SOP) / `Cable Plug` (SOP'/SOP'')
- `bits 7..6`: `Specification Revision`
- `bit 5`: `Port Data Role` (SOP)
- `bits 4..0`: `Message Type`

### Extended Message Header (16 bits in first 2 body bytes)

Spec reference: `6.2.1.2 Extended Message Header`

- `bits 8..0`: `Data Size`
- `bits 10..9`: `Reserved`
- `bits 13..11`: `Chunk Number`
- `bit 14`: `Request Chunk`
- `bit 15`: `Chunked`

Chunking references:

- `6.2.1.2.1 Chunked`
- `6.2.1.2.2 Chunk Number`
- `6.2.1.2.3 Request Chunk`
- `6.2.1.2.4 Data Size`
- `6.2.1.2.5.2 Security_Request/Security_Response Chunked Example`

## Control Message Types (Message Type when NDO=0)

Spec references: `6.3.x`, `Table 65`.

| Type (bin) | Type (hex) | Message | Spec section | Payload fields |
|---|---:|---|---|---|
| 00001 | 0x01 | GoodCRC | 6.3.1 | None |
| 00010 | 0x02 | GotoMin (Deprecated) | 6.3.2 | None |
| 00011 | 0x03 | Accept | 6.3.3 | None |
| 00100 | 0x04 | Reject | 6.3.4 | None |
| 00101 | 0x05 | Ping | 6.3.5 | None |
| 00110 | 0x06 | PS_RDY | 6.3.6 | None |
| 00111 | 0x07 | Get_Source_Cap | 6.3.7 | None |
| 01000 | 0x08 | Get_Sink_Cap | 6.3.8 | None |
| 01001 | 0x09 | DR_Swap | 6.3.9 | None |
| 01010 | 0x0A | PR_Swap | 6.3.10 | None |
| 01011 | 0x0B | VCONN_Swap | 6.3.11 | None |
| 01100 | 0x0C | Wait | 6.3.12 | None |
| 01101 | 0x0D | Soft_Reset | 6.3.13 | None |
| 01110 | 0x0E | Data_Reset | 6.3.14 | None |
| 01111 | 0x0F | Data_Reset_Complete | 6.3.15 | None |
| 10000 | 0x10 | Not_Supported | 6.3.16 | None |
| 10001 | 0x11 | Get_Source_Cap_Extended | 6.3.17 | None |
| 10010 | 0x12 | Get_Status | 6.3.18 | None |
| 10011 | 0x13 | FR_Swap | 6.3.19 | None |
| 10100 | 0x14 | Get_PPS_Status | 6.3.20 | None |
| 10101 | 0x15 | Get_Country_Codes | 6.3.21 | None |
| 10110 | 0x16 | Get_Sink_Cap_Extended | 6.3.22 | None |
| 10111 | 0x17 | Get_Source_Info | 6.3.23 | None |
| 11000 | 0x18 | Get_Revision | 6.3.24 | None |
| 11001..11111 | 0x19..0x1F | Reserved | 6.2.1.1.8 | N/A |

## Data Message Types (Message Type when NDO>0, Extended=0)

Spec references: `6.4.x`, `Table 66`.

| Type (bin) | Type (hex) | Message | Spec section | Payload/data object fields |
|---|---:|---|---|---|
| 00001 | 0x01 | Source_Capabilities | 6.4.1 | PDOs; see 6.4.1.2/6.4.1.2.x |
| 00010 | 0x02 | Request | 6.4.2 | RDO fields; 6.4.2.1..6.4.2.12 |
| 00011 | 0x03 | BIST | 6.4.3 | BDO; BIST modes in 6.4.3.x |
| 00100 | 0x04 | Sink_Capabilities | 6.4.1 | PDOs; see 6.4.1.3/6.4.1.3.x |
| 00101 | 0x05 | Battery_Status | 6.4.5 | BSDO; 6.4.5.1, 6.4.5.2 |
| 00110 | 0x06 | Alert | 6.4.6 | ADO + optional Extended Alert words |
| 00111 | 0x07 | Get_Country_Info | 6.4.7 | CCDO country code object |
| 01000 | 0x08 | Enter_USB | 6.4.8 | EUDO fields 6.4.8.1..6.4.8.10 |
| 01001 | 0x09 | EPR_Request | 6.4.9 | ERDO |
| 01010 | 0x0A | EPR_Mode | 6.4.10 | EPRMDO |
| 01011 | 0x0B | Source_Info | 6.4.11 | SIDO fields 6.4.11.1..6.4.11.4 |
| 01100 | 0x0C | Revision | 6.4.12 | RMDO |
| 01101 | 0x0D | Reserved | 6.2.1.1.8 | N/A |
| 01110 | 0x0E | Reserved | 6.2.1.1.8 | N/A |
| 01111 | 0x0F | Vendor_Defined | 6.4.4 | UVDM/SVDM headers + VDO payload |
| 10000..11111 | 0x10..0x1F | Reserved | 6.2.1.1.8 | N/A |

## Extended Message Types (Extended=1)

Spec references: `6.5.x`, `Table 615`.

| Type (bin) | Type (hex) | Message | Spec section | Data block / field references | Chunking |
|---|---:|---|---|---|---|
| 00001 | 0x01 | Source_Capabilities_Extended | 6.5.1 | SCEDB, Table 616, fields 6.5.1.1..6.5.1.15 | Yes |
| 00010 | 0x02 | Status | 6.5.2 | SDB, Tables 617/618, fields 6.5.2.1.x and 6.5.2.2.x | Yes |
| 00011 | 0x03 | Get_Battery_Cap | 6.5.3 | GBCDB, Table 658 | Yes |
| 00100 | 0x04 | Get_Battery_Status | 6.5.4 | GBSDB, Table 659 | Yes |
| 00101 | 0x05 | Battery_Capabilities | 6.5.5 | BCDB, fields 6.5.5.1..6.5.5.5 | Yes |
| 00110 | 0x06 | Get_Manufacturer_Info | 6.5.6 | GMIDB, Table 661 | Yes |
| 00111 | 0x07 | Manufacturer_Info | 6.5.7 | MIDB, Table 662, fields 6.5.7.1..6.5.7.3 | Yes |
| 01000 | 0x08 | Security_Request | 6.5.8.1 | Security message payload | Yes |
| 01001 | 0x09 | Security_Response | 6.5.8.2 | Security message payload | Yes |
| 01010 | 0x0A | Firmware_Update_Request | 6.5.9.1 | Firmware update payload | Yes |
| 01011 | 0x0B | Firmware_Update_Response | 6.5.9.2 | Firmware update payload | Yes |
| 01100 | 0x0C | PPS_Status | 6.5.10 | PPSSDB, Table 663, fields 6.5.10.1..6.5.10.3 | Yes |
| 01101 | 0x0D | Country_Info | 6.5.12 | CIDB, Table 665, fields 6.5.12.1..6.5.12.2 | Yes |
| 01110 | 0x0E | Country_Codes | 6.5.11 | CCDB, Table 664, field 6.5.11.1 | Yes |
| 01111 | 0x0F | Sink_Capabilities_Extended | 6.5.13 | SKEDB, Table 666, fields 6.5.13.1..6.5.13.18 | Yes |
| 10000 | 0x10 | Extended_Control | 6.5.14 | ECDB, Table 667; subtypes in Table 668 | Yes |
| 10001 | 0x11 | EPR_Source_Capabilities | 6.5.15.2 | EPR capabilities payload | Yes |
| 10010 | 0x12 | EPR_Sink_Capabilities | 6.5.15.3 | EPR capabilities payload | Yes |
| 10011 | 0x13 | Vendor_Defined_Extended | 6.5.16 | Vendor-defined extended payload | Yes |
| 10100..11111 | 0x14..0x1F | Reserved | 6.2.1.1.8 | N/A | N/A |

## Extended Control Message Subtypes

Spec references: `6.5.14.x`, `Table 668`.

| ECDB subtype | Message |
|---:|---|
| 0x01 | EPR_Get_Source_Cap |
| 0x02 | EPR_Get_Sink_Cap |
| 0x03 | EPR_KeepAlive |
| 0x04 | EPR_KeepAlive_Ack |

## Coverage Targets for Step 2 Audit

The following message types are present in the USB-PD 3.2 matrix and must
be represented in code either as dedicated classes or justified unsupported
entries:

- All control messages through `Get_Revision`
- All data messages through `Vendor_Defined`
- All extended messages through `Vendor_Defined_Extended`
- All extended-control subtypes listed above
- Chunking fields and behaviors for extended messaging

## Notes for Implementation Mapping

Naming normalization used in this matrix follows existing repository enum
style (underscores and title case) so entries map directly to
`t76/drpd/message/header.py::MessageType` and
`t76/drpd/message/messages/__init__.py` factory keys.

## Data Object Type Matrix

The compliance scope also includes all data-object families decoded and
encoded by `t76/drpd/message/data_objects/`.

### Source PDO / APDO family

File: `t76/drpd/message/data_objects/power.py`

- `FixedSupplyPDO`
- `VariableSupplyPDO`
- `BatterySupplyPDO`
- `SPRPpsApdo`
- `SPRAvsApdo`
- `EPRAvsApdo`
- `UnknownApdo`

Factory anchor:
- `SourcePDO.from_raw(...)`

### Sink PDO / APDO family

File: `t76/drpd/message/data_objects/sink.py`

- `FixedSinkPDO`
- `VariableSinkPDO`
- `BatterySinkPDO`
- `SprPpsSinkApdo`
- `EprAvsSinkApdo`
- `UnknownSinkApdo`

Factory anchor:
- `SinkPDO.from_raw(...)`

### Request Data Object family

File: `t76/drpd/message/data_objects/request.py`

- `FixedVariableRDO`
- `BatteryRDO`
- `PpsRDO`
- `AvsSprRDO`
- `AvsEprRDO`

Factory anchors:
- `RequestDO.from_raw_and_pdo(...)`
- `RequestDO.guess_from_raw(...)`

### BIST Data Object family

File: `t76/drpd/message/data_objects/bist.py`

- `BistCarrierMode`
- `BistTestData`
- `BistSharedTestModeEntry`
- `BistSharedTestModeExit`
- `BistReservedOrUnknown`

Factory anchor:
- `BistDataObject.from_raw(...)`

### Alert Data Object family

File: `t76/drpd/message/data_objects/alert.py`

- `AlertDataObject`
- `FixedSupplyExtendedADO`
- `BatteryStatusExtendedADO`
- `ManufacturerInfoExtendedADO`
- `ExtendedADO` (fallback)

Factory anchor:
- `ExtendedADO.from_raw(...)`

### Vendor Data Object family

File: `t76/drpd/message/data_objects/vendor.py`

- Header and generic: `UvdmHeaderVDO`, `SvdmHeaderVDO`,
  `GenericPayloadVDO`, `UnknownVDO`
- Identity: `IdHeaderVDO`, `CertStatVDO`, `ProductVDO`
- Product-type: `ProductTypeUfpVDO`, `ProductTypeDfpVDO`,
  `PassiveCableVDO`, `ActiveCableVDO1`, `ActiveCableVDO2`,
  `ActiveCableVDO3`, `AmaVDO`, `VpdVDO`
- Discovery/mode payload: `SvidsVDO`, `ModesVDO`,
  `EnterModePayloadVDO`, `ExitModePayloadVDO`, `AttentionVDO`

Validation anchors:
- `encode()` and `to_dict()` for each VDO subclass
- Vendor payload decoding path in
  `t76/drpd/message/messages/vendor_defined.py`
