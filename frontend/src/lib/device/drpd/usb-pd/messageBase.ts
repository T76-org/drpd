import type { MessageKind } from './types'
import { Header } from './header'
import { SOP } from './sop'
import { HumanReadableField, type HumanReadableMetadataRoot } from './humanReadableField'

const SOP_LENGTH = 4
const MESSAGE_HEADER_LENGTH = 2
const EXTENDED_HEADER_LENGTH = 2
const CRC_LENGTH = 4
const USB_PD_BMC_CARRIER_KHZ = 300
const USB_PD_BMC_TOLERANCE = 0.1

const formatMicroseconds = (valueUs: number | bigint): string => valueUs.toString()

const formatKilohertz = (valueKhz: number): string => {
  if (!Number.isFinite(valueKhz)) {
    return 'Unavailable'
  }
  return `${Math.trunc(valueKhz)} kHz`
}

const formatHex32 = (value: number | null): string =>
  value === null ? 'Unavailable' : `0x${value.toString(16).toUpperCase().padStart(8, '0')}`

const formatHex16 = (value: number): string => `0x${value.toString(16).toUpperCase().padStart(4, '0')}`

const formatSOPType = (kind: SOP['kind']): string => {
  switch (kind) {
    case 'SOP':
      return 'SOP'
    case 'SOP_PRIME':
      return 'SOP\''
    case 'SOP_DOUBLE_PRIME':
      return 'SOP\'\''
    case 'SOP_DEBUG_PRIME':
      return 'SOP Debug\''
    case 'SOP_DEBUG_DOUBLE_PRIME':
      return 'SOP Debug\'\''
    case 'SOP_HARD_RESET':
      return 'Hard Reset'
    case 'SOP_CABLE_RESET':
      return 'Cable Reset'
    default:
      return 'Unknown'
  }
}

const formatExtendedBit = (extended: boolean): string =>
  extended ? 'Extended Message (1b)' : 'Not Extended (0b)'

const formatPortPowerRole = (roleBit: number): string =>
  roleBit === 1 ? 'Source (1b)' : 'Sink (0b)'

const formatCablePlug = (cablePlugBit: number): string =>
  cablePlugBit === 1
    ? 'Message originated from a Cable Plug or VPD (1b)'
    : 'Message originated from a DFP or UFP (0b)'

const formatSpecificationRevision = (specRevisionBits: number): string => {
  switch (specRevisionBits) {
    case 0b00:
      return 'Revision 1.0 (00b)'
    case 0b01:
      return 'Revision 2.0 (01b)'
    case 0b10:
      return 'Revision 3.x (10b)'
    default:
      return 'Reserved (11b)'
  }
}

const formatPortDataRole = (dataRoleBit: number): string =>
  dataRoleBit === 1 ? 'DFP (1b)' : 'UFP (0b)'

const formatReservedBit = (bit: number): string => `0b${bit}`

const formatMessageType = (messageTypeName: string, messageTypeNumber: number): string =>
  `${messageTypeName} (0x${messageTypeNumber.toString(16).toUpperCase().padStart(2, '0')})`

