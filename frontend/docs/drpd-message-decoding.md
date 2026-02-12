# Dr. PD USB-PD Message Decoding Guide

This document explains how USB-PD message decoding is structured in the Dr. PD frontend and how to extend it with message-specific decoding logic.

## Where the USB-PD code lives

All USB-PD parsing code lives under:

- `src/lib/device/drpd/usb-pd/`

Key files:

- `types.ts`: shared types for SOP decoding and header fields.
- `sop.ts`: SOP ordered-set decoding (K-code sequences -> SOP kind).
- `header.ts`: parses Message Header + Extended Message Header.
- `messageBase.ts`: base `Message` class plus `ControlMessage`, `DataMessage`, `ExtendedMessage`.
- `message.ts`: message-type mappings and re-exports of message subclasses.
- `dataObjects.ts`: helpers for parsing PD data objects used by message subclasses.
- `messages/`: per-message subclasses (control messages grouped in one file; data/extended each in their own file).
- `parser.ts`: entry point `parseUSBPDMessage()` and message factory selection.
- `parser.test.ts`: unit tests placed alongside the parser (no `__tests__` folder for USB-PD).

## Payload layout assumptions

The decoded payload (`CapturedMessage.decodedData`) is a byte array that contains:

1) 4 bytes of SOP K-codes (already decoded to 5-bit symbol values, stored as bytes).
2) 2 bytes of Message Header (little-endian).
3) Optional 2 bytes of Extended Message Header if the Message Header `extended` bit is set.
4) Payload bytes (data objects or extended data blocks).
5) CRC bytes may appear at the end but are not consumed by the parser yet.

The SOP bytes are used only to determine SOP kind; the rest of the payload is already decoded into logical header/data bytes (not K-codes).

## SOP decoding

`src/lib/device/drpd/usb-pd/sop.ts` provides:

- `SOP` class: stores raw SOP bytes and decoded `SOPKind`.
- `decodeSOPKind()` and `matchesSOPSequence()` helpers.

K-code numeric values (5-bit 4b5b symbols) used in the firmware and parser:

- Sync-1 = 0b11000 (24, 0x18)
- Sync-2 = 0b10001 (17, 0x11)
- Sync-3 = 0b00110 (6, 0x06)
- RST-1  = 0b00111 (7, 0x07)
- RST-2  = 0b11001 (25, 0x19)

SOP ordered sets decoded in `SOPKind`:

- SOP: Sync-1, Sync-1, Sync-1, Sync-2
- SOP_PRIME: Sync-1, Sync-1, Sync-3, Sync-3
- SOP_DOUBLE_PRIME: Sync-1, Sync-3, Sync-1, Sync-3
- SOP_DEBUG_PRIME: Sync-1, RST-2, RST-2, Sync-3
- SOP_DEBUG_DOUBLE_PRIME: Sync-1, RST-2, Sync-3, Sync-2
- SOP_HARD_RESET: RST-1, RST-1, RST-1, RST-2
- SOP_CABLE_RESET: RST-1, Sync-1, RST-1, Sync-3

If none match, `SOPKind` is `UNKNOWN` and the raw bytes are retained.

## Header parsing

`src/lib/device/drpd/usb-pd/header.ts` parses both headers:

- Message Header (2 bytes, little-endian):
  - Bit 15: Extended
  - Bits 14..12: Number of Data Objects
  - Bits 11..9: Message ID
  - Bit 8: Power Role (SOP) or Cable Plug (SOP_PRIME/SOP_DOUBLE_PRIME)
  - Bits 7..6: Specification Revision bits
  - Bit 5: Data Role (SOP) or reserved (SOP_PRIME/SOP_DOUBLE_PRIME)
  - Bits 4..0: Message Type number

- Extended Message Header (2 bytes, little-endian), only if `Extended == 1`:
  - Bit 15: Chunked
  - Bits 14..11: Chunk Number
  - Bit 10: Request Chunk
  - Bit 9: Reserved
  - Bits 8..0: Data Size

SOP context affects meaning of bit 8/bit 5:

- SOP: `powerRole` and `dataRole` are populated.
- SOP_PRIME/SOP_DOUBLE_PRIME: `cablePlug` is populated, `powerRole`/`dataRole` remain null.

