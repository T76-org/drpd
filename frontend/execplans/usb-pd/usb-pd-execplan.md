# Add USB-PD Message Parsing for Dr. PD

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

PLANS.md is checked into the repo at `PLANS.md` and this document must be maintained in accordance with it.

## Purpose / Big Picture

After this change, the Dr. PD frontend can take the binary payload stored in `CapturedMessage.decodedData`, parse it as a USB Power Delivery (USB-PD) message, and expose a structured, typed representation of the message header and message-specific fields. This enables the UI and any downstream tooling to show real USB-PD traffic in human-readable form, including whether the message is a control message, data message, or extended message. The behavior is visible by running tests that parse known payloads and by adding a small, local demo that parses a captured message and prints the structured header fields.

## Progress

- [x] (2026-01-29 00:00Z) Created initial ExecPlan, identified spec sections and tables for Message Header and Extended Message Header.
- [x] (2026-01-29 00:05Z) Recorded SOP parsing rule: first four bytes of payload are SOP k-codes.
- [x] (2026-01-29 00:10Z) Added SOP class requirement to decode SOP kind, including reset ordered sets.
- [x] (2026-01-30 00:15Z) Defined the header parsing model and message factory interface, including byte order, validation rules, and error handling.
- [x] (2026-01-30 00:15Z) Implemented header parsing and unit tests for standard and extended headers.
- [x] (2026-01-30 00:15Z) Implemented message base class and per-message subclasses, plus factory selection based on parsed header.
- [x] (2026-01-30 00:15Z) Added representative tests that parse captured payloads into concrete message types.

## Surprises & Discoveries

- Observation: The USB-PD spec tables are on pages 116 and 120 in the local PDF, and are best read by rendering those pages as images for accurate bit positions.
  Evidence: Rendered `execplans/usb-pd/USB_PD_R3_2 V1.1 2024-10.pdf` pages 116 and 120 show Table 6.1 and Table 6.3.

## Decision Log

- Decision: Start with a dedicated `Header` class that can parse both the standard Message Header and the Extended Message Header (if present) before defining message subclasses.
  Rationale: The header fields determine message class selection, payload length interpretation, and the presence of extended data.
  Date/Author: 2026-01-29, Codex
- Decision: Treat the first four bytes of `decodedData` as SOP k-codes, and include an SOP representation as part of the `Message` base class.
  Rationale: The device captures SOP as four bytes of K-codes at the start of the payload; the remaining bytes are already decoded into PD header/message bytes.
  Date/Author: 2026-01-29, Codex
- Decision: Add a dedicated `SOP` class that parses the four SOP K-code bytes and identifies the SOP kind, including Hard Reset and Cable Reset ordered sets.
  Rationale: SOP kind selection affects header semantics and message decoding; reset ordered sets must be surfaced explicitly for downstream handling. Soft Reset is a control message type and is detected from the Message Header, not from SOP K-codes.
  Date/Author: 2026-01-29, Codex

## Outcomes & Retrospective

- Initial plan created; no code changes yet. The next milestone will validate field layouts from the spec and lock down parsing rules.

## Context and Orientation

The Dr. PD frontend is a Vite + React + TypeScript project. Captured USB-PD traffic is represented by `CapturedMessage` in `src/lib/device/drpd/types.ts`. The parser that constructs `CapturedMessage` is in `src/lib/device/drpd/parsers.ts` (`parseCapturedMessage`), which fills `decodedData` with the raw message payload bytes. For USB-PD messages, the first four bytes of `decodedData` are the SOP K-code bytes. The bytes after those four are already decoded into PD header/message bytes (they are not K-codes anymore).

The USB-PD specification referenced for this work is stored locally at `execplans/usb-pd/USB_PD_R3_2 V1.1 2024-10.pdf`. The Message Header and Extended Message Header definitions are in Section 6.2.1.1 and Section 6.2.1.2. The bit-field tables are Table 6.1 (Message Header) on page 116 and Table 6.3 (Extended Message Header) on page 120.

Key terms used in this plan:

- Message Header: the 16-bit header present in every USB-PD message. It describes message category and routing roles.
- Extended Message Header: the optional 16-bit header that immediately follows the Message Header when the Message Header “Extended” bit is set.
- SOP* packet: Start-of-Packet variants in USB-PD (SOP, SOP’, SOP’’). These determine which header fields are valid (for example, Cable Plug vs. Port Power Role).

## Plan of Work

