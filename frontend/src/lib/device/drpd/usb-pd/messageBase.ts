import type { MessageKind } from './types'
import { Header } from './header'
import { SOP } from './sop'
import { HumanReadableField, type HumanReadableMetadataRoot } from './humanReadableField'

const SOP_LENGTH = 4
const MESSAGE_HEADER_LENGTH = 2
const EXTENDED_HEADER_LENGTH = 2

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
   * Human-readable metadata for this message.
   *
   * The root metadata object always contains the standard container fields.
   */
  public get humanReadableMetadata(): HumanReadableMetadataRoot {
    const baseInformation = HumanReadableField.orderedDictionary(
      'Container for general message identity and descriptive fields.',
    )
    baseInformation.insertEntryAt(
      0,
      'Message Type',
      HumanReadableField.string(
        this.messageTypeName,
        'USB Power Delivery specification name for this message type.',
      ),
    )
    return {
      baseInformation,
      technicalData: HumanReadableField.orderedDictionary(
        'Container for technical-level decoded values that apply broadly.',
      ),
      headerData: HumanReadableField.orderedDictionary(
        'Container for parsed header-level fields and derived header metadata.',
      ),
      messageSpecificData: HumanReadableField.orderedDictionary(
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
