# USB-PD Message-Specific Human-Readable Metadata

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

`frontend/PLANS.md` is checked into the repo and this document must be maintained in accordance with it.

## Purpose / Big Picture

After this change, a developer inspecting any decoded USB-PD message in the frontend will be able to open `humanReadableMetadata.messageSpecificData` and see every decoded payload field rendered as a labeled, explained, ordered structure instead of a bare TypeScript object. This makes the parser output suitable for UI rendering, debugging, and future export without needing to know the raw USB-PD bit layout.

The visible behavior is that every message type that already has parsed data objects or parsed data blocks will expose those fields in `messageSpecificData`, with one metadata field per decoded spec field. Where a message carries multiple data objects, the metadata will preserve order and object identity. Where a message carries payload that is still only raw bytes today, the plan below makes that gap explicit and provides a fallback so the payload is still surfaced instead of silently omitted.

## Progress

- [x] (2026-03-07 00:00Z) Reviewed the current `humanReadableMetadata` shape and confirmed `messageSpecificData` is still empty.
- [x] (2026-03-07 00:00Z) Inventoried all parsed data objects and parsed extended data blocks in `frontend/src/lib/device/drpd/usb-pd/DataObjects.ts`.
- [x] (2026-03-07 00:00Z) Cross-checked the current parser inventory against the local USB-PD 3.2 spec PDF and the checked-in decoding execplan to confirm which message payloads are already structurally decoded and which remain raw.
- [x] (2026-03-07 00:00Z) Wrote this ExecPlan, including a per-type implementation checklist and a final spec-skeptical validation phase.
- [x] (2026-03-07 09:00Z) Implemented shared metadata builder helpers for parsed data objects and parsed data blocks.
- [x] (2026-03-07 09:00Z) Added metadata builders adjacent to parsed object/data-block types in `frontend/src/lib/device/drpd/usb-pd/DataObjects.ts`.
- [x] (2026-03-07 09:05Z) Updated every message class that carries decoded payload data so it populates `humanReadableMetadata.messageSpecificData`.
- [x] (2026-03-07 09:05Z) Added explicit fallback metadata for payload families whose internal field layout is defined by external USB-IF specifications not present in this repo.
- [x] (2026-03-07 09:08Z) Added coverage tests for the newly populated message-specific metadata and completed the skeptical spec verification pass against the local USB-PD 3.2 PDF for the fields defined there.

## Surprises & Discoveries

- Observation: there are no per-type “data object subclass files” today. All parsed data object and extended data block definitions live in one file: `frontend/src/lib/device/drpd/usb-pd/DataObjects.ts`.
  Evidence: `DataObjects.ts` contains all `Parsed*` interfaces and `parse*` functions for PDOs, RDOs, VDOs, and extended data blocks.

- Observation: several message classes already decode payloads into typed fields, but some important message families still keep their payload as raw bytes only.
  Evidence: `FirmwareUpdateRequestMessage.ts`, `FirmwareUpdateResponseMessage.ts`, `SecurityRequestMessage.ts`, `SecurityResponseMessage.ts`, `GetBatteryCapMessage.ts`, `GetBatteryStatusMessage.ts`, and `GetManufacturerInfoMessage.ts` do not call a typed payload parser in the current code.

- Observation: the checked-in `frontend/execplans/usb-pd/message-decoding-execplan.md` already captures many data-message field layouts in prose and can be safely incorporated by reference, but the final implementation still needs a direct PDF verification pass because the metadata must match the current 2024-10 PDF wording and field applicability.
  Evidence: the existing execplan embeds PDO, RDO, APDO, BIST, Battery Status, Alert, Country Code, Enter_USB, EPR_Mode, Source_Info, and Revision payload definitions.

- Observation: USB-PD 3.2 does not define the internal field layout of `Security_Request`, `Security_Response`, `Firmware_Update_Request`, or `Firmware_Update_Response`; it only defines their message role, valid size range, and the external specification that owns the payload format.
  Evidence: Sections `6.5.8.1`, `6.5.8.2`, `6.5.9.1`, and `6.5.9.2` state that the SRQDB/SRPDB/FRQDB/FRPDB contents are defined in `USBTypeCAuthentication 1.0` and `USB PD Firmware Update 1.0`.

## Decision Log

- Decision: keep the per-type metadata builder code adjacent to the existing parsed-type definitions in `frontend/src/lib/device/drpd/usb-pd/DataObjects.ts` rather than splitting the file as part of this feature.
  Rationale: the current repository has no per-object files, and splitting that file would turn a metadata feature into a broad parser refactor. Adjacency is still preserved because each metadata builder will live next to its `Parsed*` interface and `parse*` function.
  Date/Author: 2026-03-07, Codex