const USB_PD_MESSAGE_REFERENCES: Record<string, string> = {
  GoodCRC: 'Section 6.3.1 - GoodCRC Message',
  GotoMin: 'Section 6.3.2 - GotoMin Message (Deprecated)',
  Accept: 'Section 6.3.3 - Accept Message',
  Reject: 'Section 6.3.4 - Reject Message',
  Ping: 'Section 6.3.5 - Ping Message',
  PS_RDY: 'Section 6.3.6 - PS_RDY Message',
  Get_Source_Cap: 'Section 6.3.7 - Get_Source_Cap Message',
  Get_Sink_Cap: 'Section 6.3.8 - Get_Sink_Cap Message',
  DR_Swap: 'Section 6.3.9 - DR_Swap Message',
  PR_Swap: 'Section 6.3.10 - PR_Swap Message',
  VCONN_Swap: 'Section 6.3.11 - VCONN_Swap Message',
  Wait: 'Section 6.3.12 - Wait Message',
  Soft_Reset: 'Section 6.3.13 - Soft Reset Message',
  Data_Reset: 'Section 6.3.14 - Data_Reset Message',
  Data_Reset_Complete: 'Section 6.3.15 - Data_Reset_Complete Message',
  Not_Supported: 'Section 6.3.16 - Not_Supported Message',
  Get_Source_Cap_Extended: 'Section 6.3.17 - Get_Source_Cap_Extended Message',
  Get_Status: 'Section 6.3.18 - Get_Status Message',
  FR_Swap: 'Section 6.3.19 - FR_Swap Message',
  Get_PPS_Status: 'Section 6.3.20 - Get_PPS_Status Message',
  Get_Country_Codes: 'Section 6.3.21 - Get_Country_Codes',
  Get_Sink_Cap_Extended: 'Section 6.3.22 - Get_Sink_Cap_Extended Message',
  Get_Source_Info: 'Section 6.3.23 - Get_Source_Info Message',
  Get_Revision: 'Section 6.3.24 - Get_Revision Message',
  Source_Capabilities: 'Section 6.4.1 - Capabilities Message',
  Sink_Capabilities: 'Section 6.4.1 - Capabilities Message',
  Request: 'Section 6.4.2 - Request Message',
  BIST: 'Section 6.4.3 - BIST Message',
  Vendor_Defined: 'Section 6.4.4 - Vendor Defined Message',
  Battery_Status: 'Section 6.4.5 - Battery_Status Message',
  Alert: 'Section 6.4.6 - Alert Message',
  Get_Country_Info: 'Section 6.4.7 - Get_Country_Info Message',
  Enter_USB: 'Section 6.4.8 - Enter_USB Message',
  EPR_Request: 'Section 6.4.9 - EPR_Request Message',
  EPR_Mode: 'Section 6.4.10 - EPR_Mode Message',
  Source_Info: 'Section 6.4.11 - Source_Info Message',
  Revision: 'Section 6.4.12 - Revision Message',
  Source_Capabilities_Extended: 'Section 6.5.1 - Source_Capabilities_Extended Message',
  Status: 'Section 6.5.2 - Status Message',
  Get_Battery_Cap: 'Section 6.5.3 - Get_Battery_Cap Message',
  Get_Battery_Status: 'Section 6.5.4 - Get_Battery_Status Message',
  Battery_Capabilities: 'Section 6.5.5 - Battery_Capabilities Message',
  Get_Manufacturer_Info: 'Section 6.5.6 - Get_Manufacturer_Info Message',
  Manufacturer_Info: 'Section 6.5.7 - Manufacturer_Info Message',
  Security_Request: 'Section 6.5.8 - Security Messages',
  Security_Response: 'Section 6.5.8 - Security Messages',
  Firmware_Update_Request: 'Section 6.5.9 - Firmware Update Messages',
  Firmware_Update_Response: 'Section 6.5.9 - Firmware Update Messages',
  PPS_Status: 'Section 6.5.10 - PPS_Status Message',
  Country_Codes: 'Section 6.5.11 - Country_Codes Message',
  Country_Info: 'Section 6.5.12 - Country_Info Message',
  Sink_Capabilities_Extended: 'Section 6.5.13 - Sink_Capabilities_Extended Message',
  Extended_Control: 'Section 6.5.14 - Extended_Control Message',
  EPR_Source_Capabilities: 'Section 6.5.15 - EPR Capabilities Message',
  EPR_Sink_Capabilities: 'Section 6.5.15 - EPR Capabilities Message',
  Vendor_Defined_Extended: 'Section 6.5.16 - Vendor_Defined_Extended Message',
}

