import { DataMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import { buildRDOMetadata, parseRDO, readDataObjects, type ParsedRDO } from '../DataObjects'

const formatScaledValue = (value: number): string => Number(value.toFixed(2)).toString()

const formatCurrentMa = (valueMa: number): string => `${formatScaledValue(valueMa / 1000)}A`

/**
 * Request data message.
 */
export class RequestMessage extends DataMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw RDO value.
  public readonly rawRDO: number | null
  ///< Parsed RDO.
  public readonly rdo: ParsedRDO | null
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create a Request message.
   *
   * @param sop - SOP metadata.
   * @param header - Parsed header.
   * @param payload - Raw payload bytes.
   * @param messageTypeName - Message type name.
   */
  public constructor(
    sop: DataMessage['sop'],
    header: DataMessage['header'],
    payload: Uint8Array,
    messageTypeName: string,
  ) {
    super(sop, header, payload, messageTypeName)
    this.parseErrors = []
    this.rawPayload = payload.subarray(this.payloadOffset)
    const availableCount = Math.floor(this.rawPayload.length / 4)
    if (availableCount < 1) {
      this.parseErrors.push('Request message missing RDO payload')
      this.rawRDO = null
      this.rdo = null
      return
    }
    this.rawRDO = readDataObjects(payload, this.payloadOffset, 1)[0]
    this.rdo = parseRDO(this.rawRDO)
  }

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Markdown summary of the requested fixed or variable power contract.
   */
  public describe(): string {
    if (!this.rdo) {
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `Could not decode the Request Data Object.${parseErrorText}`.trim()
    }

    const lines = [
      '**Power request:**',
      '',
      `- Selected source object position: ${this.rdo.objectPosition}`,
      `- Operating current: ${formatCurrentMa(this.rdo.fixedVariable.operatingCurrent10mA * 10)}`,
      `- Maximum operating current: ${formatCurrentMa(this.rdo.fixedVariable.maximumOperatingCurrent10mA * 10)}`,
    ]

    const flags: string[] = []
    if (this.rdo.capabilityMismatch) {
      flags.push('Capability mismatch: the sink says the selected source capability cannot fully satisfy it.')
    }
    if (this.rdo.usbCommunicationsCapable) {
      flags.push('USB communications capable while using this contract.')
    }
    if (this.rdo.noUsbSuspend) {
      flags.push('Requests no USB suspend while using this contract.')
    }
    if (this.rdo.unchunkedExtendedMessagesSupported) {
      flags.push('Supports unchunked extended messages.')
    }
    if (this.rdo.eprCapable) {
      flags.push('Extended Power Range capable.')
    }
    if (this.rdo.giveback) {
      flags.push('GiveBack flag set.')
    }

    if (flags.length > 0) {
      lines.push('', '**Asserted request flags:**')
      flags.forEach((flag) => {
        lines.push(`- ${flag}`)
      })
    }

    if (this.parseErrors.length > 0) {
      lines.push('', `**Could not decode all request data:** ${this.parseErrors.join(' ')}`)
    }

    return lines.join('\n')
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(
      1,
      'messageDescription',
      HumanReadableField.string(
        'Request is a data message that selects a specific source power data object and operating level so a sink can establish or change its power contract.',
        'Message Description',
        'A description of the message\'s function and usage.',
      ),
    )
    metadata.baseInformation.insertEntryAt(
      2,
      'messageSummary',
      HumanReadableField.string(
        this.describe(),
        'Message Summary',
        'Concise description of the specific fixed or variable power request carried by this Request message.',
      ),
    )

    if (this.rdo) {
      metadata.messageSpecificData.setEntry('requestDataObject', buildRDOMetadata({
        ...this.rdo,
        requestTypeHint: 'fixed_variable',
      }))
    }
    return metadata
  }

}