- Decision: keep message-specific assembly logic in each message class file under `frontend/src/lib/device/drpd/usb-pd/messages/`, while allowing shared ordered-dictionary helper functions in a new shared metadata helper module if repetition becomes high.
  Rationale: each message class knows whether its payload is a single object, a heterogeneous pair, a VDO sequence, a typed data block, or a raw byte block. That message-local knowledge should stay local.
  Date/Author: 2026-03-07, Codex

- Decision: treat raw and partially decoded payload families as first-class gaps and surface them through explicit fallback metadata rather than leaving them absent.
  Rationale: the user asked that data attached to a message be properly interpreted and added to `messageSpecificData`. For payloads that are not yet fully decoded by the parser, the correct near-term behavior is explicit raw-byte metadata plus a clear follow-up path to richer decoding.
  Date/Author: 2026-03-07, Codex

- Decision: for Security and Firmware Update payloads, use opaque but structured data-block metadata rather than inventing field names from examples.
  Rationale: the local USB-PD 3.2 PDF delegates those internal layouts to external USB-IF specifications that are not available in this repository. The correct spec-grounded implementation is to expose the owning external spec, the valid length range, the actual length, and the raw bytes.
  Date/Author: 2026-03-07, Codex

## Outcomes & Retrospective

This plan identified every currently parsed data object and data block type, mapped each one to the messages that use it, and drove the implementation of message-specific metadata generation without guessing where the code belongs. The implementation is now complete for the USB-PD 3.2 fields defined in the local PDF and for the remaining standard VDM command payload wrappers. Security and firmware update payloads are now surfaced through explicit external-spec-aware opaque containers instead of unlabelled raw bytes. The remaining gap is only the absence of the companion USB-IF specifications in this repository.

## Context and Orientation

The USB-PD parser lives in `frontend/src/lib/device/drpd/usb-pd/`. The message dispatcher in `frontend/src/lib/device/drpd/usb-pd/parser.ts` constructs a concrete message class from `frontend/src/lib/device/drpd/usb-pd/messages/`. Each message class already exposes `humanReadableMetadata`, and the base `Message` class in `frontend/src/lib/device/drpd/usb-pd/messageBase.ts` already fills `baseInformation`, `technicalData`, and `headerData`.

The payload decoders live in `frontend/src/lib/device/drpd/usb-pd/DataObjects.ts`. In this repository, “data object” means a typed interpretation of a 32-bit payload word such as a Power Data Object (PDO), Request Data Object (RDO), Vendor Data Object (VDO), or one-object data message such as Alert or Battery_Status. “Data block” means a typed interpretation of the variable-length payload carried by an Extended Message, such as Status or Manufacturer_Info. The metadata work in this plan is about turning those parsed structures into recursive `HumanReadableField` trees inside `messageSpecificData`.

The spec source of truth is the local PDF at `python/info/usb/USB-PD 3.2 spec.pdf`. The field layouts already embedded in `frontend/execplans/usb-pd/message-decoding-execplan.md` should be used as an implementation accelerator, but every final metadata field must still be checked against the PDF before the work is considered complete.

## Data Object and Data Block Inventory

The following parsed payload types already exist in `frontend/src/lib/device/drpd/usb-pd/DataObjects.ts` and must receive metadata builders there.

### PDO and APDO family in `frontend/src/lib/device/drpd/usb-pd/DataObjects.ts`

These are used by `SourceCapabilitiesMessage.ts`, `SinkCapabilitiesMessage.ts`, `EPRSourceCapabilitiesMessage.ts`, `EPRSinkCapabilitiesMessage.ts`, and `EPRRequestMessage.ts`.

The metadata builder set must cover:

- `FixedSupplyPDO`
- `VariableSupplyPDO`
- `BatterySupplyPDO`
- `SPRPPSAPDO`
- `SPRAVSAPDO`
- `EPRAVSAPDO`
- `ReservedAPDO`

Each builder must add every parsed field already exposed by the interface, including the contextual source-vs-sink meaning where the parser has already combined those into one structure. The bit-level field definitions for these are already captured in `frontend/execplans/usb-pd/message-decoding-execplan.md` and must be rechecked against the PDF tables for PDO/APDO layouts during implementation.

### RDO family in `frontend/src/lib/device/drpd/usb-pd/DataObjects.ts`

