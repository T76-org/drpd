# USB-PD Data + Extended Message Decoding

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

PLANS.md is checked into the repo at `PLANS.md` and this document must be maintained in accordance with it.

## Purpose / Big Picture

After this change, the Dr. PD frontend will decode every USB-PD Data Message and Extended Message into structured, typed fields rather than leaving the payload as raw bytes. A developer or user can inspect a captured message and see the decoded PDOs, RDOs, status blocks, alert flags, manufacturer info, and vendor-defined headers directly from the parsed message object. The behavior is visible by running the unit tests that construct synthetic payloads for each message type and by observing that the decoded message instances expose their fields (for example, parsing a Source_Capabilities message yields a list of decoded PDOs with voltage and current fields instead of an opaque byte array).

## Progress

- [x] (2026-01-30 00:00Z) Reviewed existing USB-PD parsing infrastructure and located the local USB-PD 3.2 spec PDF with data/extended message tables.
- [x] (2026-01-30 11:20Z) Implemented shared parsing helpers and typed decoded structures for PDOs, RDOs, VDMs, and extended data blocks.
- [x] (2026-01-30 11:21Z) Implemented payload decoding for all data and extended message classes, including raw payload retention and parse error tracking.
- [x] (2026-01-30 11:22Z) Added unit tests for each decoded message type and validated decoding with synthetic payloads.
- [x] (2026-01-30 11:23Z) Ran `npm test` and verified all tests pass.

## Surprises & Discoveries

- Observation: The USB-PD spec tables for message payloads are spread across multiple sections and require careful mapping for data objects vs. extended data blocks.
  Evidence: Tables 6.7-6.26 (PDO/RDO/APDO), 6.27 (BIST), 6.46-6.52 (battery/status/revision/source info), 6.54-6.67 (extended data blocks).
- Observation: Vitest in this repo does not accept `--runInBand`, so tests should be run with `npm test` without that flag.
  Evidence: `npm test -- --runInBand` failed with "Unknown option `--runInBand`", while `npm test` passed.
- Observation: Active Cable VDO2 decoding requires inverted boolean handling for USB4/USB2/USB3.2 support bits and includes the Active Element bit at B9.
  Evidence: USB-PD 3.2 Table 6.43 defines B9 Active element and B8/B5/B4 as inverted support flags.

## Decision Log

- Decision: Introduce shared parsing helpers for 32-bit Data Objects and variable-length Extended Data Blocks rather than duplicating bit extraction in each message class.
  Rationale: Many messages reuse PDO/RDO/VDO layouts; a single parser avoids inconsistencies and reduces bugs.
  Date/Author: 2026-01-30, Codex
- Decision: Decode Vendor_Defined (VDM) messages by parsing the VDM Header and then decoding standard Structured VDM response VDOs when the command is known; otherwise preserve raw VDOs.
  Rationale: Structured VDMs have normative fields; vendor-defined payloads outside those commands must remain raw to avoid incorrect assumptions.
  Date/Author: 2026-01-30, Codex
- Decision: Preserve raw bytes alongside decoded fields for every message.
  Rationale: This keeps decoding debuggable and enables future improvements without losing original payload data.
  Date/Author: 2026-01-30, Codex
- Decision: Include a `parseErrors` array on decoded message classes to capture short payloads without throwing.
  Rationale: PD captures may be truncated; retaining the message object with error metadata is more useful for UI than hard failures.
  Date/Author: 2026-01-30, Codex

## Outcomes & Retrospective

- Implemented decoding for all data and extended USB-PD messages, added shared parsing helpers, and validated behavior with comprehensive tests. All tests pass with `npm test`. Remaining work is optional refinement (for example, richer structured VDM decoding for standard SVIDs).

## Context and Orientation

The USB-PD parsing infrastructure lives in `src/lib/device/drpd/usb-pd/`. The message dispatcher `parseUSBPDMessage` in `src/lib/device/drpd/usb-pd/parser.ts` already selects the correct message class using header fields. Each message class lives in `src/lib/device/drpd/usb-pd/messages/` and currently has no payload decoding logic. The decoding guidance and the parsing assumptions (SOP bytes, headers, payload offsets) are documented in `docs/drpd-message-decoding.md`. The USB-PD 3.2 spec is stored locally at `execplans/usb-pd/USB_PD_R3_2 V1.1 2024-10.pdf` and the message payload definitions referenced below are extracted from its tables. All code is TypeScript and uses 2-space indentation. Every new function and class must include docblocks, and all class fields must use `///<` comments. Do not use `private` fields or methods.

Key terms used in this plan:

- Data Object: A 32-bit word that makes up the payload of a Data Message (for example, a PDO or RDO).
- Data Block: A byte array payload in an Extended Message (length is given by the Extended Message Header `dataSize`).
- PDO: Power Data Object used in Source_Capabilities, Sink_Capabilities, and EPR Capabilities messages.
- RDO: Request Data Object used in Request and EPR_Request messages.
- VDO: Vendor Data Object used in Vendor_Defined messages.
- VDM Header: The first 32-bit object in a Vendor_Defined or Vendor_Defined_Extended message.

