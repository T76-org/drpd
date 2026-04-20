import { DataMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import { buildPDOMetadata, parsePDO, readDataObjects, type ParsedPDO } from '../DataObjects'

const formatScaledValue = (value: number): string => Number(value.toFixed(2)).toString()

const formatVoltageMv = (valueMv: number): string => `${formatScaledValue(valueMv / 1000)}V`

const formatCurrentMa = (valueMa: number): string => `${formatScaledValue(valueMa / 1000)}A`

const formatPowerMw = (valueMw: number): string => `${formatScaledValue(valueMw / 1000)}W`

const formatRaw32 = (value: number): string => `0x${value.toString(16).toUpperCase().padStart(8, '0')}`

const appendProfile = (groups: Map<string, string[]>, groupName: string, description: string): void => {
  const entries = groups.get(groupName) ?? []
  entries.push(description)
  groups.set(groupName, entries)
}

const formatFastRoleSwapRequiredCurrent = (code: number): string | null => {
  switch (code) {
    case 0:
      return null
    case 1:
      return 'Fast Role Swap requires default USB port current.'
    case 2:
      return 'Fast Role Swap requires 1.5A at 5V.'
    case 3:
      return 'Fast Role Swap requires 3A at 5V.'
    default:
      return `Fast Role Swap uses reserved current code ${code}.`
  }
}

const formatSinkPDOProfile = (pdo: ParsedPDO, groups: Map<string, string[]>): void => {
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
      `${profile} @ ${formatCurrentMa(pdo.maximumCurrent50mA * 50)} Programmable Power Supply`,
    )
    return
  }

  if (pdo.apdoType === 'SPR_AVS') {
    appendProfile(
      groups,
      'Adjustable voltage profiles',
      `Standard Power Range Adjustable Voltage Supply: 15V @ ${formatCurrentMa(pdo.maxCurrent15V10mA * 10)}, 20V @ ${formatCurrentMa(pdo.maxCurrent20V10mA * 10)}`,
    )
    return
  }

  if (pdo.apdoType === 'EPR_AVS') {
    const profile = `${formatVoltageMv(pdo.minimumVoltage100mV * 100)}-${formatVoltageMv(pdo.maximumVoltage100mV * 100)}`
    appendProfile(
      groups,
      'Adjustable voltage profiles',
      `${profile}, ${pdo.pdp1W}W Extended Power Range Adjustable Voltage Supply`,
    )
    return
  }

  appendProfile(groups, 'Reserved profiles', `Reserved augmented Power Data Object ${formatRaw32(pdo.raw)}`)
}

/**
 * Sink_Capabilities data message.
 */
export class SinkCapabilitiesMessage extends DataMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw data object values.
  public readonly rawDataObjects: number[]
  ///< Decoded PDOs.
  public readonly decodedPDOs: ParsedPDO[]
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create a Sink_Capabilities message.
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
        `Sink_Capabilities expected ${expectedCount} data objects but only ${availableCount} available`,
      )
    }
    this.rawDataObjects = readDataObjects(payload, this.payloadOffset, count)
    this.decodedPDOs = this.rawDataObjects.map((raw) => parsePDO(raw, 'sink'))
  }

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Markdown summary of the advertised sink capabilities.
   */
  public describe(): string {
    if (this.decodedPDOs.length === 0) {
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `The sink did not provide any parseable power profiles.${parseErrorText}`.trim()
    }

    const groups = new Map<string, string[]>()
    this.decodedPDOs.forEach((pdo) => formatSinkPDOProfile(pdo, groups))

    const fixedPdos = this.decodedPDOs.filter((pdo) => pdo.pdoType === 'FIXED')
    const sinkFacts: string[] = []
    if (fixedPdos.some((pdo) => pdo.dualRolePower)) {
      sinkFacts.push('Supports dual-role power.')
    }
    if (fixedPdos.some((pdo) => pdo.dualRoleData)) {
      sinkFacts.push('Supports dual-role data.')
    }
    if (fixedPdos.some((pdo) => pdo.usbCommunicationsCapable)) {
      sinkFacts.push('Supports USB communications.')
    }
    if (fixedPdos.some((pdo) => pdo.usbSuspendSupportedOrHigherCapability)) {
      sinkFacts.push('Reports higher capability.')
    }
    if (fixedPdos.some((pdo) => pdo.unconstrainedPower)) {
      sinkFacts.push('Reports unconstrained power.')
    }
    fixedPdos.forEach((pdo) => {
      if (pdo.fastRoleSwapRequiredCurrent !== null) {
        const fastRoleSwap = formatFastRoleSwapRequiredCurrent(pdo.fastRoleSwapRequiredCurrent)
        if (fastRoleSwap) {
          sinkFacts.push(fastRoleSwap)
        }
      }
    })

    const lines = ['The sink is reporting the following capabilities:']
    if (sinkFacts.length > 0) {
      lines.push('', ...sinkFacts)
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
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Sink_Capabilities is a data message that advertises sink power data objects so a source can choose compatible supply options for negotiation.', 'Message Description', 'A description of the message\'s function and usage.'))
    metadata.baseInformation.insertEntryAt(
      2,
      'messageSummary',
      HumanReadableField.string(
        this.describe(),
        'Message Summary',
        'Concise description of the specific capabilities advertised by this Sink_Capabilities message.',
      ),
    )

    if (this.decodedPDOs.length > 0) {
      const powerDataObjects = HumanReadableField.orderedDictionary(
        'Power Data Objects',
        'Ordered collection of sink Power Data Objects advertised by the Sink_Capabilities message.',
      )
      this.decodedPDOs.forEach((pdo, index) => powerDataObjects.setEntry(`pdo${index + 1}`, buildPDOMetadata(pdo)))
      metadata.messageSpecificData.setEntry('powerDataObjects', powerDataObjects)
    }
    return metadata
  }

}