These are used by `RequestMessage.ts` and `EPRRequestMessage.ts`.

The metadata builder must cover `ParsedRDO`, including:

- top-level fields such as `objectPosition`, `giveback`, `capabilityMismatch`, `usbCommunicationsCapable`, `noUsbSuspend`, `unchunkedExtendedMessagesSupported`, `eprCapable`, and `requestTypeHint`
- nested interpretation groups `fixedVariable`, `battery`, `pps`, and `avs`

The bit layouts are already embedded in `frontend/execplans/usb-pd/message-decoding-execplan.md` and must be checked back to the PDF.

### Single-object data messages in `frontend/src/lib/device/drpd/usb-pd/DataObjects.ts`

These are consumed by one message class each and need one metadata builder per type:

- `ParsedBISTDataObject` used by `BISTMessage.ts`
- `ParsedBatteryStatusDataObject` used by `BatteryStatusMessage.ts`
- `ParsedAlertDataObject` used by `AlertMessage.ts`
- `ParsedCountryCodeDataObject` used by `GetCountryInfoMessage.ts`
- `ParsedEnterUSBDataObject` used by `EnterUSBMessage.ts`
- `ParsedEPRModeDataObject` used by `EPRModeMessage.ts`
- `ParsedSourceInfoDataObject` used by `SourceInfoMessage.ts`
- `ParsedRevisionDataObject` used by `RevisionMessage.ts`

The field layouts for these objects are already described in the checked-in decoding execplan and must be cross-checked to the PDF during implementation.

### Vendor-defined objects in `frontend/src/lib/device/drpd/usb-pd/DataObjects.ts`

These are used by `VendorDefinedMessage.ts` and `VendorDefinedExtendedMessage.ts`.

The metadata builder set must cover:

- `ParsedVDMHeader`
- `ParsedIDHeaderVDO`
- `ParsedCertStatVDO`
- `ParsedProductVDO`
- `ParsedUFPVDO`
- `ParsedDFPVDO`
- `ParsedPassiveCableVDO`
- `ParsedActiveCableVDO1`
- `ParsedActiveCableVDO2`
- `ParsedVPDVDO`
- the aggregate `ParsedDiscoverIdentity`

This family needs special handling because the metadata assembly must preserve VDO order and command context. For `VendorDefinedMessage.ts`, the VDM Header must appear first, followed by either decoded standard VDO containers or raw VDO byte/word fallbacks where the parser does not have a richer interpretation.

### Extended data blocks in `frontend/src/lib/device/drpd/usb-pd/DataObjects.ts`

These are used by Extended Message classes and need one metadata builder per type:

- `ParsedSourceCapabilitiesExtendedDataBlock` used by `SourceCapabilitiesExtendedMessage.ts`
- `ParsedSOPStatusDataBlock` used by `StatusMessage.ts` when `sop.kind === 'SOP'`
- `ParsedSOPPrimeStatusDataBlock` used by `StatusMessage.ts` for cable-directed packets
- `ParsedBatteryCapabilitiesDataBlock` used by `BatteryCapabilitiesMessage.ts`
- `ParsedManufacturerInfoDataBlock` used by `ManufacturerInfoMessage.ts`
- `ParsedPPSStatusDataBlock` used by `PPSStatusMessage.ts`
- `ParsedCountryCodesDataBlock` used by `CountryCodesMessage.ts`
- `ParsedCountryInfoDataBlock` used by `CountryInfoMessage.ts`
- `ParsedSinkCapabilitiesExtendedDataBlock` used by `SinkCapabilitiesExtendedMessage.ts`
- `ParsedExtendedControlDataBlock` used by `ExtendedControlMessage.ts`

Every field on each interface must become a metadata field, including raw byte-backed members such as `manufacturerStringBytes` and `countrySpecificData`.

## Payload Types Not Fully Covered by the Prompt

The prompt covers every message payload that is already decoded into typed objects or typed blocks, but it does not by itself cover every possible payload shape that can appear in the message classes today.

The current gaps are:

- `FirmwareUpdateRequestMessage.ts` and `FirmwareUpdateResponseMessage.ts`, whose payloads are retained as raw bytes
- `SecurityRequestMessage.ts` and `SecurityResponseMessage.ts`, whose payloads are retained as raw bytes
- `GetBatteryCapMessage.ts`, `GetBatteryStatusMessage.ts`, and `GetManufacturerInfoMessage.ts`, which currently preserve request payload bytes without a dedicated parsed object type
- `ReservedDataMessage.ts` and `ReservedExtendedMessage.ts`, which intentionally preserve unsupported payloads as raw
- `VendorDefinedExtendedMessage.ts` beyond the first parsed VDM header; the remaining payload is not yet decoded into a structured object model
- raw VDO tails in `VendorDefinedMessage.ts` for commands that are not yet decoded into standard VDO structures