The parsed output is exposed via:

- `Header.messageHeaderRaw`
- `Header.messageHeader` (typed fields)
- `Header.extendedHeaderRaw` / `Header.extendedHeader`

## Message kind classification

`MessageKind` is derived strictly from the Message Header:

- If `extended == true` -> `EXTENDED`
- Else if `numberOfDataObjects == 0` -> `CONTROL`
- Else -> `DATA`

The meaning of the 5-bit Message Type number depends on the `MessageKind` and is mapped via tables in `message.ts`.

## Message classes and mappings

`src/lib/device/drpd/usb-pd/messageBase.ts` defines:

- `Message` base class: holds `sop`, `header`, `payload`, `payloadOffset`, `kind`, `messageTypeNumber`, and `messageTypeName`.
- Base subclasses: `ControlMessage`, `DataMessage`, `ExtendedMessage`.

`src/lib/device/drpd/usb-pd/message.ts` defines the mapping tables and re-exports message subclasses and base classes:

- `CONTROL_MESSAGE_TYPES`
- `DATA_MESSAGE_TYPES`
- `EXTENDED_MESSAGE_TYPES`

Per-message subclasses live in `src/lib/device/drpd/usb-pd/messages/` (CapitalCase filenames):

- `ControlMessages.ts` contains all control message subclasses (e.g., `GoodCRCMessage`, `AcceptMessage`, `SoftResetMessage`).
- Each data/extended message subclass is in its own file (e.g., `RequestMessage.ts`, `StatusMessage.ts`).

Each mapping entry provides:

- `name`: human-readable message type name.
- `messageClass`: class constructor to instantiate.

Unknown or reserved types fall back to `ReservedControlMessage`, `ReservedDataMessage`, or `ReservedExtendedMessage`.

## Parser flow

`src/lib/device/drpd/usb-pd/parser.ts` implements:

- `parseUSBPDMessage(decodedData: Uint8Array): Message`

Flow:

1) Extract 4 SOP bytes and instantiate `SOP`.
2) Parse `Header` from the payload (SOP bytes + headers).
3) Determine `MessageKind` from the header.
4) Lookup Message Type number in the appropriate mapping table.
5) Instantiate the selected class (fallback to reserved class if unknown).

## Tests and sample payloads

Tests are stored next to the code, not in `__tests__` folders:

- `src/lib/device/drpd/usb-pd/parser.test.ts`
- `src/lib/device/drpd/usb-pd/dataObjects.test.ts`
- `src/lib/device/drpd/usb-pd/messages/MessageDecoding.test.ts`

The tests include the sample payloads from the firmware output and assert:

- SOP kind decoding
- Header parsing fields
- Message kind classification
- Message type selection

## How to add message-specific decoding

Each message type has a distinct class in `message.ts`. To add detailed decoding:

1) Identify the message type class (e.g., `RequestMessage`).
2) Add fields to the class for decoded content.
3) Implement a constructor that calls `super(...)` and then parses the payload slice starting at `payloadOffset`.
4) Validate `header.messageHeader.numberOfDataObjects` matches expected object counts.
5) For extended messages, use `header.extendedHeader` to determine `chunked`, `dataSize`, and any chunking behavior.
6) Keep parsing logic isolated to the message class so `parseUSBPDMessage()` remains a thin dispatcher.

Recommended approach when adding decoding:

- Create a small helper module (e.g., `dataObjects.ts`) for shared field parsing.
- Add targeted tests alongside the message file (e.g., `message.test.ts` or `requestMessage.test.ts`).
- Use the sample payload format for new tests: SOP bytes + headers + payload data.
- If a message involves multiple data objects, parse them in order and preserve raw bytes for debugging.

## Notes on Soft Reset vs. Hard Reset

- Hard Reset and Cable Reset are SOP ordered sets, detected in the SOP K-codes.
- Soft Reset is a Control Message Type (message type number 0x0D) and is detected from the Message Header after a normal SOP ordered set.

## Quick reference: entry points

- Parse a payload: `parseUSBPDMessage(decodedData)`
- SOP decoding: `new SOP(decodedData.subarray(0, 4))`
- Header parsing: `new Header(decodedData, sop)`