## Plan of Work

Start by adding a shared parsing module under `src/lib/device/drpd/usb-pd/` that contains bit-extraction helpers, endian-aware 32-bit readers, and parsers for common object types (PDO, APDO, RDO, VDM header, and the standard VDOs used by Structured VDMs). These helpers must accept a raw 32-bit value and return typed objects that include both decoded fields and the original raw value. The goal is to keep message classes small and focused: each class should call the relevant helper for its payload and store the decoded results on public readonly properties.

Next, update each Data Message class in `src/lib/device/drpd/usb-pd/messages/` so the constructor parses its payload using the shared helpers and stores a structured representation. Each class should validate the Number of Data Objects from the Message Header and should keep any remaining bytes as a `rawPayload` slice for diagnostics. When a message allows multiple data objects, decode each in order and preserve the original array of raw 32-bit values.

Then, update each Extended Message class to parse its data block based on the Extended Message Header `dataSize`, `chunked`, and `chunkNumber` fields. Extended Messages must validate that the payload length is at least the size declared by `dataSize` and should store both the decoded block and any trailing bytes. Chunked messages should still be decoded per-chunk but should include the chunk metadata in the class to allow reassembly later.

Finally, add tests for each message type. The tests should build synthetic payloads using SOP bytes + headers + payload data objects or blocks and assert that the decoded properties match the expected field values. At least one test should be added per message class, and more where the message has multiple variants (for example, Fixed vs. Battery vs. APDO PDO types). Tests should live next to the message files (for example `src/lib/device/drpd/usb-pd/messages/SourceCapabilitiesMessage.test.ts`).

## Data Message Payload Definitions

This section defines the field layouts for each data message, based on the USB-PD 3.2 spec tables. All numeric fields are little-endian when read from the payload; bit positions refer to the 32-bit data object after converting from little-endian bytes to a 32-bit unsigned integer.

Source_Capabilities Message (Data Objects = N PDOs, N >= 1). Each PDO uses the generic PDO type selector in bits B31..30: 00b Fixed Supply, 01b Battery, 10b Variable Supply, 11b APDO. Decode using Source PDO layouts below. Preserve the PDO array order.

Sink_Capabilities Message (Data Objects = N PDOs). Same as Source_Capabilities, but decode using Sink PDO layouts below.

Request Message (Data Objects = 1 RDO). The RDO does not include an explicit type; decoding depends on the referenced PDO. Because the parser is message-local, decode the RDO into a union that includes all field interpretations: Fixed/Variable RDO, Battery RDO, PPS RDO, and AVS RDO. Include a `requestTypeHint` field that can be set by future higher-level context, but default it to `unknown` and still fill all possible interpretations so the UI can surface raw values.

Fixed/Variable RDO (32-bit)

| Bits | Field | Notes |
| --- | --- | --- |
| B31..28 | Object Position | 0000b and 1110b..1111b reserved. |
| B27 | Giveback | Deprecated, always 0. |
| B26 | Capability Mismatch | 1 when requested power exceeds offered. |
| B25 | USB Communications Capable | 1 if capable. |
| B24 | No USB Suspend | 1 to request no USB suspend. |
| B23 | Unchunked Extended Messages Supported | 1 if supported. |
| B22 | EPR Capable | 1 if EPR capable. |
| B21..20 | Reserved | Must be zero. |
| B19..10 | Operating Current | 10mA units. |
| B9..0 | Maximum Operating Current | 10mA units; deprecated; set equal to Operating Current. |

Battery RDO (32-bit)

| Bits | Field | Notes |
| --- | --- | --- |
| B31..28 | Object Position | 0000b and 1110b..1111b reserved. |
| B27 | Giveback | Deprecated, always 0. |
| B26 | Capability Mismatch | 1 when requested power exceeds offered. |
| B25 | USB Communications Capable | 1 if capable. |
| B24 | No USB Suspend | 1 to request no USB suspend. |
| B23 | Unchunked Extended Messages Supported | 1 if supported. |
| B22 | EPR Capable | 1 if EPR capable. |
| B21..20 | Reserved | Must be zero. |
| B19..10 | Operating Power | 250mW units. |
| B9..0 | Maximum Operating Power | 250mW units; deprecated; set equal to Operating Power. |

PPS RDO (32-bit)

| Bits | Field | Notes |
| --- | --- | --- |
| B31..28 | Object Position | 0000b and 1110b..1111b reserved. |
| B27 | Reserved | Must be zero. |
| B26 | Capability Mismatch | 1 when requested power exceeds offered. |
| B25 | USB Communications Capable | 1 if capable. |
| B24 | No USB Suspend | 1 to request no USB suspend. |
| B23 | Unchunked Extended Messages Supported | 1 if supported. |
| B22 | EPR Capable | 1 if EPR capable. |
| B21 | Reserved | Must be zero. |
| B20..9 | Output Voltage | 20mV units. |
| B8..7 | Reserved | Must be zero. |
| B6..0 | Operating Current | 50mA units. |

AVS RDO (32-bit)