First, document the precise bit layout for the Message Header and Extended Message Header directly inside this ExecPlan so the implementation can proceed without re-opening the spec. The Message Header is 16 bits; the Extended Message Header is 16 bits and only present when the “Extended” bit in the Message Header is set. Use the spec tables as the source of truth and capture a plain-language summary of each field, including the valid SOP packet types for each field. Remember that the parser must skip the first four SOP bytes before reading the Message Header.

Next, define a parsing model in TypeScript under `src/lib/device/drpd/usb-pd/` (new folder) that includes:

- A `SOP` class that takes the first four K-code bytes, validates them, and decodes a `SOPKind` enum that includes SOP, SOP’, SOP’’, SOP Debug variants, Hard Reset, and Cable Reset (as the device encodes them). Soft Reset is a control message type and is detected from the Message Header, not the SOP K-codes.
- A `Header` class with a constructor that accepts a 16-bit header value and the `SOP` instance (or its decoded kind), and extracts all Message Header fields. If the Message Header indicates an extended message, it should additionally parse the Extended Message Header from the next 16 bits of the payload.
- A `Message` base class that stores the `SOP` instance, the raw payload bytes, a parsed `Header`, and exposes helper accessors for common properties like message type, number of data objects, and whether the payload is extended.
- A factory function `parseUSBPDMessage(decodedData: Uint8Array): Message` that reads the SOP k-codes from the first four bytes, parses the header from the remaining bytes, and returns an instance of the appropriate `Message` subclass.

Then, create concrete subclasses for message categories (control, data, extended) as placeholders, and define per-message-type subclasses as the spec requires. The first milestone should fully support parsing header fields and payload length, even if message-specific fields are stubbed.

Finally, add unit tests that feed known header values and short payloads into the parser and verify that the parsed fields match the spec. Include tests for:

- Standard Message Header parsing for SOP packets.
- SOP’/SOP’’ header field differences (Cable Plug vs. Port Power Role, reserved bits).
- Extended message parsing with correct extraction of Extended Message Header fields.

## Concrete Steps

1) Open and confirm the Message Header table (Table 6.1) and Extended Message Header table (Table 6.3) from the local PDF.

   - Working directory: `/Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/frontend`
   - Command (example):

     python3 - <<'PY'
     import pdfplumber
     path='execplans/usb-pd/USB_PD_R3_2 V1.1 2024-10.pdf'
     for page_num in (116, 120):
         with pdfplumber.open(path) as pdf:
             page=pdf.pages[page_num-1]
             page.to_image(resolution=150).save(f'/tmp/pd_page{page_num}.png')
             print(f'Wrote /tmp/pd_page{page_num}.png')
     PY

   - Expected output (example):

     Wrote /tmp/pd_page116.png
     Wrote /tmp/pd_page120.png

2) Copy the bit layout into this plan and confirm the field mapping below is correct. This is the mapping intended for implementation, pending verification against the rendered tables:

   - Message Header (16 bits, MSB = bit 15):
     - Bit 15: Extended (0 = control/data message, 1 = extended message)
     - Bits 14..12: Number of Data Objects (0..7)
     - Bits 11..9: Message ID (0..7)
     - Bit 8: Port Power Role for SOP packets (0 = Source, 1 = Sink) or Cable Plug for SOP’/SOP’’ packets (0 = from DFP/UFP, 1 = from cable plug or VPD)
     - Bits 7..6: Specification Revision (2-bit value)
     - Bit 5: Port Data Role for SOP packets (0 = DFP, 1 = UFP) or Reserved for SOP’/SOP’’ packets
     - Bits 4..0: Message Type (5-bit value)

   - Extended Message Header (16 bits, MSB = bit 15), only present when Message Header Extended bit = 1:
     - Bit 15: Chunked (0 = unchunked, 1 = chunked)
     - Bits 14..11: Chunk Number (0..9)
     - Bit 10: Request Chunk (1 = request, 0 = response)
     - Bit 9: Reserved (must be 0)
     - Bits 8..0: Data Size (0..511 bytes)

3) Create the new module folder and type definitions:

   - Add `src/lib/device/drpd/usb-pd/types.ts` for header types, enums, and helper interfaces.
   - Add `src/lib/device/drpd/usb-pd/header.ts` for `Header` parsing logic.
   - Add `src/lib/device/drpd/usb-pd/message.ts` for the base `Message` class and message-type mappings.
   - Add `src/lib/device/drpd/usb-pd/messages/` for per-message subclasses (control messages grouped in one file; data and extended messages each in their own file).
   - Add `src/lib/device/drpd/usb-pd/parser.ts` for the factory function that consumes `decodedData` and SOP bytes.

