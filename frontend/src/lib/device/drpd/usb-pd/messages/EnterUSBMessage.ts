import { DataMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import {
  buildEnterUSBDataObjectMetadata,
  parseEnterUSBDataObject,
  readDataObjects,
  type ParsedEnterUSBDataObject,
} from '../DataObjects'

const describeUsbMode = (usbMode: number): string => {
  switch (usbMode) {
    case 0:
      return 'USB 2.0'
    case 1:
      return 'USB 3.2'
    case 2:
      return 'USB4'
    default:
      return `reserved mode code ${usbMode}`
  }
}

const describeCableSpeed = (cableSpeed: number): string => {
  switch (cableSpeed) {
    case 0:
      return 'USB 2.0 only'
    case 1:
      return 'USB 3.2 Gen1'
    case 2:
      return 'USB 3.2 Gen2 and USB4 Gen2'
    case 3:
      return 'USB4 Gen3'
    case 4:
      return 'USB4 Gen4'
    default:
      return `reserved speed code ${cableSpeed}`
  }
}

const describeCableType = (cableType: number): string => {
  switch (cableType) {
    case 0:
      return 'Passive'
    case 1:
      return 'Active re-timer'
    case 2:
      return 'Active re-driver'
    case 3:
      return 'Optically isolated'
    default:
      return `reserved cable type code ${cableType}`
  }
}

const describeCableCurrent = (cableCurrent: number): string => {
  switch (cableCurrent) {
    case 0:
      return 'VBUS not supported'
    case 1:
      return 'reserved current code 1'
    case 2:
      return '3A'
    case 3:
      return '5A'
    default:
      return `reserved current code ${cableCurrent}`
  }
}

/**
 * Enter_USB data message.
 */
export class EnterUSBMessage extends DataMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw EUDO value.
  public readonly rawEnterUsbDataObject: number | null
  ///< Parsed EUDO.
  public readonly enterUsbDataObject: ParsedEnterUSBDataObject | null
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create an Enter_USB message.
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
      this.parseErrors.push('Enter_USB message missing data object')
      this.rawEnterUsbDataObject = null
      this.enterUsbDataObject = null
      return
    }
    this.rawEnterUsbDataObject = readDataObjects(payload, this.payloadOffset, 1)[0]
    this.enterUsbDataObject = parseEnterUSBDataObject(this.rawEnterUsbDataObject)
  }

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Markdown summary of the requested USB mode and salient capabilities.
   */
  public describe(): string {
    if (!this.enterUsbDataObject) {
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `Could not decode the Enter USB Data Object.${parseErrorText}`.trim()
    }

    const enterUsb = this.enterUsbDataObject
    const lines = [
      '**USB mode entry:**',
      '',
      `- Requested USB mode: ${describeUsbMode(enterUsb.usbMode)}`,
      `- Cable speed: ${describeCableSpeed(enterUsb.cableSpeed)}`,
      `- Cable type: ${describeCableType(enterUsb.cableType)}`,
      `- Cable current: ${describeCableCurrent(enterUsb.cableCurrent)}`,
      `- Host present: ${enterUsb.hostPresent ? 'yes' : 'no'}`,
    ]

    const capabilities: string[] = []
    if (enterUsb.usb4Drd) {
      capabilities.push('USB4 dual-role data capable.')
    }
    if (enterUsb.usb3Drd) {
      capabilities.push('USB 3.2 dual-role data capable.')
    }
    if (enterUsb.pcieSupport) {
      capabilities.push('PCI Express tunneling supported.')
    }
    if (enterUsb.dpSupport) {
      capabilities.push('DisplayPort tunneling supported.')
    }
    if (enterUsb.tbtSupport) {
      capabilities.push('Thunderbolt tunneling supported.')
    }

    if (capabilities.length > 0) {
      lines.push('', '**Asserted USB capabilities:**')
      capabilities.forEach((capability) => {
        lines.push(`- ${capability}`)
      })
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
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Enter_USB is a data message that carries USB mode entry parameters so partners can transition from USB-PD negotiation into a selected USB data mode with agreed constraints.', 'Message Description', 'A description of the message\'s function and usage.'))
    metadata.baseInformation.insertEntryAt(
      2,
      'messageSummary',
      HumanReadableField.string(
        this.describe(),
        'Message Summary',
        'Concise description of the USB mode entry parameters carried by this Enter_USB message.',
      ),
    )

    if (this.enterUsbDataObject) {
      metadata.messageSpecificData.setEntry('enterUsbDataObject', buildEnterUSBDataObjectMetadata(this.enterUsbDataObject))
    }
    return metadata
  }

}