| Bits | Field | Notes |
| --- | --- | --- |
| B31..28 | Object Position | 0000b and 1110b..1111b reserved. |
| B27 | Reserved | Must be zero. |
| B26 | Capability Mismatch | 1 when requested power exceeds offered. |
| B25 | USB Communications Capable | 1 if capable. |
| B24 | No USB Suspend | 1 to request no USB suspend. |
| B23 | Unchunked Extended Messages Supported | 1 if supported. |
| B22 | EPR Capable | 1 if EPR capable. |
| B21 | Reserved | Must be zero. |
| B20..9 | Output Voltage | 25mV units; least two bits zero (100mV steps). |
| B8..7 | Reserved | Must be zero. |
| B6..0 | Operating Current | 50mA units. |

BIST Message (Data Objects = 1 or 7). Decode the first BIST Data Object and preserve remaining objects as raw when present.

| Bits | Field | Notes |
| --- | --- | --- |
| B31..28 | Mode | 0101b Carrier, 1000b Test Data, 1001b Shared Test Entry, 1010b Shared Test Exit, others reserved. |
| B27..0 | Reserved | Must be zero. |

Battery_Status Message (Data Objects = 1 BSDO)

| Bits | Field | Notes |
| --- | --- | --- |
| B31..16 | Battery Present Capacity | 0.1Wh units; 0xFFFF unknown. |
| B15..8 | Battery Info | bit0 Invalid Battery Reference; bit1 Battery Present; bits3..2 Charging Status (00 charging, 01 discharging, 10 idle, 11 reserved); bits7..4 reserved. |
| B7..0 | Reserved | Must be zero. |

Alert Message (Data Objects = 1 ADO)

| Bits | Field | Notes |
| --- | --- | --- |
| B31..24 | Type of Alert | bit1 Battery Status Change; bit2 OCP; bit3 OTP; bit4 Operating Condition Change; bit5 Source Input Change; bit6 OVP; bit7 Extended Alert Event; others reserved. |
| B23..20 | Fixed Batteries | Bits map to batteries 0..3. |
| B19..16 | Hot Swappable Batteries | Bits map to batteries 4..7. |
| B15..4 | Reserved | Must be zero. |
| B3..0 | Extended Alert Event Type | 0 reserved; 1 power state change; 2 power button press; 3 power button release; 4 controller initiated wake; 5..15 reserved. Valid only when Extended Alert Event bit is 1. |

Get_Country_Info Message (Data Objects = 1 CCDO)

| Bits | Field | Notes |
| --- | --- | --- |
| B31..24 | Country Code char 1 | ASCII. |
| B23..16 | Country Code char 2 | ASCII. |
| B15..0 | Reserved | Must be zero. |

Enter_USB Message (Data Objects = 1 EUDO)

| Bits | Field | Notes |
| --- | --- | --- |
| B31 | Reserved | Must be zero. |
| B30..28 | USB Mode | Values per spec; store as numeric + enum string. |
| B27 | Reserved | Must be zero. |
| B26 | USB4 DRD | 1 if capable. |
| B25 | USB3 DRD | 1 if capable. |
| B24 | Reserved | Must be zero. |
| B23..21 | Cable Speed | Enumerate values per spec. |
| B20..19 | Cable Type | 00 passive, 01 active re-timer, 10 active re-driver, 11 optically isolated. |
| B18..17 | Cable Current | 00 VBUS not supported, 10 3A, 11 5A. |
| B16 | PCIe Support | 1 if supported. |
| B15 | DP Support | 1 if supported. |
| B14 | TBT Support | 1 if supported. |
| B13 | Host Present | 1 if host present. |
| B12..0 | Reserved | Must be zero. |

EPR_Request Message (Data Objects = 2). Data object 0 is an RDO (decode as above). Data object 1 is a copy of the requested PDO; decode it using the Source PDO layouts below and store it as `requestedPdoCopy` with its raw value.

EPR_Mode Message (Data Objects = 1 EPRMDO)

| Bits | Field | Notes |
| --- | --- | --- |
| B31..24 | Action | 0x01 Enter, 0x02 Enter Acknowledged, 0x03 Enter Succeeded, 0x04 Enter Failed, 0x05 Exit; others reserved. |
| B23..16 | Data | For Enter: EPR Sink Operational PDP; for Enter Failed: failure reason code; else zero. |
| B15..0 | Reserved | Must be zero. |

Source_Info Message (Data Objects = 1 SIDO)

| Bits | Field | Notes |
| --- | --- | --- |
| B31 | Port Type | 0 managed, 1 guaranteed. |
| B30..24 | Reserved | Must be zero. |
| B23..16 | Port Maximum PDP | Integer watts. |
| B15..8 | Port Present PDP | Integer watts. |
| B7..0 | Port Reported PDP | Integer watts. |

Revision Message (Data Objects = 1 RMDO)

| Bits | Field | Notes |
| --- | --- | --- |
| B31..28 | Revision.major | 4-bit. |
| B27..24 | Revision.minor | 4-bit. |
| B23..20 | Version.major | 4-bit. |
| B19..16 | Version.minor | 4-bit. |
| B15..0 | Reserved | Must be zero. |