4) Implement `Header` parsing:

   - Accept raw bytes and read the first 2 bytes after the SOP bytes as the Message Header using little-endian (least significant byte first), matching how PD payloads are stored in `decodedData`.
   - Extract fields using bit masks and shifts per the mapping above.
   - When `extended` is true, read the next 2 bytes and parse the Extended Message Header fields.
   - Expose both raw values and decoded flags in the `Header` instance.
   - Enforce basic validation (for example, if `extended` is false, there must not be enough payload for an extended header, and if `extended` is true, the extended header must exist).

5) Implement `Message` and subclasses:

   - `Message` stores `sopBytes`, `header`, raw payload, and a computed offset where the message payload begins (2 bytes for non-extended, 4 bytes for extended), offset by the four SOP bytes.
   - `ControlMessage`, `DataMessage`, and `ExtendedMessage` subclasses are introduced to make behavior clear and enable future per-message parsing. Initially they can simply expose their payload slices.

6) Implement the factory function in `parser.ts`:

   - Construct a `SOP` instance from the first four bytes of `decodedData` and store it on the `Message` base class.
   - Parse the `Header` beginning immediately after those SOP bytes.
   - Use the Message Type and Extended bit to return a specific subclass.
   - For now, map all message types to their high-level class, leaving per-message decoding to later milestones.

7) Add tests alongside the files they cover (do not use a `__tests__` directory for USB-PD files):

   - `src/lib/device/drpd/usb-pd/header.test.ts`: validate bit extraction for Message Header and Extended Message Header.
   - `src/lib/device/drpd/usb-pd/parser.test.ts`: validate that the factory returns the correct class and offsets for control, data, and extended messages.
   - Add test vectors using the sample payloads below to validate SOP decoding, header fields, message kind classification, and message type decoding.

## Validation and Acceptance

Run `npm test` and confirm all existing tests pass. The new tests should fail before implementation and pass afterward. Additionally, run a small TypeScript snippet or add a temporary test that parses a known `decodedData` byte array and logs the parsed header fields. Acceptance is achieved when:

- A non-extended message yields a `Header` with `extended = false` and no extended header fields.
- An extended message yields a `Header` with `extended = true` and populated `chunked`, `chunkNumber`, `requestChunk`, and `dataSize` values.
- The parser returns `ControlMessage`, `DataMessage`, or `ExtendedMessage` according to the Message Type and Extended bit.

## Idempotence and Recovery

All steps are additive. Re-running tests and re-generating the temporary spec images is safe and does not modify the repository. If any implementation step fails, revert only the files created in `src/lib/device/drpd/usb-pd/` and remove the related tests; do not touch unrelated files.

## Artifacts and Notes

- Rendered spec pages for verification (not committed):
  /tmp/pd_page116.png (Message Header table)
  /tmp/pd_page120.png (Extended Message Header table)

## Interfaces and Dependencies

The implementation should introduce the following TypeScript interfaces and classes (names are prescriptive):

- `src/lib/device/drpd/usb-pd/types.ts`
  - `export type SOPKind = 'SOP' | 'SOP_PRIME' | 'SOP_DOUBLE_PRIME' | 'SOP_DEBUG_PRIME' | 'SOP_DEBUG_DOUBLE_PRIME' | 'SOP_HARD_RESET' | 'SOP_CABLE_RESET' | 'UNKNOWN'`
  - `export interface MessageHeaderFields` with fields for `extended`, `numberOfDataObjects`, `messageId`, `specRevision`, `messageType`, and the SOP-dependent role fields.
  - `export interface ExtendedMessageHeaderFields` with fields for `chunked`, `chunkNumber`, `requestChunk`, and `dataSize`.

- `src/lib/device/drpd/usb-pd/sop.ts`
  - `export class SOP` with a constructor `(sopBytes: Uint8Array)` and a `kind: SOPKind` plus access to raw bytes.

- `src/lib/device/drpd/usb-pd/header.ts`
  - `export class Header` with a constructor `(payload: Uint8Array, sop: SOP)` and getters for all parsed fields. It should expose `messageHeaderRaw` and `extendedHeaderRaw` numeric values.

- `src/lib/device/drpd/usb-pd/messageBase.ts`
  - `export class Message` with fields for `sop`, `header`, `payload`, and `payloadOffset`.
  - `export class ControlMessage extends Message`
  - `export class DataMessage extends Message`
  - `export class ExtendedMessage extends Message`

- `src/lib/device/drpd/usb-pd/message.ts`
  - Message type mapping tables for control/data/extended kinds and re-exports of message subclasses.

- `src/lib/device/drpd/usb-pd/messages/` (CapitalCase filenames)
  - `ControlMessages.ts` includes all control message subclasses.
  - Each data and extended message subclass lives in its own file (e.g. `RequestMessage.ts`, `StatusMessage.ts`).