To handle these so that attached data still appears in `messageSpecificData`, the implementation should add a documented fallback policy:

- if a message has a typed parsed object or block, emit field-by-field metadata from that typed structure
- if a message has only raw bytes today, emit a clearly labeled `ByteData` or ordered-dictionary wrapper with a raw payload field and an explanation that the payload is not yet structurally decoded in the frontend
- if a message has a partially decoded structure plus a raw tail, emit metadata for both the decoded fields and the raw remainder

A follow-up parsing project can later replace those raw fallbacks with typed metadata without changing the `messageSpecificData` container contract.

## Plan of Work

Start by extending `frontend/src/lib/device/drpd/usb-pd/DataObjects.ts` with a metadata-builder function adjacent to each parsed payload type. These functions should accept one parsed object or parsed block and return `HumanReadableField<'OrderedDictionary'>`. Keep a small shared helper layer in the same file or in a new helper module under `frontend/src/lib/device/drpd/usb-pd/` for common tasks such as adding labeled scalar fields, bitfield summaries, byte arrays, enumerated-value strings, and ordered child containers. The helper layer should not hide payload structure; it should only reduce repetition.

Next, update the message classes under `frontend/src/lib/device/drpd/usb-pd/messages/` so each class fills `messageSpecificData` from the parsed payload it already owns. Keep the assembly logic in the message class file because that is where payload multiplicity and semantics are known. For example, `SourceCapabilitiesMessage.ts` should insert a container for the PDO list and then append one metadata object per decoded PDO in order; `EPRRequestMessage.ts` should insert both the RDO metadata and the requested PDO copy metadata; `StatusMessage.ts` should branch between the SOP and SOP' data-block metadata builders depending on the packet type.

Then, add the raw-payload fallback path for classes whose payload is not yet parsed into a typed structure. These messages should not leave `messageSpecificData` empty. Instead, they should include explicit raw payload metadata with labels and explanations that say the frontend has preserved the bytes but does not yet perform a structured interpretation.

Finally, add a strict validation pass. This is not just running tests. The implementer must compare every generated metadata field against the spec tables and prose, object by object and field by field, and keep correcting code until the metadata labels, values, and explanations match the spec-defined meaning and field applicability.

## Concrete Steps

Work from `/Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/monorepo/frontend` unless a step says otherwise.

1. Read `python/info/usb/USB-PD 3.2 spec.pdf` using `pdftotext` or equivalent extraction and keep a scratch text file under `/tmp` for the relevant payload sections. Reuse `frontend/execplans/usb-pd/message-decoding-execplan.md` as a cross-reference, not as the final authority.

2. In `frontend/src/lib/device/drpd/usb-pd/DataObjects.ts`, add metadata-builder functions for every parsed payload type listed in the inventory above. Keep each builder next to the corresponding `Parsed*` interface and `parse*` function.

3. In `frontend/src/lib/device/drpd/usb-pd/messages/SourceCapabilitiesMessage.ts`, `SinkCapabilitiesMessage.ts`, `RequestMessage.ts`, `BISTMessage.ts`, `BatteryStatusMessage.ts`, `AlertMessage.ts`, `GetCountryInfoMessage.ts`, `EnterUSBMessage.ts`, `EPRRequestMessage.ts`, `EPRModeMessage.ts`, `SourceInfoMessage.ts`, `RevisionMessage.ts`, `VendorDefinedMessage.ts`, `SourceCapabilitiesExtendedMessage.ts`, `StatusMessage.ts`, `BatteryCapabilitiesMessage.ts`, `ManufacturerInfoMessage.ts`, `PPSStatusMessage.ts`, `CountryCodesMessage.ts`, `CountryInfoMessage.ts`, `SinkCapabilitiesExtendedMessage.ts`, `ExtendedControlMessage.ts`, `EPRSourceCapabilitiesMessage.ts`, and `EPRSinkCapabilitiesMessage.ts`, update `humanReadableMetadata` so `messageSpecificData` is populated from the corresponding typed metadata builders.