Vendor_Defined Message (Data Objects = 1..7). Data object 0 is the VDM Header. Store remaining VDOs as raw, and decode standard Structured VDM responses where defined.

Unstructured VDM Header (VDM Type = 0)

| Bits | Field | Notes |
| --- | --- | --- |
| B31..16 | SVID | Vendor ID. |
| B15 | VDM Type | 0 = Unstructured. |
| B14..0 | Vendor Payload | Vendor defined. |

Structured VDM Header (VDM Type = 1)

| Bits | Field | Notes |
| --- | --- | --- |
| B31..16 | SVID | Standard or Vendor ID. |
| B15 | VDM Type | 1 = Structured. |
| B14..13 | Structured VDM Version Major | 01b = Version 2.x. |
| B12..11 | Structured VDM Version Minor | 00b = 2.0, 01b = 2.1. |
| B10..8 | Object Position | Used by Enter/Exit/Attention. |
| B7..6 | Command Type | 00 REQ, 01 ACK, 10 NAK, 11 BUSY. |
| B5 | Reserved | Must be zero. |
| B4..0 | Command | 1 Discover Identity, 2 Discover SVIDs, 3 Discover Modes, 4 Enter Mode, 5 Exit Mode, 6 Attention, 16..31 SVID-specific. |

Discover Identity ACK VDOs. Decode in order: ID Header, Cert Stat, Product, and Product Type VDOs.

ID Header VDO (32-bit)

| Bits | Field | Notes |
| --- | --- | --- |
| B31 | USB Host Capable | 1 if capable. |
| B30 | USB Device Capable | 1 if capable. |
| B29..27 | SOP Product Type (UFP) or SOP' product type | Interpret per SOP kind. |
| B26 | Modal Operation Supported | 1 if supported. |
| B25..23 | SOP Product Type (DFP) | Reserved for SOP' and SOP''. |
| B22..21 | Connector Type | 10b receptacle, 11b plug. |
| B20..16 | Reserved | Must be zero. |
| B15..0 | USB Vendor ID | VID. |

Cert Stat VDO (32-bit)

| Bits | Field | Notes |
| --- | --- | --- |
| B31..0 | XID | 32-bit XID. |

Product VDO (32-bit)

| Bits | Field | Notes |
| --- | --- | --- |
| B31..16 | USB Product ID | 16-bit. |
| B15..0 | bcdDevice | 16-bit. |

UFP VDO (32-bit)

| Bits | Field | Notes |
| --- | --- | --- |
| B31..29 | VDO Version | 011b = Version 1.3. |
| B28 | Reserved | Must be zero. |
| B27..24 | Device Capability | Bitfield. |
| B23..22 | Connector Type (Legacy) | Deprecated, must be 00b. |
| B21..11 | Reserved | Must be zero. |
| B10..8 | VCONN Power | When VCONN Required set. |
| B7 | VCONN Required | 1 if required. |
| B6 | VBUS Required | 0 yes, 1 no. |
| B5..3 | Alternate Modes | Bitfield. |
| B2..0 | USB Highest Speed | Encoded speed. |

DFP VDO (32-bit)

| Bits | Field | Notes |
| --- | --- | --- |
| B31..29 | VDO Version | 010b = Version 1.2. |
| B28..27 | Reserved | Must be zero. |
| B26..24 | Host Capability | Bitfield. |
| B23..22 | Connector Type (Legacy) | Must be 00b. |
| B21..5 | Reserved | Must be zero. |
| B4..0 | Port Number | Unique port id. |

Passive Cable VDO (32-bit)

| Bits | Field | Notes |
| --- | --- | --- |
| B31..28 | HW Version | Vendor assigned. |
| B27..24 | FW Version | Vendor assigned. |
| B23..21 | VDO Version | 000b = Version 1.0. |
| B20 | Reserved | Must be zero. |
| B19..18 | Plug to Plug/Captive | 10b Type-C, 11b captive. |
| B17 | EPR Capable | 1 if EPR capable. |
| B16..13 | Cable Latency | Encoded latency. |
| B12..11 | Cable Termination Type | 00 VCONN not required, 01 VCONN required. |
| B10..9 | Maximum VBUS Voltage | 00 20V, 11 50V (01/10 deprecated). |
| B8..7 | Reserved | Must be zero. |
| B6..5 | VBUS Current Handling Capability | 01 3A, 10 5A. |
| B4..3 | Reserved | Must be zero. |
| B2..0 | USB Highest Speed | Encoded speed. |

Active Cable VDO1 (32-bit)

| Bits | Field | Notes |
| --- | --- | --- |
| B31..28 | HW Version | Vendor assigned. |
| B27..24 | FW Version | Vendor assigned. |
| B23..21 | VDO Version | 000b = Version 1.0. |
| B20 | Reserved | Must be zero. |
| B19..18 | Plug to Plug/Captive | 10b Type-C, 11b captive. |
| B17 | EPR Capable | 1 if EPR capable. |
| B16..13 | Cable Latency | Encoded latency. |
| B12..11 | Cable Termination Type | 10b one end active, 11b both ends active. |
| B10..9 | Maximum VBUS Voltage | 00 20V, 11 50V (01/10 deprecated). |
| B8 | SBU Supported | 0 supported, 1 not supported. |
| B7 | SBU Type | 0 passive, 1 active. |
| B6..5 | VBUS Current Handling Capability | 01 3A, 10 5A. |
| B4 | VBUS Through Cable | 1 if VBUS through cable. |
| B3 | SOP'' Controller Present | 1 if present. |
| B2..0 | USB Highest Speed | Encoded speed. |