- `src/lib/device/drpd/usb-pd/parser.ts`
  - `export const parseUSBPDMessage = (decodedData: Uint8Array): Message`

Note: the SOP K-code mapping is device-specific and must be defined from the first four bytes of `decodedData`. Define the K-code patterns in `SOP` so it can classify SOP vs. SOP’/SOP’’/debug plus Hard Reset and Cable Reset patterns. Soft Reset is not an SOP ordered set; it is detected from the Message Header as a control message type.

## SOP Ordered-Set Decoding Values

The first four bytes of `decodedData` are K-code bytes that form a Start-of-Packet ordered set or reset ordered set. Decode these four bytes into `SOPKind` by matching this exact 4-byte sequence (byte 0..3):

- K-code numeric values (5-bit 4b5b symbols from firmware): Sync-1 = 0b11000 (24, 0x18), Sync-2 = 0b10001 (17, 0x11), Sync-3 = 0b00110 (6, 0x06), RST-1 = 0b00111 (7, 0x07), RST-2 = 0b11001 (25, 0x19).
- SOP: Sync-1, Sync-1, Sync-1, Sync-2 (Table 5.5, page 84)
- SOP’: Sync-1, Sync-1, Sync-3, Sync-3 (Table 5.6, page 85)
- SOP’’: Sync-1, Sync-3, Sync-1, Sync-3 (Table 5.7, page 85)
- SOP’_Debug: Sync-1, RST-2, RST-2, Sync-3 (Table 5.8, page 86)
- SOP’’_Debug: Sync-1, RST-2, Sync-3, Sync-2 (Table 5.9, page 86)
- Hard Reset: RST-1, RST-1, RST-1, RST-2 (Table 5.11, page 89)
- Cable Reset: RST-1, Sync-1, RST-1, Sync-3 (Table 5.12, page 90)

Example byte encoding (regular SOP): [0x18, 0x18, 0x18, 0x11] for Sync-1, Sync-1, Sync-1, Sync-2.

If none match exactly, classify as `UNKNOWN` and keep the raw bytes for diagnostics.

## Message Type Classification Rules

USB-PD uses a single 5-bit Message Type field (Message Header bits 4..0), but the meaning of those 5 bits depends on which of the three message kinds the payload represents. The kind is derived only from the Message Header (and, for Extended Messages, the Extended Message Header presence).

Apply these rules in order when parsing a payload:

- Step 1: Read the Message Header (after the 4 SOP bytes) and extract:
  - Extended (bit 15)
  - Number of Data Objects (bits 14..12)
  - Message Type (bits 4..0)
- Step 2: Determine message kind:
  - If Extended == 1, the message is an Extended Message. The 5-bit Message Type must be decoded using the Extended Message Types table. The Extended Message Header immediately follows the Message Header.
  - Else if Number of Data Objects == 0, the message is a Control Message. The 5-bit Message Type must be decoded using the Control Message Types table.
  - Else (Extended == 0 and Number of Data Objects > 0), the message is a Data Message. The 5-bit Message Type must be decoded using the Data Message Types table.
- Step 3: If the Extended Message Type is Extended_Control, the payload begins with an Extended Control Data Block (ECDB) whose Type field selects the Extended Control subtype. This does not change the message kind (it remains Extended), but it is the rule for selecting the Extended Control subtype.

These classification rules are sufficient to determine which of the three message kinds a payload represents, and which table to use for decoding the 5-bit Message Type.

## Sample Payload Test Vectors

Use these sample payloads (captured from Dr. PD firmware output) as unit test vectors. Each payload is the raw `decodedData` byte array (SOP K-codes first), followed by the expected parsed fields. These are suitable for `parser.test.ts` and `header.test.ts`.

### Sample 1: SOP' GoodCRC Control Message

