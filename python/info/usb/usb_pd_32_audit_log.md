# USB-PD 3.2 Message Audit Log

This log records Step 2 and Step 3 execution from
`info/plans/usb_pd_32_message_compliance_execplan.md`.

## Summary

Audit basis:

- `info/usb/usb_pd_32_message_matrix.md`
- Header decode/encode mapping in `t76/drpd/message/header.py`
- Factory dispatch in `t76/drpd/message/messages/__init__.py` and
  `t76/drpd/message/messages/_base.py`
- Concrete message wrappers in `t76/drpd/message/messages/*.py`

Primary gaps found and fixed:

1. Missing extended message IDs and classes for values `0x0F..0x13`.
2. Missing Extended Control subtype reporting.
3. Redundant descriptive fields in `ExtendedHeader.to_dict()`.
4. Non-professional `RDO (guessed)` label in request renderable output.
5. Data-object family coverage was not explicitly tracked in tests.
6. `EPR_Mode` payload decode used a non-spec bit layout.
7. `ID Header VDO`, `Product VDO`, and cable VDO bitfields were partially
   incorrect or incomplete relative to USB-PD 3.2 tables.
8. Structured VDM Header command decoding incorrectly included reserved bit
   `B5` in the command number.

Latest full-audit scope (2026-02-10, Poppler-backed):

- All USB-PD 3.2 message type IDs in `Table 6.5`, `Table 6.6`,
  and `Table 6.15` were checked for enum mapping and factory resolution.
- All in-repo message wrappers in `t76/drpd/message/messages/` were checked
  for field-level decode coverage and render output.
- All in-repo data-object classes in `t76/drpd/message/data_objects/` were
  checked for decode exposure via `to_dict()`.

Full-audit outcome:

- Message type coverage: Pass
  All non-reserved message IDs in the matrix are mapped in
  `t76/drpd/message/header.py` and registered in
  `t76/drpd/message/messages/__init__.py`.