Active Cable VDO2 (32-bit)

| Bits | Field | Notes |
| --- | --- | --- |
| B31..24 | Maximum Operating Temperature | deg C. |
| B23..16 | Shutdown Temperature | deg C. |
| B15 | Reserved | Must be zero. |
| B14..12 | U3/CLd Power | Encoded. |
| B11 | U3 to U0 transition mode | 0 direct, 1 through U3S. |
| B10 | Physical connection | 0 copper, 1 optical. |
| B9 | Active element | 0 re-driver, 1 re-timer. |
| B8 | USB4 Supported | 0 supported, 1 not supported. |
| B7..6 | USB 2.0 Hub Hops Consumed | Encoded. |
| B5 | USB 2.0 Supported | 0 supported, 1 not supported. |
| B4 | USB 3.2 Supported | 0 supported, 1 not supported. |
| B3 | USB Lanes Supported | 0 one lane, 1 two lanes. |
| B2 | Optically Isolated Active Cable | 1 if yes. |
| B1 | USB4 Asymmetric Mode Supported | 1 if yes. |
| B0 | USB Gen | 0 Gen 1, 1 Gen 2+. |

VPD VDO (32-bit)

| Bits | Field | Notes |
| --- | --- | --- |
| B31..28 | HW Version | Vendor assigned. |
| B27..24 | FW Version | Vendor assigned. |
| B23..21 | VDO Version | 000b = Version 1.0. |
| B20..17 | Reserved | Must be zero. |
| B16..15 | Maximum VBUS Voltage | 00 20V, 01/10/11 deprecated. |
| B14 | Charge Through Current Support | 1 for 5A, 0 for 3A. |
| B13 | Reserved | Must be zero. |
| B12..7 | VBUS Impedance | 2 mOhm units; valid only when Charge Through supported. |
| B6..1 | Ground Impedance | 1 mOhm units; valid only when Charge Through supported. |
| B0 | Charge Through Support | 1 if supported. |

Discover SVIDs ACK. Each VDO contains two SVIDs. Stop decoding when both are 0x0000.

| Bits | Field | Notes |
| --- | --- | --- |
| B31..16 | SVID n | 16-bit. |
| B15..0 | SVID n+1 | 16-bit. |

Discover Modes ACK. Each VDO after the header is an Alternate Mode VDO. If the SVID is a VID, treat VDOs as vendor-defined raw values; if the SVID is a SID with a known standard, store raw values with a `modeIndex` but do not interpret fields unless a standard-specific decoder is added later.

Enter Mode / Exit Mode / Attention. VDOs are optional (Enter Mode may include one VDO). Preserve raw VDOs and record `objectPosition` from the VDM header.

## PDO Layouts

These layouts are used by Source_Capabilities, Sink_Capabilities, and EPR Capabilities messages.

Source Fixed Supply PDO (type 00b)

| Bits | Field | Notes |
| --- | --- | --- |
| B29 | Dual-Role Power | 1 if DRP capable. |
| B28 | USB Suspend Supported | 1 if supported. |
| B27 | Unconstrained Power | 1 if unconstrained. |
| B26 | USB Communications Capable | 1 if supported. |
| B25 | Dual-Role Data | 1 if DRD capable. |
| B24 | Unchunked Extended Messages Supported | 1 if supported. |
| B23 | EPR Capable | 1 if EPR capable. |
| B22 | Reserved | Must be zero. |
| B21..20 | Peak Current | Encoded peak current. |
| B19..10 | Voltage | 50mV units. |
| B9..0 | Maximum Current | 10mA units. |

Source Variable Supply PDO (type 10b)

| Bits | Field | Notes |
| --- | --- | --- |
| B29..20 | Maximum Voltage | 50mV units. |
| B19..10 | Minimum Voltage | 50mV units. |
| B9..0 | Maximum Current | 10mA units. |

Source Battery Supply PDO (type 01b)

| Bits | Field | Notes |
| --- | --- | --- |
| B29..20 | Maximum Voltage | 50mV units. |
| B19..10 | Minimum Voltage | 50mV units. |
| B9..0 | Maximum Power | 250mW units. |

Source APDO (type 11b, APDO type in B29..28)

SPR PPS APDO (00b)

| Bits | Field | Notes |
| --- | --- | --- |
| B27 | PPS Power Limited | 1 if power limited. |
| B26..25 | Reserved | Must be zero. |
| B24..17 | Maximum Voltage | 100mV units. |
| B16 | Reserved | Must be zero. |
| B15..8 | Minimum Voltage | 100mV units. |
| B7 | Reserved | Must be zero. |
| B6..0 | Maximum Current | 50mA units. |

