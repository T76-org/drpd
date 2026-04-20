import { DataMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import { buildPDOMetadata, parsePDO, readDataObjects, type ParsedPDO } from '../DataObjects'

const formatScaledValue = (value: number): string => {
  return Number(value.toFixed(2)).toString()
}

const formatVoltageMv = (valueMv: number): string => `${formatScaledValue(valueMv / 1000)}V`

const formatCurrentMa = (valueMa: number): string => `${formatScaledValue(valueMa / 1000)}A`

const formatPowerMw = (valueMw: number): string => `${formatScaledValue(valueMw / 1000)}W`

const formatRaw32 = (value: number): string => `0x${value.toString(16).toUpperCase().padStart(8, '0')}`

const appendProfile = (groups: Map<string, string[]>, groupName: string, description: string): void => {
  const entries = groups.get(groupName) ?? []
  entries.push(description)
  groups.set(groupName, entries)
}

const formatSourcePDOProfile = (pdo: ParsedPDO, groups: Map<string, string[]>): void => {
  if (pdo.pdoType === 'FIXED') {
    appendProfile(
      groups,
      'Fixed power profiles',
      `${formatVoltageMv(pdo.voltage50mV * 50)} @ ${formatCurrentMa(pdo.current10mA * 10)}`,
    )
    return
  }

  if (pdo.pdoType === 'VARIABLE') {
    const profile = `${formatVoltageMv(pdo.minimumVoltage50mV * 50)}-${formatVoltageMv(pdo.maximumVoltage50mV * 50)}`
    appendProfile(
      groups,
      'Variable power profiles',
      `${profile} @ ${formatCurrentMa(pdo.current10mA * 10)}`,
    )
    return
  }

  if (pdo.pdoType === 'BATTERY') {
    const profile = `${formatVoltageMv(pdo.minimumVoltage50mV * 50)}-${formatVoltageMv(pdo.maximumVoltage50mV * 50)}`
    appendProfile(
      groups,
      'Battery power profiles',
      `${profile} @ ${formatPowerMw(pdo.power250mW * 250)}`,
    )
    return
  }

  if (pdo.apdoType === 'SPR_PPS') {
    const profile = `${formatVoltageMv(pdo.minimumVoltage100mV * 100)}-${formatVoltageMv(pdo.maximumVoltage100mV * 100)}`
    appendProfile(
      groups,
      'Programmable power profiles',
      `${profile} @ ${formatCurrentMa(pdo.maximumCurrent50mA * 50)} PPS${pdo.ppsPowerLimited ? ' (power limited)' : ''}`,
    )
    return
  }

  if (pdo.apdoType === 'SPR_AVS') {
    const profile = `15V @ ${formatCurrentMa(pdo.maxCurrent15V10mA * 10)}, 20V @ ${formatCurrentMa(pdo.maxCurrent20V10mA * 10)}`
    appendProfile(
      groups,
      'Adjustable voltage profiles',
      `SPR AVS: ${profile}`,
    )
    return
  }

  if (pdo.apdoType === 'EPR_AVS') {
    const profile = `${formatVoltageMv(pdo.minimumVoltage100mV * 100)}-${formatVoltageMv(pdo.maximumVoltage100mV * 100)}`
    appendProfile(
      groups,
      'Adjustable voltage profiles',
      `${profile}, ${pdo.pdp1W}W EPR AVS`,
    )
    return
  }

  appendProfile(groups, 'Reserved profiles', `Reserved APDO ${formatRaw32(pdo.raw)}`)
}

/**
 * Source_Capabilities data message.
 */
export class SourceCapabilitiesMessage extends DataMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw data object values.
  public readonly rawDataObjects: number[]
  ///< Decoded PDOs.
  public readonly decodedPDOs: ParsedPDO[]
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create a Source_Capabilities message.
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
    const expectedCount = header.messageHeader.numberOfDataObjects
    const availableCount = Math.floor(this.rawPayload.length / 4)
    const count = Math.min(expectedCount, availableCount)
    if (expectedCount > availableCount) {
      this.parseErrors.push(
        `Source_Capabilities expected ${expectedCount} data objects but only ${availableCount} available`,
      )
    }
    this.rawDataObjects = readDataObjects(payload, this.payloadOffset, count)
    this.decodedPDOs = this.rawDataObjects.map((raw) => parsePDO(raw, 'source'))
  }

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Multiline summary of the advertised source capabilities.
   */
  public describe(): string {
    if (this.decodedPDOs.length === 0) {
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `The source did not provide any parseable power profiles.${parseErrorText}`.trim()
    }

    const groups = new Map<string, string[]>()
    this.decodedPDOs.forEach((pdo) => formatSourcePDOProfile(pdo, groups))

    const fixedPdos = this.decodedPDOs.filter((pdo) => pdo.pdoType === 'FIXED')
    const sourceFacts: string[] = []
    if (fixedPdos.some((pdo) => pdo.eprCapable)) {
      sourceFacts.push('Supports EPR mode.')
    }
    if (fixedPdos.some((pdo) => pdo.unchunkedExtendedMessagesSupported)) {
      sourceFacts.push('Supports unchunked extended messages.')
    }
    if (fixedPdos.some((pdo) => pdo.dualRolePower)) {
      sourceFacts.push('Supports dual-role power.')
    }
    if (fixedPdos.some((pdo) => pdo.dualRoleData)) {
      sourceFacts.push('Supports dual-role data.')
    }
    if (fixedPdos.some((pdo) => pdo.usbCommunicationsCapable)) {
      sourceFacts.push('Supports USB communications.')
    }
    if (fixedPdos.some((pdo) => pdo.unconstrainedPower)) {
      sourceFacts.push('Reports unconstrained power.')
    }

    const lines = ['The source is reporting the following capabilities:']
    if (sourceFacts.length > 0) {
      lines.push('', ...sourceFacts)
    }

    groups.forEach((entries, groupName) => {
      lines.push('', `${groupName}:`, ...entries.map((entry) => `- ${entry}`))
    })

    if (this.parseErrors.length > 0) {
      lines.push('', `Could not decode all advertised objects: ${this.parseErrors.join(' ')}`)
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
        'Source_Capabilities is a data message that advertises source power data objects so sinks can select and request a suitable power contract.',
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
        'Concise description of the specific capabilities advertised by this Source_Capabilities message.',
      ),
    )

    if (this.decodedPDOs.length > 0) {
      const powerDataObjects = HumanReadableField.orderedDictionary(
        'Power Data Objects',
        'Ordered collection of source Power Data Objects advertised by the Source_Capabilities message.',
      )
      this.decodedPDOs.forEach((pdo, index) => {
        powerDataObjects.setEntry(`pdo${index + 1}`, buildPDOMetadata(pdo))
      })
      metadata.messageSpecificData.setEntry('powerDataObjects', powerDataObjects)
    }
    return metadata
  }

}
