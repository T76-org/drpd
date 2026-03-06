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
  const rounded = Math.round(valueKhz * 1000) / 1000
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

const formatHex32 = (value: number | null): string =>
  value === null ? 'Unavailable' : `0x${value.toString(16).toUpperCase().padStart(8, '0')}`

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
    const declaredDataLength = this.header.messageHeader.extended
      ? (this.header.extendedHeader?.dataSize ?? 0)
      : this.header.messageHeader.numberOfDataObjects * 4
    const crcOffset = this.payloadOffset + declaredDataLength
    const hasEmbeddedCRC = this.payload.length >= crcOffset + CRC_LENGTH
    const crcInput = hasEmbeddedCRC
      ? this.payload.subarray(SOP_LENGTH, crcOffset)
      : this.payload.subarray(SOP_LENGTH)
    const expectedCRC32 = computeCRC32(crcInput)
    const actualCRC32 = hasEmbeddedCRC
      ? (
          this.payload[crcOffset] |
          (this.payload[crcOffset + 1] << 8) |
          (this.payload[crcOffset + 2] << 16) |
          (this.payload[crcOffset + 3] << 24)
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
    technicalData.insertEntryAt(
      0,
      'startTimestamp',
      HumanReadableField.string(
        formatMicroseconds(startTimestampUs),
        'Start Timestamp',
        'Capture start timestamp in microseconds.',
      ),
    )
    technicalData.insertEntryAt(
      1,
      'endTimestamp',
      HumanReadableField.string(
        formatMicroseconds(endTimestampUs),
        'End Timestamp',
        'Capture end timestamp in microseconds.',
      ),
    )
    technicalData.insertEntryAt(2, 'bmcCarrier', bmcCarrier)
    technicalData.insertEntryAt(3, 'sop', sop)
    technicalData.insertEntryAt(4, 'crc32', crcField)
    technicalData.insertEntryAt(
      5,
      'messageBytes',
      HumanReadableField.byteData(
        this.payload,
        8,
        false,
        'Message Bytes',
        'Raw byte sequence for the full decoded USB-PD message, including SOP bytes and any embedded CRC bytes.',
      ),
    )
    return {
      baseInformation,
      technicalData,
      headerData: HumanReadableField.orderedDictionary(
        'Header Data',
        'Container for parsed header-level fields and derived header metadata.',
      ),
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