SPR AVS APDO (10b)

| Bits | Field | Notes |
| --- | --- | --- |
| B27..26 | Peak Current | Encoded peak current. |
| B25..20 | Reserved | Must be zero. |
| B19..10 | Max Current 15V | 10mA units. |
| B9..0 | Max Current 20V | 10mA units. |

EPR AVS APDO (01b)

| Bits | Field | Notes |
| --- | --- | --- |
| B27..26 | Peak Current | Encoded peak current. |
| B25..17 | Maximum Voltage | 100mV units. |
| B16 | Reserved | Must be zero. |
| B15..8 | Minimum Voltage | 100mV units. |
| B7..0 | PDP | 1W units. |

Sink Fixed Supply PDO (type 00b)

| Bits | Field | Notes |
| --- | --- | --- |
| B29 | Dual-Role Power | 1 if DRP supported. |
| B28 | Higher Capability | 1 if higher capability. |
| B27 | Unconstrained Power | 1 if unconstrained. |
| B26 | USB Communications Capable | 1 if supported. |
| B25 | Dual-Role Data | 1 if DRD supported. |
| B24..23 | Fast Role Swap required USB Type-C Current | 00 none, 01 default, 10 1.5A@5V, 11 3A@5V. |
| B22..20 | Reserved | Must be zero. |
| B19..10 | Voltage | 50mV units. |
| B9..0 | Operational Current | 10mA units. |

Sink Variable Supply PDO (type 10b)

| Bits | Field | Notes |
| --- | --- | --- |
| B29..20 | Maximum Voltage | 50mV units. |
| B19..10 | Minimum Voltage | 50mV units. |
| B9..0 | Operational Current | 10mA units. |

Sink Battery Supply PDO (type 01b)

| Bits | Field | Notes |
| --- | --- | --- |
| B29..20 | Maximum Voltage | 50mV units. |
| B19..10 | Minimum Voltage | 50mV units. |
| B9..0 | Operational Power | 250mW units. |

Sink APDO (type 11b)

SPR PPS APDO (00b)

| Bits | Field | Notes |
| --- | --- | --- |
| B27..25 | Reserved | Must be zero. |
| B24..17 | Maximum Voltage | 100mV units. |
| B16 | Reserved | Must be zero. |
| B15..8 | Minimum Voltage | 100mV units. |
| B7 | Reserved | Must be zero. |
| B6..0 | Maximum Current | 50mA units. |

SPR AVS APDO (10b)

| Bits | Field | Notes |
| --- | --- | --- |
| B27..20 | Reserved | Must be zero. |
| B19..10 | Max Current 15V | 10mA units. |
| B9..0 | Max Current 20V | 10mA units. |

EPR AVS APDO (01b)

| Bits | Field | Notes |
| --- | --- | --- |
| B27..26 | Reserved | Must be zero. |
| B25..17 | Maximum Voltage | 100mV units. |
| B16 | Reserved | Must be zero. |
| B15..8 | Minimum Voltage | 100mV units. |
| B7..0 | PDP | 1W units. |

## Extended Message Payload Definitions

Each Extended Message includes an Extended Message Header (already parsed by `Header`) and a data block of length `dataSize`. The class should decode fields only from the first `dataSize` bytes, even if extra payload bytes are present.

Source_Capabilities_Extended Message (SCEDB, 25 bytes)

| Offset (Byte) | Field | Notes |
| --- | --- | --- |
| 0 | VID | uint16. |
| 2 | PID | uint16. |
| 4 | XID | uint32. |
| 8 | FW Version | uint8. |
| 9 | HW Version | uint8. |
| 10 | Voltage Regulation | Bitfield. |
| 11 | Holdup Time | uint8 ms. |
| 12 | Compliance | Bitfield. |
| 13 | Touch Current | Bitfield. |
| 14 | Peak Current 1 | Bitfield. |
| 16 | Peak Current 2 | Bitfield. |
| 18 | Peak Current 3 | Bitfield. |
| 20 | Touch Temp | uint8 enum. |
| 21 | Source Inputs | Bitfield. |
| 22 | Number of Batteries/Battery Slots | Upper nibble hot swappable count, lower nibble fixed count. |
| 23 | SPR Source PDP Rating | Bits 0..6. |
| 24 | EPR Source PDP Rating | Bits 0..7. |

Status Message. Select layout by SOP kind.

SOP Status Data Block (SDB, 7 bytes)

| Offset (Byte) | Field | Notes |
| --- | --- | --- |
| 0 | Internal Temp | deg C, 0 unsupported. |
| 1 | Present Input | Bitfield. |
| 2 | Present Battery Input | Upper nibble hot swappable, lower nibble fixed, valid when Present Input bit3 set. |
| 3 | Event Flags | Bitfield. |
| 4 | Temperature Status | Bitfield. |
| 5 | Power Status | Bitfield. |
| 6 | Power State Change | Bitfield with new power state and indicator. |

SOP'/SOP'' Status Data Block (SPDB, 2 bytes)

| Offset (Byte) | Field | Notes |
| --- | --- | --- |
| 0 | Internal Temp | deg C, 0 unsupported. |
| 1 | Flags | bit0 Thermal Shutdown; bits1..7 reserved. |

