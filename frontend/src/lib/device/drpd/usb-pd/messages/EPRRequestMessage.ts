import { DataMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import {
  buildPDOMetadata,
  buildRDOMetadata,
  inferRequestTypeHintFromPDO,
  inferRequestTypeHintFromRaw,
  parsePDO,
  parseRDO,
  readDataObjects,
  type ParsedPDO,
  type ParsedRDO,
} from '../DataObjects'

const formatScaledValue = (value: number): string => Number(value.toFixed(2)).toString()

const formatVoltageMv = (valueMv: number): string => `${formatScaledValue(valueMv / 1000)}V`

const formatCurrentMa = (valueMa: number): string => `${formatScaledValue(valueMa / 1000)}A`

const formatPowerMw = (valueMw: number): string => `${formatScaledValue(valueMw / 1000)}W`

const formatRequestedProfile = (pdo: ParsedPDO): string => {
  if (pdo.pdoType === 'FIXED') {
    return `${formatVoltageMv(pdo.voltage50mV * 50)} @ ${formatCurrentMa(pdo.current10mA * 10)} fixed supply`
  }

  if (pdo.pdoType === 'VARIABLE') {
    return `${formatVoltageMv(pdo.minimumVoltage50mV * 50)}-${formatVoltageMv(pdo.maximumVoltage50mV * 50)} @ ${formatCurrentMa(pdo.current10mA * 10)} variable supply`
  }

  if (pdo.pdoType === 'BATTERY') {
    return `${formatVoltageMv(pdo.minimumVoltage50mV * 50)}-${formatVoltageMv(pdo.maximumVoltage50mV * 50)} @ ${formatPowerMw(pdo.power250mW * 250)} battery supply`
  }

  if (pdo.apdoType === 'SPR_PPS') {
    return `${formatVoltageMv(pdo.minimumVoltage100mV * 100)}-${formatVoltageMv(pdo.maximumVoltage100mV * 100)} @ ${formatCurrentMa(pdo.maximumCurrent50mA * 50)} programmable power supply`
  }

  if (pdo.apdoType === 'SPR_AVS') {
    return `adjustable voltage supply: 15V @ ${formatCurrentMa(pdo.maxCurrent15V10mA * 10)}, 20V @ ${formatCurrentMa(pdo.maxCurrent20V10mA * 10)}`
  }

  if (pdo.apdoType === 'EPR_AVS') {
    return `${formatVoltageMv(pdo.minimumVoltage100mV * 100)}-${formatVoltageMv(pdo.maximumVoltage100mV * 100)}, ${pdo.pdp1W}W Extended Power Range adjustable voltage supply`
  }

  return 'reserved augmented Power Data Object'
}

const formatRequestLevels = (rdo: ParsedRDO, requestTypeHint: ParsedRDO['requestTypeHint']): string[] => {
  switch (requestTypeHint) {
    case 'battery':
      return [
        `Operating power: ${formatPowerMw(rdo.battery.operatingPower250mW * 250)}`,
        `Maximum operating power: ${formatPowerMw(rdo.battery.maximumOperatingPower250mW * 250)}`,
      ]
    case 'pps':
      return [
        `Output voltage: ${formatVoltageMv(rdo.pps.outputVoltage20mV * 20)}`,
        `Operating current: ${formatCurrentMa(rdo.pps.operatingCurrent50mA * 50)}`,
      ]
    case 'avs':
      return [
        `Output voltage: ${formatVoltageMv(rdo.avs.outputVoltage25mV * 25)}`,
        `Operating current: ${formatCurrentMa(rdo.avs.operatingCurrent50mA * 50)}`,
      ]
    default:
      return [
        `Operating current: ${formatCurrentMa(rdo.fixedVariable.operatingCurrent10mA * 10)}`,
        `Maximum operating current: ${formatCurrentMa(rdo.fixedVariable.maximumOperatingCurrent10mA * 10)}`,
      ]
  }
}

/**
 * EPR_Request data message.
 */
export class EPRRequestMessage extends DataMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw RDO value.
  public readonly rawRDO: number | null
  ///< Parsed RDO.
  public readonly rdo: ParsedRDO | null
  ///< Raw PDO copy value.
  public readonly rawPDOCopy: number | null
  ///< Parsed PDO copy.
  public readonly requestedPDOCopy: ParsedPDO | null
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create an EPR_Request message.
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
    if (availableCount < 2) {
      this.parseErrors.push('EPR_Request message missing RDO and PDO copy')
      this.rawRDO = null
      this.rdo = null
      this.rawPDOCopy = null
      this.requestedPDOCopy = null
      return
    }
    const objects = readDataObjects(payload, this.payloadOffset, 2)
    this.rawRDO = objects[0]
    this.rdo = parseRDO(objects[0])
    this.rawPDOCopy = objects[1]
    this.requestedPDOCopy = parsePDO(objects[1], 'source')
  }

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Markdown summary of the requested Extended Power Range contract.
   */
  public describe(): string {
    if (!this.rdo) {
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `Could not decode the Extended Power Range Request Data Object.${parseErrorText}`.trim()
    }

    const requestTypeHint = this.requestedPDOCopy
      ? inferRequestTypeHintFromPDO(this.requestedPDOCopy)
      : this.rawRDO !== null
        ? inferRequestTypeHintFromRaw(this.rawRDO)
        : this.rdo.requestTypeHint
    const lines = [
      '**Extended Power Range request:**',
      '',
      `- Selected source object position: ${this.rdo.objectPosition}`,
      ...formatRequestLevels(this.rdo, requestTypeHint).map((level) => `- ${level}`),
    ]

    if (this.requestedPDOCopy) {
      lines.push('', '**Copied requested Power Data Object:**', `- ${formatRequestedProfile(this.requestedPDOCopy)}`)
    }

    const flags: string[] = []
    if (this.rdo.capabilityMismatch) {
      flags.push('Capability mismatch: the sink says the selected source capability cannot fully satisfy it.')
    }
    if (this.rdo.eprCapable) {
      flags.push('Extended Power Range capable.')
    }
    if (this.rdo.unchunkedExtendedMessagesSupported) {
      flags.push('Supports unchunked extended messages.')
    }
    if (this.rdo.usbCommunicationsCapable) {
      flags.push('USB communications capable while using this contract.')
    }
    if (this.rdo.noUsbSuspend) {
      flags.push('Requests no USB suspend while using this contract.')
    }

    if (flags.length > 0) {
      lines.push('', '**Asserted request flags:**')
      flags.forEach((flag) => {
        lines.push(`- ${flag}`)
      })
    }

    if (this.parseErrors.length > 0) {
      lines.push('', `**Could not decode all Extended Power Range request data:** ${this.parseErrors.join(' ')}`)
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
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('EPR_Request is a data message that requests an Extended Power Range power contract so a sink can ask for higher-power operating points in EPR mode.', 'Message Description', 'A description of the message\'s function and usage.'))
    metadata.baseInformation.insertEntryAt(
      2,
      'messageSummary',
      HumanReadableField.string(
        this.describe(),
        'Message Summary',
        'Concise description of the specific Extended Power Range power request carried by this EPR_Request message.',
      ),
    )

    if (this.rdo) {
      metadata.messageSpecificData.setEntry('requestDataObject', buildRDOMetadata({
        ...this.rdo,
        requestTypeHint:
          this.requestedPDOCopy
            ? inferRequestTypeHintFromPDO(this.requestedPDOCopy)
            : this.rawRDO !== null
              ? inferRequestTypeHintFromRaw(this.rawRDO)
              : this.rdo.requestTypeHint,
      }))
    }
    if (this.requestedPDOCopy) {
      metadata.messageSpecificData.setEntry('requestedPowerDataObject', buildPDOMetadata(this.requestedPDOCopy))
    }
    return metadata
  }

}