- Fixed-layout message field decode: Pass with updates
  Added/updated field decode for `Status` (SOP + SOP'/SOP''), EPR mode,
  sink capabilities extended, battery capabilities, and EPR capabilities
  PDO-list parsing.
- Data object decode coverage: Pass with bounded exceptions
  Normative fixed-layout PDO/RDO/BDO/ADO/VDO objects now expose their
  relevant fields. Remaining generic wrappers are external-spec or
  mode/vendor-specific by design (see "Bounded generic wrappers" below).

Bounded generic wrappers (intentional):

- `Security_Request`/`Security_Response`: payload formats are defined by
  USB Type-C Authentication, not this base PD spec section.
- `Firmware_Update_Request`/`Firmware_Update_Response`: payload formats are
  defined by USB PD Firmware Update 1.0, not Table-defined PD base fields.
- `Vendor_Defined_Extended`: vendor-defined payload by specification.
- `AmaVDO`, `AttentionVDO`, `EnterModePayloadVDO`, `ExitModePayloadVDO`,
  `ActiveCableVDO3`: deprecated or SVID/mode-specific payloads without a
  single universal decode layout in USB-PD 3.2 base tables.

## 2026-02-10 Spec-Table Audit Addendum

Source of truth for this addendum:

- `/Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/python_library/info/usb/USB-PD 3.2 spec.pdf`
- Extracted with `pdftotext` from Poppler in this environment

Tables/sections directly validated:

- Section 6.4.10 and Table 6.50 (`EPR_Mode` / `EPRMDO`)
- Table 6.29 (Structured VDM Header)
- Table 6.33 (ID Header VDO)
- Table 6.38 (Product VDO)
- Table 6.41 (Passive Cable VDO)
- Table 6.42 (Active Cable VDO1)
- Table 6.43 (Active Cable VDO2)
- Table 6.44 (VPD VDO)

Implemented fixes:

- `t76/drpd/message/messages/epr_mode.py`
  - Replaced non-spec "active/capable/current" decode with Table 6.50
    fields: Action (B31..24), Data (B23..16), Reserved (B15..0).
  - Added action/reason rendering for Enter/Enter Ack/Enter Succeeded/
    Enter Failed/Exit.

- `t76/drpd/message/data_objects/vendor.py`
  - `SvdmHeaderVDO.command` now decodes `B4..0` (reserved `B5` ignored).
  - `IdHeaderVDO` now decodes all Table 6.33 fields explicitly.
  - `ProductVDO` corrected to `PID=B31..16`, `bcdDevice=B15..0`.
  - Added full field decoding for `ProductTypeUfpVDO` (Table 6.39),
    `ProductTypeDfpVDO` (Table 6.40), `PassiveCableVDO` (Table 6.41),
    `ActiveCableVDO1` (Table 6.42), `ActiveCableVDO2` (Table 6.43),
    and `VpdVDO` (Table 6.44).

- `t76/drpd/message/messages/vendor_defined.py`
  - Discover Identity payload routing now uses ID Header product-type
    fields for SOP/SOP' path selection instead of loose heuristics.
  - Active cable path includes decoded VDO1/VDO2 and preserves extras.

Validation added:

- `t76/drpd/tests/test_usb_pd_spec_decoding.py`
  - New field-level tests for EPRMDO, SVDM command bits, ID Header,
    Product VDO order, Passive/Active cable VDO fields, active-cable
    Discover Identity routing, Status SDB/SPDB, BCDB, SKEDB, and EPR
    source/sink capabilities PDO list decoding.

Current residual gaps:

- `AmaVDO` remains intentionally minimal because AMA is deprecated in
  USB-PD 3.2 Section 6.4.4.3.1.8.
- `ActiveCableVDO3` remains generic; this audit focused on normative
  Active Cable VDO1/VDO2 tables in USB-PD 3.2.

## Header Mapping Audit

- File: `t76/drpd/message/header.py`
- Decode status: Pass (updated)
  Added extended mappings for:
  `Sink_Capabilities_Extended`, `Extended_Control`,
  `EPR_Source_Capabilities`, `EPR_Sink_Capabilities`,
  `Vendor_Defined_Extended`.
- Encode status: Pass (updated)
  `Header.from_fields(..., extended=True)` now emits IDs for all
  extended message types in the matrix.
- Descriptive output status: Pass (updated)
  Removed "Meaning" helper lines from `ExtendedHeader.to_dict()` and
  kept only factual bitfield data.

## Factory Registration Audit

- File: `t76/drpd/message/messages/__init__.py`
- Decode status: Pass (updated)
  Added factory registration for:
  `Sink_Capabilities_Extended`, `Extended_Control`,
  `EPR_Source_Capabilities`, `EPR_Sink_Capabilities`,
  `Vendor_Defined_Extended`.
- Encode status: N/A (factory-only file)
- Descriptive output status: Pass

## Message Class Audit

### Control messages

- Coverage status: Pass
- Implementation path: `ControlMessage` wrapper with `MessageType`
  selection from header.
- Files: `t76/drpd/message/messages/control.py`,
  `t76/drpd/message/header.py`

### Data messages

| Message | Class | File | Status |
|---|---|---|---|
| Source_Capabilities | `SourceCapabilitiesMessage` | `t76/drpd/message/messages/source_capabilities.py` | Pass |
| Request | `RequestMessage` | `t76/drpd/message/messages/request.py` | Pass (render label updated) |
| BIST | `BISTMessage` | `t76/drpd/message/messages/bist.py` | Pass |
| Sink_Capabilities | `SinkCapabilitiesMessage` | `t76/drpd/message/messages/sink_capabilities.py` | Pass |
| Battery_Status | `BatteryStatusMessage` | `t76/drpd/message/messages/battery_status.py` | Pass |
| Alert | `AlertMessage` | `t76/drpd/message/messages/alert.py` | Pass |
| Get_Country_Info | `GetCountryInfoMessage` | `t76/drpd/message/messages/country_info.py` | Pass |
| Enter_USB | `EnterUSBMessage` | `t76/drpd/message/messages/enter_usb.py` | Pass |
| EPR_Request | `EPRRequestMessage` | `t76/drpd/message/messages/epr_request.py` | Pass |
| EPR_Mode | `EPRModeMessage` | `t76/drpd/message/messages/epr_mode.py` | Pass |
| Source_Info | `SourceInformationMessage` | `t76/drpd/message/messages/source_information.py` | Pass |
| Revision | `RevisionMessage` | `t76/drpd/message/messages/revision.py` | Pass |
| Vendor_Defined | `VendorDefinedMessage` | `t76/drpd/message/messages/vendor_defined.py` | Pass |

### Extended messages

| Message | Class | File | Status |
|---|---|---|---|
| Source_Capabilities_Extended | `SourceCapabilitiesExtendedMessage` | `t76/drpd/message/messages/source_capabilities_extended.py` | Pass |
| Status | `StatusMessage` | `t76/drpd/message/messages/status.py` | Pass |
| Get_Battery_Cap | `GetBatteryCapabilitiesMessage` | `t76/drpd/message/messages/get_battery_cap.py` | Pass |
| Get_Battery_Status | `GetBatteryStatusMessage` | `t76/drpd/message/messages/get_battery_status.py` | Pass |
| Battery_Capabilities | `BatteryCapabilitiesMessage` | `t76/drpd/message/messages/battery_capabilities.py` | Pass |
| Get_Manufacturer_Info | `GetManufacturerInfoMessage` | `t76/drpd/message/messages/get_manufacturer_info.py` | Pass |
| Manufacturer_Info | `ManufacturerInfoMessage` | `t76/drpd/message/messages/manufacturer_info.py` | Pass |
| Security_Request | `SecurityRequestMessage` | `t76/drpd/message/messages/security_request.py` | Pass |
| Security_Response | `SecurityResponseMessage` | `t76/drpd/message/messages/security_response.py` | Pass |
| Firmware_Update_Request | `FirmwareUpdateRequestMessage` | `t76/drpd/message/messages/firmware_update_request.py` | Pass |
| Firmware_Update_Response | `FirmwareUpdateResponseMessage` | `t76/drpd/message/messages/firmware_update_response.py` | Pass |
| PPS_Status | `PPSStatusMessage` | `t76/drpd/message/messages/pps_status.py` | Pass |
| Country_Info | `CountryInfoExtendedMessage` | `t76/drpd/message/messages/country_info_extended.py` | Pass |
| Country_Codes | `CountryCodesMessage` | `t76/drpd/message/messages/country_codes.py` | Pass |
| Sink_Capabilities_Extended | `SinkCapabilitiesExtendedMessage` | `t76/drpd/message/messages/sink_capabilities_extended.py` | Pass (added) |
| Extended_Control | `ExtendedControlMessage` | `t76/drpd/message/messages/extended_control.py` | Pass (added) |
| EPR_Source_Capabilities | `EPRSourceCapabilitiesMessage` | `t76/drpd/message/messages/epr_source_capabilities.py` | Pass (added) |
| EPR_Sink_Capabilities | `EPRSinkCapabilitiesMessage` | `t76/drpd/message/messages/epr_sink_capabilities.py` | Pass (added) |
| Vendor_Defined_Extended | `VendorDefinedExtendedMessage` | `t76/drpd/message/messages/vendor_defined_extended.py` | Pass (added) |

## Extended Control Subtype Audit

- File: `t76/drpd/message/messages/extended_control.py`
- Decode status: Pass
  ECDB first payload byte is extracted as subtype and reported with names:
  `EPR_Get_Source_Cap`, `EPR_Get_Sink_Cap`, `EPR_KeepAlive`,
  `EPR_KeepAlive_Ack`.
- Encode status: Not implemented at wrapper level (decode-focused wrapper);
  no regression introduced.
- Descriptive output status: Pass

## Descriptive Field Cleanup Audit

Updated:

- `t76/drpd/message/header.py`:
  removed explanatory "Meaning" fields from `ExtendedHeader.to_dict()`.
- `t76/drpd/message/messages/request.py`:
  changed `RDO (guessed)` label to `RDO`.

Result:

- Renderable output contains factual field values and validity indicators.
- Speculation/guess wording removed from user-facing property keys.

## Validation Evidence

Validation command set (Step 4) is captured in test modules:

- `t76/drpd/tests/test_message_type_matrix.py`
- `t76/drpd/tests/test_message_class_compliance.py`
- `t76/drpd/tests/test_extended_chunking.py`
- `t76/drpd/tests/test_renderable_fields.py`
- `t76/drpd/tests/test_data_object_compliance.py`

Execution results are recorded in the final implementation update after
`pytest` run.

### Test run transcript summary

- Command:
  `pytest -q t76/drpd/tests/test_message_type_matrix.py t76/drpd/tests/test_message_class_compliance.py t76/drpd/tests/test_extended_chunking.py t76/drpd/tests/test_renderable_fields.py`
  Result: `12 passed in 0.74s`

- Command:
  `pytest -q t76/drpd/tests/test_data_object_compliance.py`
  Result: `8 passed`

- Command:
  `pytest -q`
  Result: collection failed in environment due
  `ModuleNotFoundError: No module named 'usb'` from device-related tests
  (`test_device_sink.py`, `test_device_sink_pdos.py`, `test_events.py`).

## Data Object Coverage Audit

### Source/Sink PDO and APDO families

- Files:
  `t76/drpd/message/data_objects/power.py`,
  `t76/drpd/message/data_objects/sink.py`
- Decode status: Pass (factory coverage now tested)
  - `SourcePDO.from_raw(...)` and `SinkPDO.from_raw(...)` subclass
    routing is exercised for all supported type branches.
- Encode status: Pass
  - `encode()` 4-byte output is asserted in compliance tests.
- Descriptive status: Pass
  - `to_dict()` availability is validated.

### Request, BIST, and Alert object families

- Files:
  `t76/drpd/message/data_objects/request.py`,
  `t76/drpd/message/data_objects/bist.py`,
  `t76/drpd/message/data_objects/alert.py`
- Decode status: Pass
  - Factory path tests for `RequestDO`, `BistDataObject`,
    and `ExtendedADO`.
- Encode status: Pass
  - 4-byte encode output validated.
- Descriptive status: Pass
  - `to_dict()` coverage validated.

### Vendor VDO family

- File: `t76/drpd/message/data_objects/vendor.py`
- Decode status: Partial
  - Class-level encode/to_dict coverage added.
  - End-to-end structured-command semantic validation remains delegated to
    message-level `VendorDefinedMessage` tests.
- Encode status: Pass (basic)
- Descriptive status: Pass (basic)