Get_Battery_Cap Message (GBCDB, 1 byte)

| Offset (Byte) | Field | Notes |
| --- | --- | --- |
| 0 | Battery Cap Ref | 0..3 fixed, 4..7 hot swappable. |

Get_Battery_Status Message (GBSDB, 1 byte)

| Offset (Byte) | Field | Notes |
| --- | --- | --- |
| 0 | Battery Status Ref | 0..3 fixed, 4..7 hot swappable. |

Battery_Capabilities Message (BCDB, 9 bytes)

| Offset (Byte) | Field | Notes |
| --- | --- | --- |
| 0 | VID | uint16. |
| 2 | PID | uint16. |
| 4 | Battery Design Capacity | uint16, 0.1Wh units; 0x0000 not present; 0xFFFF unknown. |
| 6 | Battery Last Full Charge Capacity | uint16, 0.1Wh units; 0x0000 not present; 0xFFFF unknown. |
| 8 | Battery Type | Bit0 Invalid Battery Reference; bits1..7 reserved. |

Get_Manufacturer_Info Message (GMIDB, 2 bytes)

| Offset (Byte) | Field | Notes |
| --- | --- | --- |
| 0 | Manufacturer Info Target | 0 Port/Cable Plug, 1 Battery, others reserved. |
| 1 | Manufacturer Info Ref | Battery index when target is Battery; otherwise zero. |

Manufacturer_Info Message (MIDB, 5..26 bytes)

| Offset (Byte) | Field | Notes |
| --- | --- | --- |
| 0 | VID | uint16. |
| 2 | PID | uint16. |
| 4 | Manufacturer String | Null-terminated ASCII; if unsupported, \"Not Supported\". |

Security_Request Message (SRQDB, 4..260 bytes). Treat the block as raw bytes; store `data` and `dataSize`.

Security_Response Message (SRPDB, 4..260 bytes). Same handling as Security_Request.

Firmware_Update_Request Message (FRQDB, 4..260 bytes). Treat as raw bytes per USB PD Firmware Update 1.0.

Firmware_Update_Response Message (FRPDB, 4..260 bytes). Treat as raw bytes per USB PD Firmware Update 1.0.

PPS_Status Message (PPSSDB, 4 bytes)

| Offset (Byte) | Field | Notes |
| --- | --- | --- |
| 0 | Output Voltage | uint16, 20mV units; 0xFFFF unsupported. |
| 2 | Output Current | uint8, 50mA units; 0xFF unsupported. |
| 3 | Real Time Flags | bits1..2 PTF; bit3 OMF. |

Country_Codes Message (CCDB, 4..26 bytes)

| Offset (Byte) | Field | Notes |
| --- | --- | --- |
| 0 | Length | Number of country codes. |
| 1 | Reserved | Must be zero. |
| 2.. | Country Codes | 2 bytes per Alpha-2 code. |

Country_Info Message (CIDB, 4..26 bytes)

| Offset (Byte) | Field | Notes |
| --- | --- | --- |
| 0 | Country Code char 1 | ASCII. |
| 1 | Country Code char 2 | ASCII. |
| 2..3 | Reserved | Must be zero. |
| 4.. | Country Specific Data | 1..22 bytes; preserve raw and ASCII preview when valid. |

Sink_Capabilities_Extended Message (SKEDB, 24 bytes)

| Offset (Byte) | Field | Notes |
| --- | --- | --- |
| 0 | VID | uint16. |
| 2 | PID | uint16. |
| 4 | XID | uint32. |
| 8 | FW Version | uint8. |
| 9 | HW Version | uint8. |
| 10 | SKEDB Version | uint8. |
| 11 | Load Step | Bitfield. |
| 12 | Sink Load Characteristics | uint16 bitfield. |
| 14 | Compliance | Bitfield. |
| 15 | Touch Temp | uint8 enum. |
| 16 | Battery Info | Upper nibble hot swappable count, lower nibble fixed count. |
| 17 | Sink Modes | Bitfield. |
| 18 | SPR Sink Minimum PDP | uint8. |
| 19 | SPR Sink Operational PDP | uint8. |
| 20 | SPR Sink Maximum PDP | uint8. |
| 21 | EPR Sink Minimum PDP | uint8. |
| 22 | EPR Sink Operational PDP | uint8. |
| 23 | EPR Sink Maximum PDP | uint8. |

Extended_Control Message (ECDB, 2 bytes)

| Offset (Byte) | Field | Notes |
| --- | --- | --- |
| 0 | Type | 1 EPR_Get_Source_Cap, 2 EPR_Get_Sink_Cap, 3 EPR_KeepAlive, 4 EPR_KeepAlive_Ack. |
| 1 | Data Byte | Usually zero; preserve raw. |

EPR_Source_Capabilities and EPR_Sink_Capabilities Messages. The Extended data block is a series of PDOs. The first 7 slots are SPR (A)PDOs (zero-filled if fewer); remaining PDOs are EPR (A)PDOs. Decode all 32-bit PDOs and store as `sprPdos` and `eprPdos`. The Extended Header `dataSize` determines how many PDOs are present.