const getUSBPDReference = (messageKind: MessageKind, messageTypeName: string): string => {
  if (messageTypeName === 'Reserved') {
    switch (messageKind) {
      case 'CONTROL':
        return 'Section 6.3 - Control Message'
      case 'DATA':
        return 'Section 6.4 - Data Message'
      case 'EXTENDED':
        return 'Section 6.5 - Extended Message'
    }
  }
  return USB_PD_MESSAGE_REFERENCES[messageTypeName] ?? 'USB-PD 3.2 section reference unavailable'
}

const formatChunked = (chunked: boolean): string =>
  chunked ? 'Chunked (1b)' : 'Unchunked (0b)'

const formatRequestChunk = (requestChunk: boolean): string =>
  requestChunk ? 'Chunk Request (1b)' : 'Chunk Data/Response (0b)'

const formatDataSize = (dataSize: number): string => `${dataSize} bytes`

const computeCRC32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

const computeBMCCarrierFrequencyKhz = (pulseWidthsNs: Float64Array): number => {
  if (pulseWidthsNs.length <= 96) {
    return Number.NaN
  }

  let preambleClockSeconds = 0
  let messageClockSeconds = 0

  for (let index = 0; index < pulseWidthsNs.length; index += 1) {
    const pulseLengthSeconds = pulseWidthsNs[index] / 1_000_000_000

    if (index < 96) {
      preambleClockSeconds += index % 3 === 0 ? pulseLengthSeconds * 2 : pulseLengthSeconds
      if (index === 95) {
        preambleClockSeconds /= 96
      }
      continue
    }

    if (pulseLengthSeconds > (preambleClockSeconds * 2) / 3) {
      messageClockSeconds += pulseLengthSeconds
    } else {
      messageClockSeconds += pulseLengthSeconds * 2
    }
  }

  messageClockSeconds /= pulseWidthsNs.length - 96
  if (!Number.isFinite(messageClockSeconds) || messageClockSeconds <= 0) {
    return Number.NaN
  }

  return (1 / messageClockSeconds) / 1000
}

/**
 * Constructor signature for message classes.
 */
export type MessageClass = new (
  sop: SOP,
  header: Header,
  payload: Uint8Array,
  messageTypeName: string,
) => Message

/**
 * Base class for all USB-PD messages.
 */
export class Message {
  ///< SOP metadata for the message.
  public readonly sop: SOP
  ///< Parsed header for the message.
  public readonly header: Header
  ///< Raw payload bytes including SOP and headers.
  public readonly payload: Uint8Array
  ///< Raw captured frame bytes including SOP and any fragment-local CRC.
  public capturePayload: Uint8Array
  ///< Offset where the message payload begins (after SOP and headers).
  public readonly payloadOffset: number
  ///< Message kind derived from the header.
  public readonly kind: MessageKind
  ///< Message type number from the header.
  public readonly messageTypeNumber: number
  ///< Human-readable message type name.
  public readonly messageTypeName: string
  ///< Pulse widths in nanoseconds.
  public pulseWidthsNs: Float64Array
  ///< Optional device capture start timestamp in microseconds.
  public startTimestampUs: bigint | null
  ///< Optional device capture end timestamp in microseconds.
  public endTimestampUs: bigint | null

  /**
   * Create a USB-PD message wrapper.
   *
   * @param sop - SOP metadata.
   * @param header - Parsed message header.
   * @param payload - Raw payload bytes including SOP and headers.
   * @param messageTypeName - Human-readable message type name.
   */
  public constructor(
    sop: SOP,
    header: Header,
    payload: Uint8Array,
    messageTypeName: string,
  ) {
    this.sop = sop
    this.header = header
    this.payload = payload
    this.capturePayload = Uint8Array.from(payload)
    const headerBytes = header.messageHeader.extended
      ? MESSAGE_HEADER_LENGTH + EXTENDED_HEADER_LENGTH
      : MESSAGE_HEADER_LENGTH
    this.payloadOffset = SOP_LENGTH + headerBytes
    this.kind = header.messageHeader.messageKind
    this.messageTypeNumber = header.messageHeader.messageTypeNumber
    this.messageTypeName = messageTypeName
    this.pulseWidthsNs = new Float64Array()
    this.startTimestampUs = null
    this.endTimestampUs = null
  }

