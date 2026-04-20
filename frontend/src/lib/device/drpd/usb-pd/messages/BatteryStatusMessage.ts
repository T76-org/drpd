import { DataMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import {
  buildBatteryStatusDataObjectMetadata,
  parseBatteryStatusDataObject,
  readDataObjects,
  type ParsedBatteryStatusDataObject,
} from '../DataObjects'

const formatScaledValue = (value: number): string => Number(value.toFixed(2)).toString()

const formatBatteryCapacity = (capacityTenthsWh: number): string => `${formatScaledValue(capacityTenthsWh / 10)}Wh`

const formatChargingStatus = (status: number): string => {
  switch (status) {
    case 0:
      return 'charging'
    case 1:
      return 'discharging'
    case 2:
      return 'idle'
    default:
      return `reserved charging-state code ${status}`
  }
}

/**
 * Battery_Status data message.
 */
export class BatteryStatusMessage extends DataMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw BSDO value.
  public readonly rawBatteryStatusDataObject: number | null
  ///< Parsed BSDO.
  public readonly batteryStatusDataObject: ParsedBatteryStatusDataObject | null
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create a Battery_Status message.
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
      this.parseErrors.push('Battery_Status message missing data object')
      this.rawBatteryStatusDataObject = null
      this.batteryStatusDataObject = null
      return
    }
    this.rawBatteryStatusDataObject = readDataObjects(payload, this.payloadOffset, 1)[0]
    this.batteryStatusDataObject = parseBatteryStatusDataObject(this.rawBatteryStatusDataObject)
  }

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Markdown summary of the reported battery state.
   */
  public describe(): string {
    if (!this.batteryStatusDataObject) {
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `Could not decode the Battery Status Data Object.${parseErrorText}`.trim()
    }

    const batteryStatus = this.batteryStatusDataObject
    const lines = [
      '**Battery status:**',
      '',
      `- Battery is ${batteryStatus.batteryPresent ? 'present' : 'not present'}.`,
      `- Present capacity: ${formatBatteryCapacity(batteryStatus.batteryPresentCapacity)}`,
      `- Charging state: ${formatChargingStatus(batteryStatus.batteryChargingStatus)}.`,
    ]

    if (batteryStatus.invalidBatteryReference) {
      lines.push('- Battery reference is invalid.')
    }

    if (this.parseErrors.length > 0) {
      lines.push('', `**Could not decode all battery status data:** ${this.parseErrors.join(' ')}`)
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
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Battery_Status is a data message that communicates current battery presence and status information so a partner can track battery health and charging-related state.', 'Message Description', 'A description of the message\'s function and usage.'))
    metadata.baseInformation.insertEntryAt(
      2,
      'messageSummary',
      HumanReadableField.string(
        this.describe(),
        'Message Summary',
        'Concise description of the battery state carried by this Battery_Status message.',
      ),
    )

    if (this.batteryStatusDataObject) {
      metadata.messageSpecificData.setEntry(
        'batteryStatusDataObject',
        buildBatteryStatusDataObjectMetadata(this.batteryStatusDataObject),
      )
    }
    return metadata
  }

}