Vendor_Defined_Extended Message (VDEDB). The data block begins with a 4-byte VDM Header with the Unstructured VDM layout (same as Vendor_Defined). The remaining bytes are vendor-defined and must be stored as raw bytes. Expose `svid`, `vdmType`, and `vendorData`.

## Concrete Steps

1) Add a new helper module `src/lib/device/drpd/usb-pd/dataObjects.ts` that provides parsing utilities for 16-bit and 32-bit fields, and typed parsers for PDOs, RDOs, VDM headers, and standard VDOs. Provide docblocks on every function and `///<` comments for exported types.

2) Update each data message class in `src/lib/device/drpd/usb-pd/messages/` to parse its payload. Each class constructor should call `super(...)`, then read the payload from `payloadOffset`, decode the data objects, populate typed properties, and store a `rawPayload` slice. Validate `header.messageHeader.numberOfDataObjects` and throw or mark an error field if the payload is too short.

3) Update each extended message class in `src/lib/device/drpd/usb-pd/messages/` to parse its data block based on `header.extendedHeader.dataSize`. Add fields for `dataSize`, `chunked`, `chunkNumber`, and `requestChunk`, plus parsed `dataBlock` structures. Keep raw data bytes for diagnostics.

4) Add tests per message type under `src/lib/device/drpd/usb-pd/messages/`. Use synthetic payloads with known bit patterns. The tests should:

   - Validate decoding of each PDO type for Source and Sink capabilities.
   - Validate each RDO variant (Fixed/Variable, Battery, PPS, AVS) using constructed data objects.
   - Validate Alert, Battery_Status, BIST, EPR_Mode, Source_Info, Revision, Enter_USB, Get_Country_Info payloads.
   - Validate each Extended Message data block layout (SCEDB, SDB/SPDB, GBCDB, GBSDB, BCDB, GMIDB, MIDB, PPSSDB, CCDB, CIDB, SKEDB, ECDB, EPR Capabilities, VDEDB).
   - Validate Vendor_Defined VDM Header decoding for both structured and unstructured cases and at least one Discover Identity and Discover SVIDs response VDO decode.

## Validation and Acceptance

Run the following in `/Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/frontend`:

  npm test

Acceptance criteria:

- All new tests pass and at least one test per data/extended message type asserts decoded field values.
- For each message class, a decoded instance exposes both raw bytes and the structured fields defined above.
- Extended messages correctly respect the `dataSize` field and do not read beyond it.
- Vendor_Defined messages correctly parse VDM Header and expose VDO arrays, with Structured VDM commands decoded where specified.

## Idempotence and Recovery

All changes are additive and safe to re-run. If a decoding helper or message class change fails a test, revert only the files touched under `src/lib/device/drpd/usb-pd/` and the adjacent test files, then re-run `npm test`. No migrations or destructive operations are required.

## Artifacts and Notes

If you need to re-check the spec tables, the local PDF at `execplans/usb-pd/USB_PD_R3_2 V1.1 2024-10.pdf` contains the relevant tables around pages 138-189 (data messages and VDMs) and pages 216-247 (extended messages). Record any corrections to field layouts in the Decision Log and update this plan accordingly.

## Interfaces and Dependencies

At the end of this plan, the following types and APIs must exist (names are prescriptive, file paths are repo-relative):

In `src/lib/device/drpd/usb-pd/dataObjects.ts`, define parsers such as:

  export interface ParsedDataObject { raw: number }
  export interface FixedSupplyPdo extends ParsedDataObject { ... }
  export interface BatterySupplyPdo extends ParsedDataObject { ... }
  export interface VariableSupplyPdo extends ParsedDataObject { ... }
  export interface SprPpsApdo extends ParsedDataObject { ... }
  export interface SprAvsApdo extends ParsedDataObject { ... }
  export interface EprAvsApdo extends ParsedDataObject { ... }
  export interface RequestDataObject extends ParsedDataObject { ... }
  export interface VdmHeader extends ParsedDataObject { ... }

Include functions like:

  export const parsePdo = (raw: number, context: 'source' | 'sink'): ParsedPdo
  export const parseRdo = (raw: number): ParsedRdo
  export const parseVdmHeader = (raw: number): ParsedVdmHeader
  export const parseDiscoverIdentityVdos = (vdos: number[], sopKind: SOPKind): ParsedDiscoverIdentity

Each message class in `src/lib/device/drpd/usb-pd/messages/` should expose decoded payload properties such as:

  public readonly rawPayload: Uint8Array
  public readonly decodedPayload: <type specific>
  public readonly decodedObjects: <type specific array>

The exact property names should be consistent across messages (for example, use `decodedDataObjects` for data messages and `decodedDataBlock` for extended messages).

Plan update note: Created initial message decoding ExecPlan with per-message payload field definitions and test guidance. (2026-01-30)
Plan update note: Marked implementation complete, captured test results, and recorded decisions/surprises from decoding work. (2026-01-30)
Plan update note: Documented Active Cable VDO2 bit interpretation for support flags and active element. (2026-01-30)
