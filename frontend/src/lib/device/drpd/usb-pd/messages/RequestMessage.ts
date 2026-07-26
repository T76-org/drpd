import { DataMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import {
  buildPDOMetadata,
  buildRDOMetadata,
  parseRDO,
  readDataObjects,
  type ParsedRDO,
  type ParsedPDO,
  type RequestType,
  type RequestTypeResolution,
} from '../DataObjects'

const formatScaledValue = (value: number): string => Number(value.toFixed(2)).toString()

const formatCurrentMa = (valueMa: number): string => `${formatScaledValue(valueMa / 1000)}A`

const formatVoltageMv = (valueMv: number): string => `${formatScaledValue(valueMv / 1000)}V`

const formatPowerMw = (valueMw: number): string => `${formatScaledValue(valueMw / 1000)}W`

const formatReferencedPdo = (pdo: ParsedPDO): string => {
  if (pdo.pdoType === 'FIXED') return `${formatVoltageMv(pdo.voltage50mV * 50)} @ ${formatCurrentMa(pdo.current10mA * 10)} fixed supply`
  if (pdo.pdoType === 'VARIABLE') return `${formatVoltageMv(pdo.minimumVoltage50mV * 50)}-${formatVoltageMv(pdo.maximumVoltage50mV * 50)} @ ${formatCurrentMa(pdo.current10mA * 10)} variable supply`
  if (pdo.pdoType === 'BATTERY') return `${formatVoltageMv(pdo.minimumVoltage50mV * 50)}-${formatVoltageMv(pdo.maximumVoltage50mV * 50)} @ ${formatPowerMw(pdo.power250mW * 250)} battery supply`
  if (pdo.apdoType === 'SPR_PPS') return `${formatVoltageMv(pdo.minimumVoltage100mV * 100)}-${formatVoltageMv(pdo.maximumVoltage100mV * 100)} @ ${formatCurrentMa(pdo.maximumCurrent50mA * 50)} PPS`
  if (pdo.apdoType === 'SPR_AVS') return `SPR AVS: 15V @ ${formatCurrentMa(pdo.maxCurrent15V10mA * 10)}, 20V @ ${formatCurrentMa(pdo.maxCurrent20V10mA * 10)}`
  if (pdo.apdoType === 'EPR_AVS') return `${formatVoltageMv(pdo.minimumVoltage100mV * 100)}-${formatVoltageMv(pdo.maximumVoltage100mV * 100)}, ${pdo.pdp1W}W EPR AVS`
  return 'Reserved augmented PDO'
}

const formatRequestLevels = (rdo: ParsedRDO, type: RequestType): string[] => {
  if (type === 'battery') {
    return [
      `Operating power: ${formatScaledValue(rdo.battery.operatingPower250mW * 0.25)}W`,
      `Maximum operating power: ${formatScaledValue(rdo.battery.maximumOperatingPower250mW * 0.25)}W`,
    ]
  }
  if (type === 'pps') {
    return [`Output voltage: ${formatVoltageMv(rdo.pps.outputVoltage20mV * 20)}`, `Operating current: ${formatCurrentMa(rdo.pps.operatingCurrent50mA * 50)}`]
  }
  if (type === 'avs') {
    return [`Output voltage: ${formatVoltageMv(rdo.avs.outputVoltage25mV * 25)}`, `Operating current: ${formatCurrentMa(rdo.avs.operatingCurrent50mA * 50)}`]
  }
  return [
    `Operating current: ${formatCurrentMa(rdo.fixedVariable.operatingCurrent10mA * 10)}`,
    `Maximum operating current: ${formatCurrentMa(rdo.fixedVariable.maximumOperatingCurrent10mA * 10)}`,
  ]
}

const requestTypeLabel = (type: RequestType): string => ({
  fixed_variable: 'Fixed/Variable',
  battery: 'Battery',
  pps: 'PPS',
  avs: 'SPR AVS',
})[type]

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
  ///< Source PDO referenced by the RDO when captured capability context is available.
  public referencedPDO: ParsedPDO | null = null
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

  public setReferencedPDO(pdo: ParsedPDO, resolution: RequestTypeResolution): void {
    if (!this.rdo) return
    this.referencedPDO = pdo
    this.rdo.requestTypeResolution = resolution
    this.rdo.requestTypeHint = resolution.type
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

    const resolution = this.rdo.requestTypeResolution
    const lines = [
      '**Power request:**',
      '',
      `- Selected source object position: ${this.rdo.objectPosition}`,
    ]
    if (resolution.confidence === 'guessed') {
      lines.push('', '**Request type guessed — matching Source_Capabilities unavailable.**')
      for (const candidate of resolution.candidates) {
        lines.push('', `**${requestTypeLabel(candidate)} interpretation:**`, ...formatRequestLevels(this.rdo, candidate).map((level) => `- ${level}`))
      }
    } else {
      lines.push(`- Request type: ${requestTypeLabel(resolution.type)}`, ...formatRequestLevels(this.rdo, resolution.type).map((level) => `- ${level}`))
      if (this.referencedPDO) lines.push('', '**Referenced source PDO:**', `- ${formatReferencedPdo(this.referencedPDO)}`)
    }

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
        'Concise description of the power request carried by this Request message.',
      ),
    )

    if (this.rdo) {
      metadata.messageSpecificData.setEntry('requestDataObject', buildRDOMetadata(this.rdo))
    }
    if (this.referencedPDO) {
      const referencedPdoMetadata = buildPDOMetadata(this.referencedPDO)
      metadata.messageSpecificData.setEntry(
        'referencedPowerDataObject',
        new HumanReadableField(
          'OrderedDictionary',
          referencedPdoMetadata.value,
          'Referenced Power Data Object',
          'Full captured source Power Data Object selected by this Request Data Object.',
        ),
      )
    }
    return metadata
  }

}