  /**
   * Copy pulse widths into this decoded message.
   *
   * @param pulseWidthsNs - Optional pulse widths in nanoseconds.
   */
  public setPulseWidthsNs(pulseWidthsNs?: Float64Array): void {
    this.pulseWidthsNs = pulseWidthsNs ? Float64Array.from(pulseWidthsNs) : new Float64Array()
  }

  /**
   * Copy capture timestamps into this decoded message.
   *
   * @param startTimestampUs - Optional capture start timestamp in microseconds.
   * @param endTimestampUs - Optional capture end timestamp in microseconds.
   */
  public setCaptureTimestamps(startTimestampUs?: bigint, endTimestampUs?: bigint): void {
    this.startTimestampUs = typeof startTimestampUs === 'bigint' ? startTimestampUs : null
    this.endTimestampUs = typeof endTimestampUs === 'bigint' ? endTimestampUs : null
  }

  /**
   * Preserve the originally captured frame bytes when decoding from a synthetic payload.
   *
   * @param payload - Raw captured frame bytes.
   */
  public setCapturePayload(payload: Uint8Array): void {
    this.capturePayload = Uint8Array.from(payload)
  }

  /**
   * Human-readable metadata for this message.
   *
   * The root metadata object always contains the standard container fields.
   */
  public get humanReadableMetadata(): HumanReadableMetadataRoot {
    const baseInformation = HumanReadableField.orderedDictionary(
      'Base Information',
      'Container for general message identity and descriptive fields.',
    )
    baseInformation.insertEntryAt(
      0,
      'messageType',
      HumanReadableField.string(
        this.messageTypeName,
        'Message Type',
        'USB Power Delivery specification name for this message type.',
      ),
    )
    baseInformation.insertEntryAt(
      1,
      'usbPdReference',
      HumanReadableField.string(
        getUSBPDReference(this.kind, this.messageTypeName),
        'USB-PD Reference',
        'Section in the USB Power Delivery Specification Revision 3.2, Version 1.1 where this message is described.',
      ),
    )
    const technicalData = HumanReadableField.orderedDictionary(
      'Technical Data',
      'Container for technical-level decoded values that apply broadly.',
    )
    const totalPulseWidthNs = Array.from(this.pulseWidthsNs).reduce((sum, value) => sum + value, 0)
    const derivedEndTimestampUs = totalPulseWidthNs / 1000
    const startTimestampUs = this.startTimestampUs ?? 0n
    const endTimestampUs =
      this.endTimestampUs ?? (this.startTimestampUs !== null ? this.startTimestampUs : 0n) + BigInt(Math.round(derivedEndTimestampUs))
    const bmcFrequencyKhz = computeBMCCarrierFrequencyKhz(this.pulseWidthsNs)
    const bmcCarrierValid =
      Number.isFinite(bmcFrequencyKhz) &&
      bmcFrequencyKhz >= USB_PD_BMC_CARRIER_KHZ * (1 - USB_PD_BMC_TOLERANCE) &&
      bmcFrequencyKhz <= USB_PD_BMC_CARRIER_KHZ * (1 + USB_PD_BMC_TOLERANCE)
    const timingInformation = HumanReadableField.orderedDictionary(
      'Timing Information',
      'Capture timing and pulse-derived measurements for this message.',
    )
    timingInformation.insertEntryAt(
      0,
      'startTimestamp',
      HumanReadableField.string(
        formatMicroseconds(startTimestampUs),
        'Start Timestamp',
        'Capture start timestamp in microseconds.',
      ),
    )
    timingInformation.insertEntryAt(
      1,
      'endTimestamp',
      HumanReadableField.string(
        formatMicroseconds(endTimestampUs),
        'End Timestamp',
        'Capture end timestamp in microseconds.',
      ),
    )
    timingInformation.insertEntryAt(
      2,
      'pulseCount',
      HumanReadableField.string(
        this.pulseWidthsNs.length.toString(),
        'Pulse Count',
        'Number of captured BMC pulse widths used to decode this message.',
      ),
    )
    const bmcCarrier = HumanReadableField.orderedDictionary(
      'BMC Carrier',
      'Biphase Mark Coding carrier measurements derived from the pulse widths.',
    )
    bmcCarrier.insertEntryAt(
      0,
      'frequency',
      HumanReadableField.string(
        formatKilohertz(bmcFrequencyKhz),
        'Frequency',
        'Biphase Mark Coding carrier frequency in kilohertz computed using the preamble-clock and message-clock algorithm used by the DRPD Python decoder.',
      ),
    )
    bmcCarrier.insertEntryAt(
      1,
      'valid',
      HumanReadableField.string(
        bmcCarrierValid ? 'true' : 'false',
        'Valid',
        'Whether the measured Biphase Mark Coding carrier frequency is within the USB-PD specification tolerance of 300 kHz +/-10%.',
      ),
    )
    timingInformation.insertEntryAt(3, 'bmcCarrier', bmcCarrier)
    const sop = HumanReadableField.orderedDictionary(
      'SOP',
      'Start of Packet metadata derived from the ordered-set prefix.',
    )
    sop.insertEntryAt(
      0,
      'type',
      HumanReadableField.string(
        formatSOPType(this.sop.kind),
        'Type',
        'Decoded Start of Packet type for this message.',
      ),
    )
    sop.insertEntryAt(
      1,
      'kCodes',
      HumanReadableField.byteData(
        this.sop.bytes,
        8,
        false,
        'K-Codes',
        'Raw K-code bytes that form the Start of Packet ordered set.',
      ),
    )
    const crcField = HumanReadableField.orderedDictionary(
      'CRC32',
      'CRC32 check data comparing the calculated message checksum to the embedded checksum bytes.',
    )
    const framePayload = this.capturePayload
    const declaredDataLength = this.header.messageHeader.extended
      ? (this.header.extendedHeader?.dataSize ?? 0)
      : this.header.messageHeader.numberOfDataObjects * 4
    const chunkedExtended = this.header.messageHeader.extended && (this.header.extendedHeader?.chunked ?? false)
    const crcOffset = chunkedExtended
      ? Math.max(this.payloadOffset, framePayload.length - CRC_LENGTH)
      : this.payloadOffset + declaredDataLength
    const hasEmbeddedCRC = chunkedExtended
      ? framePayload.length >= this.payloadOffset + CRC_LENGTH
      : framePayload.length >= crcOffset + CRC_LENGTH
    const crcInput = hasEmbeddedCRC
      ? framePayload.subarray(SOP_LENGTH, crcOffset)
      : framePayload.subarray(SOP_LENGTH)
    const expectedCRC32 = computeCRC32(crcInput)
    const actualCRC32 = hasEmbeddedCRC
      ? (
          framePayload[crcOffset] |
          (framePayload[crcOffset + 1] << 8) |
          (framePayload[crcOffset + 2] << 16) |
          (framePayload[crcOffset + 3] << 24)
        ) >>> 0
      : null
    crcField.insertEntryAt(
      0,
      'expected',
      HumanReadableField.string(
        formatHex32(expectedCRC32),
        'Expected',
        'CRC32 value calculated from the USB-PD header and message payload bytes.',
      ),
    )
    crcField.insertEntryAt(
      1,
      'actual',
      HumanReadableField.string(
        formatHex32(actualCRC32),
        'Actual',
        'CRC32 value embedded in the message bytes, or Unavailable when the capture does not include CRC bytes.',
      ),
    )
    crcField.insertEntryAt(
      2,
      'valid',
      HumanReadableField.string(
        actualCRC32 !== null && actualCRC32 === expectedCRC32 ? 'true' : 'false',
        'Valid',
        'Whether the embedded CRC32 exactly matches the calculated CRC32 for this message.',
      ),
    )
    const headerData = HumanReadableField.orderedDictionary(
      'Header Data',
      'Container for parsed header-level fields and derived header metadata.',
    )
    const messageHeader = HumanReadableField.orderedDictionary(
      'Message Header',
      'USB Power Delivery Message Header fields defined in Table 6.1 of the specification, plus the supplemental raw 16-bit header word.',
    )
    const messageHeaderRaw = this.header.messageHeaderRaw
    const roleBit = (messageHeaderRaw >> 8) & 0x1
    const dataRoleBit = (messageHeaderRaw >> 5) & 0x1
    messageHeader.insertEntryAt(
      0,
      'messageHeaderRaw',
      HumanReadableField.string(
        formatHex16(messageHeaderRaw),
        'Message Header Raw',
        'Supplemental raw 16-bit USB Power Delivery Message Header word as captured before individual fields are decoded.',
      ),
    )
    messageHeader.insertEntryAt(
      1,
      'extended',
      HumanReadableField.string(
        formatExtendedBit(this.header.messageHeader.extended),
        'Extended',
        'Indicates whether the Message Header identifies this packet as an Extended Message or as a Control/Data Message.',
      ),
    )
    messageHeader.insertEntryAt(
      2,
      'numberOfDataObjects',
      HumanReadableField.string(
        this.header.messageHeader.numberOfDataObjects.toString(),
        'Number of Data Objects',
        'For non-Extended messages, indicates how many 32-bit Data Objects follow the Message Header; for Extended messages, its meaning depends on chunking as defined by the spec.',
      ),
    )
    messageHeader.insertEntryAt(
      3,
      'messageId',
      HumanReadableField.string(
        this.header.messageHeader.messageId.toString(),
        'MessageID',
        'Rolling 3-bit message identifier maintained by the message originator and used with GoodCRC-based protocol acknowledgement.',
      ),
    )
    const bit8Index = 4
    if (this.sop.kind === 'SOP') {
      messageHeader.insertEntryAt(
        bit8Index,
        'portPowerRole',
        HumanReadableField.string(
          formatPortPowerRole(roleBit),
          'Port Power Role',
          'For SOP packets, indicates the transmitting port\'s present power role as Sink or Source.',
        ),
      )
    } else if (this.sop.kind === 'SOP_PRIME' || this.sop.kind === 'SOP_DOUBLE_PRIME') {
      messageHeader.insertEntryAt(
        bit8Index,
        'cablePlug',
        HumanReadableField.string(
          formatCablePlug(roleBit),
          'Cable Plug',
          'For SOP\' and SOP\'\' packets, indicates whether the message originated from a DFP/UFP or from a Cable Plug or VPD.',
        ),
      )
    } else {
      messageHeader.insertEntryAt(
        bit8Index,
        'reservedBit8',
        HumanReadableField.string(
          formatReservedBit(roleBit),
          'Reserved',
          'Bit 8 is Reserved for this packet type in the USB Power Delivery Message Header and is not assigned a defined protocol meaning by the specification.',
        ),
      )
    }
    messageHeader.insertEntryAt(
      5,
      'specificationRevision',
      HumanReadableField.string(
        formatSpecificationRevision(this.header.messageHeader.specRevisionBits),
        'Specification Revision',
        'Indicates which USB Power Delivery specification revision the sender is using for this message.',
      ),
    )
    if (this.sop.kind === 'SOP') {
      messageHeader.insertEntryAt(
        6,
        'portDataRole',
        HumanReadableField.string(
          formatPortDataRole(dataRoleBit),
          'Port Data Role',
          'For SOP packets, indicates the transmitting port\'s present USB data role as UFP or DFP.',
        ),
      )
    } else {
      messageHeader.insertEntryAt(
        6,
        'reservedBit5',
        HumanReadableField.string(
          formatReservedBit(dataRoleBit),
          'Reserved',
          'Bit 5 is Reserved for non-SOP packets in the USB Power Delivery Message Header and is not assigned a defined protocol meaning by the specification.',
        ),
      )
    }
    messageHeader.insertEntryAt(
      7,
      'messageType',
      HumanReadableField.string(
        formatMessageType(this.messageTypeName, this.messageTypeNumber),
        'Message Type',
        'Indicates the message type code; the USB Power Delivery specification decodes it in the context of the message format indicated by the header.',
      ),
    )
    headerData.insertEntryAt(0, 'messageHeader', messageHeader)
    if (this.header.extendedHeader !== null && this.header.extendedHeaderRaw !== null) {
      const extendedMessageHeader = HumanReadableField.orderedDictionary(
        'Extended Message Header',
        'USB Power Delivery Extended Message Header fields defined in Table 6.3 of the specification, plus the supplemental raw 16-bit header word.',
      )
      const extendedHeaderRaw = this.header.extendedHeaderRaw
      const reservedBit9 = (extendedHeaderRaw >> 9) & 0x1
      extendedMessageHeader.insertEntryAt(
        0,
        'extendedMessageHeaderRaw',
        HumanReadableField.string(
          formatHex16(extendedHeaderRaw),
          'Extended Message Header Raw',
          'Supplemental raw 16-bit USB Power Delivery Extended Message Header word as captured before individual fields are decoded.',
        ),
      )
      extendedMessageHeader.insertEntryAt(
        1,
        'chunked',
        HumanReadableField.string(
          formatChunked(this.header.extendedHeader.chunked),
          'Chunked',
          'Indicates whether this Extended Message is being transferred in chunks or as a single unchunked transfer.',
        ),
      )
      extendedMessageHeader.insertEntryAt(
        2,
        'chunkNumber',
        HumanReadableField.string(
          this.header.extendedHeader.chunkNumber.toString(),
          'Chunk Number',
          'When chunking is in use, identifies either the chunk being requested or the chunk being returned.',
        ),
      )
      extendedMessageHeader.insertEntryAt(
        3,
        'requestChunk',
        HumanReadableField.string(
          formatRequestChunk(this.header.extendedHeader.requestChunk),
          'Request Chunk',
          'Indicates whether this Extended Message is requesting a chunk or carrying chunk data in response.',
        ),
      )
      extendedMessageHeader.insertEntryAt(
        4,
        'reservedBit9',
        HumanReadableField.string(
          formatReservedBit(reservedBit9),
          'Reserved',
          'Bit 9 of the Extended Message Header is Reserved by the USB Power Delivery specification and does not carry a defined meaning.',
        ),
      )
      extendedMessageHeader.insertEntryAt(
        5,
        'dataSize',
        HumanReadableField.string(
          formatDataSize(this.header.extendedHeader.dataSize),
          'Data Size',
          'Indicates the total number of data bytes in the Extended Message Data Block being transferred.',
        ),
      )
      headerData.insertEntryAt(1, 'extendedMessageHeader', extendedMessageHeader)
    }
    technicalData.insertEntryAt(0, 'timingInformation', timingInformation)
    technicalData.insertEntryAt(1, 'sop', sop)
    technicalData.insertEntryAt(2, 'crc32', crcField)
    technicalData.insertEntryAt(
      3,
      'messageBytes',
      HumanReadableField.byteData(
        this.capturePayload,
        // Preserve the captured fragment bytes even when decode-time reassembly
        // uses a synthetic payload for message-specific parsing.
        8,
        false,
        'Message Bytes',
        'Raw byte sequence for the full decoded USB-PD message, including SOP bytes and any embedded CRC bytes.',
      ),
    )
    return {
      baseInformation,
      technicalData,
      headerData,
      messageSpecificData: HumanReadableField.orderedDictionary(
        'Message-Specific Data',
        'Container for decoded fields specific to this concrete message type.',
      ),
    }
  }
}

/**
 * Base class for USB-PD control messages.
 */
export class ControlMessage extends Message {}

/**
 * Base class for USB-PD data messages.
 */
export class DataMessage extends Message {}

/**
 * Base class for USB-PD extended messages.
 */
export class ExtendedMessage extends Message {}
