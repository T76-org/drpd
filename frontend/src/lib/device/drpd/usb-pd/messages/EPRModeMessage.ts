import { DataMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import { buildEPRModeDataObjectMetadata, parseEPRModeDataObject, readDataObjects, type ParsedEPRModeDataObject } from '../DataObjects'

const formatHexByte = (value: number): string => `0x${value.toString(16).toUpperCase().padStart(2, '0')}`

const describeEprModeAction = (action: number): string => {
  switch (action) {
    case 0x01:
      return 'Enter Extended Power Range mode'
    case 0x02:
      return 'Enter Extended Power Range mode acknowledged'
    case 0x03:
      return 'Entered Extended Power Range mode successfully'
    case 0x04:
      return 'Failed to enter Extended Power Range mode'
    case 0x05:
      return 'Exit Extended Power Range mode'
    default:
      return `Reserved action ${formatHexByte(action)}`
  }
}

const describeEnterFailure = (data: number): string => {
  switch (data) {
    case 0x00:
      return 'unknown cause'
    case 0x01:
      return 'cable is not Extended Power Range capable'
    case 0x02:
      return 'source failed to become VCONN source'
    case 0x03:
      return 'Extended Power Range capable bit is not set in the Request Data Object'
    case 0x04:
      return 'source is unable to enter Extended Power Range mode'
    case 0x05:
      return 'Extended Power Range capable bit is not set in the Power Data Object'
    default:
      return `reserved failure code ${formatHexByte(data)}`
  }
}

/**
 * EPR_Mode data message.
 */
export class EPRModeMessage extends DataMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw EPRMDO value.
  public readonly rawEprModeDataObject: number | null
  ///< Parsed EPRMDO.
  public readonly eprModeDataObject: ParsedEPRModeDataObject | null
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create an EPR_Mode message.
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
      this.parseErrors.push('EPR_Mode message missing data object')
      this.rawEprModeDataObject = null
      this.eprModeDataObject = null
      return
    }
    this.rawEprModeDataObject = readDataObjects(payload, this.payloadOffset, 1)[0]
    this.eprModeDataObject = parseEPRModeDataObject(this.rawEprModeDataObject)
  }

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Markdown summary of the Extended Power Range mode transition.
   */
  public describe(): string {
    if (!this.eprModeDataObject) {
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `Could not decode the Extended Power Range Mode Data Object.${parseErrorText}`.trim()
    }

    const eprMode = this.eprModeDataObject
    const lines = [
      '**Extended Power Range mode transition:**',
      '',
      `- Action: ${describeEprModeAction(eprMode.action)}.`,
    ]

    if (eprMode.action === 0x01) {
      lines.push(`- Sink operational power data profile: ${eprMode.data}W.`)
    } else if (eprMode.action === 0x04) {
      lines.push(`- Failure reason: ${describeEnterFailure(eprMode.data)}.`)
    } else if (eprMode.data !== 0) {
      lines.push(`- Action-specific data: ${formatHexByte(eprMode.data)}.`)
    }

    if (this.parseErrors.length > 0) {
      lines.push('', `**Could not decode all Extended Power Range mode data:** ${this.parseErrors.join(' ')}`)
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
        'EPR_Mode is a data message used to coordinate entering, exiting, or acknowledging Extended Power Range operation so both partners stay synchronized on EPR state transitions.',
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
        'Concise description of the specific Extended Power Range mode transition carried by this EPR_Mode message.',
      ),
    )

    if (this.eprModeDataObject) {
      metadata.messageSpecificData.setEntry('eprModeDataObject', buildEPRModeDataObjectMetadata(this.eprModeDataObject))
    }
    return metadata
  }

}