- Raw data bytes (10 bytes): `18 18 06 06 01 01 28 13 C5 2F`
- SOP bytes: `18 18 06 06` (SOP')
- Message Header bytes (little-endian): `01 01` => raw header `0x0101`
- Expected header fields:
  - extended: false
  - numberOfDataObjects: 0
  - messageId: 0
  - messageType: GoodCRC (0x01)
  - messageKind: Control
  - specificationRevision: 1.0 (as decoded by firmware output)
  - cablePlug: UFP/DFP (SOP' context)
- Expected SOP kind: SOP_PRIME

### Sample 2: SOP Request Data Message (1 data object)

- Raw data bytes (14 bytes): `18 18 18 11 82 10 2C B1 04 11 A5 E2 FE A2`
- SOP bytes: `18 18 18 11` (SOP)
- Message Header bytes (little-endian): `82 10` => raw header `0x1082`
- Expected header fields:
  - extended: false
  - numberOfDataObjects: 1
  - messageId: 0
  - messageType: Request (0x02)
  - messageKind: Data
  - powerRole: Sink
  - dataRole: UFP
  - specificationRevision: 3.x (as decoded by firmware output)
- Expected SOP kind: SOP
- Data Object bytes (little-endian): `2C B1 04 11` => raw RDO `0x1104B12C` (include as a sanity check, even if detailed RDO parsing is out of scope)

### Sample 3: SOP Accept Control Message

- Raw data bytes (10 bytes): `18 18 18 11 A3 03 6F AC FA 5D`
- SOP bytes: `18 18 18 11` (SOP)
- Message Header bytes (little-endian): `A3 03` => raw header `0x03A3`
- Expected header fields:
  - extended: false
  - numberOfDataObjects: 0
  - messageId: 1
  - messageType: Accept (0x03)
  - messageKind: Control
  - powerRole: Source
  - dataRole: DFP
  - specificationRevision: 3.x (as decoded by firmware output)
- Expected SOP kind: SOP

## Message Type Enumerations (5-bit Message Type Field)

The following lists enumerate every defined 5-bit Message Type for each message kind. Any values marked “Reserved” must still be parsed and preserved, but should be labeled as reserved/unknown in the decoded output.

### Control Message Types (Table 6.5, page 128)

- 0b00000: Reserved
- 0b00001: GoodCRC
- 0b00010: GotoMin (Deprecated)
- 0b00011: Accept
- 0b00100: Reject
- 0b00101: Ping (Deprecated)
- 0b00110: PS_RDY
- 0b00111: Get_Source_Cap
- 0b01000: Get_Sink_Cap
- 0b01001: DR_Swap
- 0b01010: PR_Swap
- 0b01011: VCONN_Swap
- 0b01100: Wait
- 0b01101: Soft_Reset
- 0b01110: Data_Reset
- 0b01111: Data_Reset_Complete
- 0b10000: Not_Supported
- 0b10001: Get_Source_Cap_Extended
- 0b10010: Get_Status
- 0b10011: FR_Swap
- 0b10100: Get_PPS_Status
- 0b10101: Get_Country_Codes
- 0b10110: Get_Sink_Cap_Extended
- 0b10111: Get_Source_Info
- 0b11000: Get_Revision
- 0b11001..0b11111: Reserved

### Data Message Types (Table 6.6, page 138)

- 0b00000: Reserved
- 0b00001: Source_Capabilities
- 0b00010: Request
- 0b00011: BIST
- 0b00100: Sink_Capabilities
- 0b00101: Battery_Status
- 0b00110: Alert
- 0b00111: Get_Country_Info
- 0b01000: Enter_USB
- 0b01001: EPR_Request
- 0b01010: EPR_Mode
- 0b01011: Source_Info
- 0b01100: Revision
- 0b01101..0b01110: Reserved
- 0b01111: Vendor_Defined
- 0b10000..0b11111: Reserved

### Extended Message Types (Table 6.53, page 215)

- 0b00000: Reserved
- 0b00001: Source_Capabilities_Extended
- 0b00010: Status
- 0b00011: Get_Battery_Cap
- 0b00100: Get_Battery_Status
- 0b00101: Battery_Capabilities
- 0b00110: Get_Manufacturer_Info
- 0b00111: Manufacturer_Info
- 0b01000: Security_Request
- 0b01001: Security_Response
- 0b01010: Firmware_Update_Request
- 0b01011: Firmware_Update_Response
- 0b01100: PPS_Status
- 0b01101: Country_Info
- 0b01110: Country_Codes
- 0b01111: Sink_Capabilities_Extended
- 0b10000: Extended_Control
- 0b10001: EPR_Source_Capabilities
- 0b10010: EPR_Sink_Capabilities
- 0b10011..0b11101: Reserved
- 0b11110: Vendor_Defined_Extended
- 0b11111: Reserved

---

Plan update note: Added message kind classification rules and enumerated all control, data, and extended message types from the spec tables to guide decoding. (2026-01-29)
Plan update note: Switched to SOP uppercase naming and added explicit SOP ordered-set decoding values. Clarified that Soft Reset is a control message, not a SOP ordered set. (2026-01-29)
Plan update note: Implemented USB-PD header/message parsing and added unit tests using the provided sample payloads. (2026-01-30)
Plan update note: Moved message subclasses into `usb-pd/messages`, keeping control messages in one file and other message types one per file. (2026-01-30)
