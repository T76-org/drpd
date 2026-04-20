import { DataMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import { buildAlertDataObjectMetadata, parseAlertDataObject, readDataObjects, type ParsedAlertDataObject } from '../DataObjects'

const ALERT_FLAG_DESCRIPTIONS: Array<{ bit: number, description: string }> = [
  { bit: 1, description: 'Battery status changed.' },
  { bit: 2, description: 'Over-current protection event.' },
  { bit: 3, description: 'Over-temperature protection event.' },
  { bit: 4, description: 'Operating condition changed.' },
  { bit: 5, description: 'Source input condition changed.' },
  { bit: 6, description: 'Over-voltage protection event.' },
  { bit: 7, description: 'Extended alert event is present.' },
]

const formatBatterySlots = (slotMask: number): string[] => {
  const slots: string[] = []
  for (let index = 0; index < 4; index += 1) {
    if ((slotMask & (1 << index)) !== 0) {
      slots.push(`${index + 1}`)
    }
  }
  return slots
}

/**
 * Alert data message.
 */
export class AlertMessage extends DataMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw ADO value.
  public readonly rawAlertDataObject: number | null
  ///< Parsed ADO.
  public readonly alertDataObject: ParsedAlertDataObject | null
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create an Alert message.
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
      this.parseErrors.push('Alert message missing data object')
      this.rawAlertDataObject = null
      this.alertDataObject = null
      return
    }
    this.rawAlertDataObject = readDataObjects(payload, this.payloadOffset, 1)[0]
    this.alertDataObject = parseAlertDataObject(this.rawAlertDataObject)
  }

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Markdown summary of the alert events and affected battery slots.
   */
  public describe(): string {
    if (!this.alertDataObject) {
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `Could not decode the Alert Data Object.${parseErrorText}`.trim()
    }

    const alertDataObject = this.alertDataObject
    const lines = ['**Reported alerts:**']
    const activeAlerts = ALERT_FLAG_DESCRIPTIONS
      .filter((flag) => (alertDataObject.typeOfAlert & (1 << flag.bit)) !== 0)
      .map((flag) => flag.description)

    if (activeAlerts.length === 0) {
      lines.push('', '- No alert event flags are set.')
    } else {
      lines.push('')
      activeAlerts.forEach((alert) => {
        lines.push(`- ${alert}`)
      })
    }

    const fixedBatterySlots = formatBatterySlots(alertDataObject.fixedBatteries)
    const hotSwappableBatterySlots = formatBatterySlots(alertDataObject.hotSwappableBatteries)
    if (fixedBatterySlots.length > 0 || hotSwappableBatterySlots.length > 0) {
      lines.push('', '**Affected batteries:**')
      if (fixedBatterySlots.length > 0) {
        lines.push(`- Fixed battery slots: ${fixedBatterySlots.join(', ')}`)
      }
      if (hotSwappableBatterySlots.length > 0) {
        lines.push(`- Hot-swappable battery slots: ${hotSwappableBatterySlots.join(', ')}`)
      }
    }

    if ((alertDataObject.typeOfAlert & (1 << 7)) !== 0) {
      lines.push('', `**Extended alert event type:** ${alertDataObject.extendedAlertEventType}`)
    }

    if (this.parseErrors.length > 0) {
      lines.push('', `**Could not decode all alert data:** ${this.parseErrors.join(' ')}`)
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
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Alert is a data message that signals specific alert events from a port partner so the receiver can quickly detect and handle urgent power or status conditions.', 'Message Description', 'A description of the message\'s function and usage.'))
    metadata.baseInformation.insertEntryAt(
      2,
      'messageSummary',
      HumanReadableField.string(
        this.describe(),
        'Message Summary',
        'Concise description of the specific alert events and battery slots carried by this Alert message.',
      ),
    )

    if (this.alertDataObject) {
      metadata.messageSpecificData.setEntry('alertDataObject', buildAlertDataObjectMetadata(this.alertDataObject))
    }
    return metadata
  }

}