4. In raw-only message classes such as `FirmwareUpdateRequestMessage.ts`, `FirmwareUpdateResponseMessage.ts`, `SecurityRequestMessage.ts`, `SecurityResponseMessage.ts`, `GetBatteryCapMessage.ts`, `GetBatteryStatusMessage.ts`, `GetManufacturerInfoMessage.ts`, `ReservedDataMessage.ts`, `ReservedExtendedMessage.ts`, and `VendorDefinedExtendedMessage.ts`, add explicit raw-payload metadata so `messageSpecificData` documents what bytes are attached even when no richer parser exists yet.

5. Add or update unit tests so each message family asserts both the presence and the internal shape of `messageSpecificData`. Use representative samples for every payload family and at least one assertion that checks labels, values, and explanations rather than only container existence.

6. Perform the skeptical spec audit described below before treating the work as complete.

## Type-by-Type Implementation Checklist

This section is intentionally explicit so a novice can work through it without deciding what to do next.

### PDO/APDO checklist in `frontend/src/lib/device/drpd/usb-pd/DataObjects.ts`

Implement one metadata builder each for:

- `FixedSupplyPDO`
- `VariableSupplyPDO`
- `BatterySupplyPDO`
- `SPRPPSAPDO`
- `SPRAVSAPDO`
- `EPRAVSAPDO`
- `ReservedAPDO`

Use those builders in:

- `SourceCapabilitiesMessage.ts`
- `SinkCapabilitiesMessage.ts`
- `EPRSourceCapabilitiesMessage.ts`
- `EPRSinkCapabilitiesMessage.ts`
- `EPRRequestMessage.ts` for `requestedPDOCopy`

### RDO checklist in `frontend/src/lib/device/drpd/usb-pd/DataObjects.ts`

Implement a metadata builder for `ParsedRDO` and use it in:

- `RequestMessage.ts`
- `EPRRequestMessage.ts`

### Single-data-object checklist in `frontend/src/lib/device/drpd/usb-pd/DataObjects.ts`

Implement builders for:

- `ParsedBISTDataObject` in `BISTMessage.ts`
- `ParsedBatteryStatusDataObject` in `BatteryStatusMessage.ts`
- `ParsedAlertDataObject` in `AlertMessage.ts`
- `ParsedCountryCodeDataObject` in `GetCountryInfoMessage.ts`
- `ParsedEnterUSBDataObject` in `EnterUSBMessage.ts`
- `ParsedEPRModeDataObject` in `EPRModeMessage.ts`
- `ParsedSourceInfoDataObject` in `SourceInfoMessage.ts`
- `ParsedRevisionDataObject` in `RevisionMessage.ts`

### Vendor-defined checklist in `frontend/src/lib/device/drpd/usb-pd/DataObjects.ts`

Implement builders for:

- `ParsedVDMHeader`
- `ParsedIDHeaderVDO`
- `ParsedCertStatVDO`
- `ParsedProductVDO`
- `ParsedUFPVDO`
- `ParsedDFPVDO`
- `ParsedPassiveCableVDO`
- `ParsedActiveCableVDO1`
- `ParsedActiveCableVDO2`
- `ParsedVPDVDO`
- `ParsedDiscoverIdentity`

Use them in:

- `VendorDefinedMessage.ts`
- `VendorDefinedExtendedMessage.ts` for the VDM header, plus a raw fallback for the remaining bytes until richer parsing exists

### Extended data-block checklist in `frontend/src/lib/device/drpd/usb-pd/DataObjects.ts`

Implement builders for:

- `ParsedSourceCapabilitiesExtendedDataBlock` in `SourceCapabilitiesExtendedMessage.ts`
- `ParsedSOPStatusDataBlock` in `StatusMessage.ts`
- `ParsedSOPPrimeStatusDataBlock` in `StatusMessage.ts`
- `ParsedBatteryCapabilitiesDataBlock` in `BatteryCapabilitiesMessage.ts`
- `ParsedManufacturerInfoDataBlock` in `ManufacturerInfoMessage.ts`
- `ParsedPPSStatusDataBlock` in `PPSStatusMessage.ts`
- `ParsedCountryCodesDataBlock` in `CountryCodesMessage.ts`
- `ParsedCountryInfoDataBlock` in `CountryInfoMessage.ts`
- `ParsedSinkCapabilitiesExtendedDataBlock` in `SinkCapabilitiesExtendedMessage.ts`
- `ParsedExtendedControlDataBlock` in `ExtendedControlMessage.ts`

### Raw-fallback checklist in message files

Add explicit raw metadata for:

- `FirmwareUpdateRequestMessage.ts`
- `FirmwareUpdateResponseMessage.ts`
- `SecurityRequestMessage.ts`
- `SecurityResponseMessage.ts`
- `GetBatteryCapMessage.ts`
- `GetBatteryStatusMessage.ts`
- `GetManufacturerInfoMessage.ts`
- `ReservedDataMessage.ts`
- `ReservedExtendedMessage.ts`
- undecoded payload portions of `VendorDefinedMessage.ts` and `VendorDefinedExtendedMessage.ts`

## Validation and Acceptance

Run these commands from `frontend/`:

    npm run test -- src/lib/device/drpd/usb-pd src/lib/device/drpd/__tests__/logDecode.test.ts

After implementation, acceptance is not only “tests pass.” The following must all be true:

- `messageSpecificData` is no longer empty for every message family that already has a typed parsed payload.
- Raw-only message families expose explicit raw-payload metadata instead of staying empty.
- For list-carrying messages such as Source_Capabilities and Sink_Capabilities, metadata preserves object order and distinguishes each object instance.
- For heterogeneous payloads such as `EPR_Request`, metadata exposes both attached objects separately and labels them by role.
- For VDM-based messages, metadata includes the VDM Header plus decoded standard VDOs when available and raw tails when not.

The final implementation step must include a skeptical spec comparison, performed field by field and object by object. The implementer must:

- open the relevant PDF sections for each payload family
- compare every metadata key, label, displayed value, and explanation against the spec
- confirm that every field in each parsed interface has a metadata field
- confirm that no spec-defined field was dropped or renamed incorrectly
- confirm that enum values, units, and boolean meanings match the spec wording
- confirm that every raw fallback is used only where the frontend truly lacks a richer parser today
- fix the code and rerun tests until the audit passes cleanly

## Idempotence and Recovery

This work is additive. Re-running the metadata builders or the tests should not mutate persisted data or device state. If a builder for one payload family becomes too complex, extract helper functions instead of changing the visible metadata contract. If a spec audit reveals that a current parser field is misnamed or missing units, correct the parser-adjacent metadata code first and only widen the parser type itself when the metadata cannot be made correct from the existing parsed structure.

## Artifacts and Notes

The most important artifact to keep while implementing is a working scratch mapping between spec sections and parser types. A minimal example is:

    ParsedRDO -> DataObjects.ts -> RequestMessage.ts / EPRRequestMessage.ts -> spec sections for Fixed/Variable, Battery, PPS, and AVS RDO layouts
    ParsedVDMHeader -> DataObjects.ts -> VendorDefinedMessage.ts / VendorDefinedExtendedMessage.ts -> spec tables for VDM header and identity VDOs
    ParsedSinkCapabilitiesExtendedDataBlock -> DataObjects.ts -> SinkCapabilitiesExtendedMessage.ts -> spec extended-message section for SKEDB fields

Keep this mapping updated as discoveries are made; it is the fastest way to catch omissions in the final skeptical audit.

## Interfaces and Dependencies

Add metadata builders using the existing `HumanReadableField` API from `frontend/src/lib/device/drpd/usb-pd/humanReadableField.ts`. The builder contract should be explicit and stable. The implementation should end with functions shaped like:

    export const buildFixedSupplyPDOMetadata = (
      pdo: FixedSupplyPDO,
    ): HumanReadableField<'OrderedDictionary'> => { ... }

    export const buildParsedRDOMetadata = (
      rdo: ParsedRDO,
    ): HumanReadableField<'OrderedDictionary'> => { ... }

    export const buildSourceCapabilitiesExtendedDataBlockMetadata = (
      block: ParsedSourceCapabilitiesExtendedDataBlock,
    ): HumanReadableField<'OrderedDictionary'> => { ... }

The message-level assembly in each `messages/*.ts` file should continue to use the established pattern:

    const metadata = super.humanReadableMetadata
    metadata.messageSpecificData.insertEntryAt(...)
    return metadata

Use `HumanReadableField.string(...)` for scalar values and `HumanReadableField.byteData(...)` for preserved raw bytes. Use ordered dictionaries for nested objects and ordered lists encoded as ordered dictionaries with stable keys such as `pdo1`, `pdo2`, `vdo1`, `vdo2`, or similarly explicit names.

Revision note: created this ExecPlan on 2026-03-07 after inventorying `DataObjects.ts`, `messages/*.ts`, the checked-in USB-PD decoding execplan, and the local USB-PD 3.2 PDF. The plan explicitly adds a raw-payload fallback because the current prompt does not fully cover payload families that are still undecoded in the frontend parser.
