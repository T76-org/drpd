import { ExtendedMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import { buildPDOMetadata, parsePDO, readDataObjects, type ParsedPDO } from '../DataObjects'

const formatScaledValue = (value: number): string => Number(value.toFixed(2)).toString()

const formatVoltageMv = (valueMv: number): string => `${formatScaledValue(valueMv / 1000)}V`

const formatCurrentMa = (valueMa: number): string => `${formatScaledValue(valueMa / 1000)}A`

const formatPowerMw = (valueMw: number): string => `${formatScaledValue(valueMw / 1000)}W`

const formatRaw32 = (value: number): string => `0x${value.toString(16).toUpperCase().padStart(8, '0')}`

const appendProfile = (groups: Map<string, string[]>, rangeName: string, profileType: string, description: string): void => {
  const groupName = `${rangeName} ${profileType}`
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

const formatSinkPDOProfile = (pdo: ParsedPDO, rangeName: string, groups: Map<string, string[]>): void => {
  if (pdo.pdoType === 'FIXED') {
    appendProfile(
      groups,
      rangeName,
      'fixed power profiles',
      `${formatVoltageMv(pdo.voltage50mV * 50)} @ ${formatCurrentMa(pdo.current10mA * 10)}`,
    )
    return
  }

  if (pdo.pdoType === 'VARIABLE') {
    const profile = `${formatVoltageMv(pdo.minimumVoltage50mV * 50)}-${formatVoltageMv(pdo.maximumVoltage50mV * 50)}`
    appendProfile(
      groups,
      rangeName,
      'variable power profiles',
      `${profile} @ ${formatCurrentMa(pdo.current10mA * 10)}`,
    )
    return
  }

  if (pdo.pdoType === 'BATTERY') {
    const profile = `${formatVoltageMv(pdo.minimumVoltage50mV * 50)}-${formatVoltageMv(pdo.maximumVoltage50mV * 50)}`
    appendProfile(
      groups,
      rangeName,
      'battery power profiles',
      `${profile} @ ${formatPowerMw(pdo.power250mW * 250)}`,
    )
    return
  }

  if (pdo.apdoType === 'SPR_PPS') {
    const profile = `${formatVoltageMv(pdo.minimumVoltage100mV * 100)}-${formatVoltageMv(pdo.maximumVoltage100mV * 100)}`
    appendProfile(
      groups,
      rangeName,
      'programmable power profiles',
      `${profile} @ ${formatCurrentMa(pdo.maximumCurrent50mA * 50)} Programmable Power Supply`,
    )
    return
  }

  if (pdo.apdoType === 'SPR_AVS') {
    appendProfile(
      groups,
      rangeName,
      'adjustable voltage profiles',
      `Standard Power Range Adjustable Voltage Supply: 15V @ ${formatCurrentMa(pdo.maxCurrent15V10mA * 10)}, 20V @ ${formatCurrentMa(pdo.maxCurrent20V10mA * 10)}`,
    )
    return
  }

  if (pdo.apdoType === 'EPR_AVS') {
    const profile = `${formatVoltageMv(pdo.minimumVoltage100mV * 100)}-${formatVoltageMv(pdo.maximumVoltage100mV * 100)}`
    appendProfile(
      groups,
      rangeName,
      'adjustable voltage profiles',
      `${profile}, ${pdo.pdp1W}W Extended Power Range Adjustable Voltage Supply`,
    )
    return
  }

  appendProfile(groups, rangeName, 'reserved profiles', `Reserved augmented Power Data Object ${formatRaw32(pdo.raw)}`)
}

/**
 * EPR_Sink_Capabilities extended message.
 */
export class EPRSinkCapabilitiesMessage extends ExtendedMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw PDO values.
  public readonly rawPDOs: number[]
  ///< Parsed SPR PDOs (first 7).
  public readonly sprPDOs: ParsedPDO[]
  ///< Parsed EPR PDOs (remaining).
  public readonly eprPDOs: ParsedPDO[]
  ///< Data size from extended header.
  public readonly dataSize: number
  ///< Chunked flag.
  public readonly chunked: boolean
  ///< Chunk number.
  public readonly chunkNumber: number
  ///< Request chunk flag.
  public readonly requestChunk: boolean
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create an EPR_Sink_Capabilities message.
   *
   * @param sop - SOP metadata.
   * @param header - Parsed header.
   * @param payload - Raw payload bytes.
   * @param messageTypeName - Message type name.
   */
  public constructor(
    sop: ExtendedMessage['sop'],
    header: ExtendedMessage['header'],
    payload: Uint8Array,
    messageTypeName: string,
  ) {
    super(sop, header, payload, messageTypeName)
    this.parseErrors = []
    const extended = header.extendedHeader
    this.dataSize = extended?.dataSize ?? 0
    this.chunked = extended?.chunked ?? false
    this.chunkNumber = extended?.chunkNumber ?? 0
    this.requestChunk = extended?.requestChunk ?? false
    this.rawPayload = payload.subarray(this.payloadOffset)
    const dataEnd = this.payloadOffset + this.dataSize
    const payloadComplete = payload.length >= dataEnd
    if (payload.length < dataEnd) {
      this.parseErrors.push(
        `EPR_Sink_Capabilities expected ${this.dataSize} bytes but only ${payload.length - this.payloadOffset} available`,
      )
    }
    const dataBlock = payload.subarray(this.payloadOffset, Math.min(dataEnd, payload.length))
    const pdoCount = payloadComplete ? Math.floor(dataBlock.length / 4) : 0
    this.rawPDOs = pdoCount > 0 ? readDataObjects(dataBlock, 0, pdoCount) : []
    const decoded = this.rawPDOs.map((raw) => parsePDO(raw, 'sink'))
    this.sprPDOs = decoded.slice(0, 7)
    this.eprPDOs = decoded.slice(7)
  }

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Markdown summary of the advertised Standard Power Range and Extended Power Range sink capabilities.
   */
  public describe(): string {
    const decodedPDOs = [...this.sprPDOs, ...this.eprPDOs]
    if (decodedPDOs.length === 0) {
      if (this.rawPayload.length < this.dataSize) {
        return `The Extended Power Range Sink Capabilities message has only been partially transferred: expected ${this.dataSize} bytes but received ${this.rawPayload.length}.`
      }
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `The sink did not provide any parseable power profiles.${parseErrorText}`.trim()
    }

    const groups = new Map<string, string[]>()
    this.sprPDOs.forEach((pdo) => formatSinkPDOProfile(pdo, 'Standard Power Range', groups))
    this.eprPDOs.forEach((pdo) => formatSinkPDOProfile(pdo, 'Extended Power Range', groups))

    const fixedPdos = decodedPDOs.filter((pdo) => pdo.pdoType === 'FIXED')
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

    const lines = ['The sink is reporting the following Extended Power Range capabilities:']
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
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('EPR_Sink_Capabilities is an extended message that advertises sink EPR capability data so a source can select and negotiate compatible high-power operating ranges.', 'Message Description', 'A description of the message\'s function and usage.'))
    metadata.baseInformation.insertEntryAt(
      2,
      'messageSummary',
      HumanReadableField.string(
        this.describe(),
        'Message Summary',
        'Concise description of the specific Standard Power Range and Extended Power Range sink capabilities advertised by this EPR_Sink_Capabilities message.',
      ),
    )

    const decodedPDOs = [...this.sprPDOs, ...this.eprPDOs]
    if (decodedPDOs.length > 0) {
      const powerDataObjects = HumanReadableField.orderedDictionary(
        'Power Data Objects',
        'Ordered collection of sink Power Data Objects advertised by the EPR_Sink_Capabilities message.',
      )
      decodedPDOs.forEach((pdo, index) => powerDataObjects.setEntry(`pdo${index + 1}`, buildPDOMetadata(pdo)))
      metadata.messageSpecificData.setEntry('powerDataObjects', powerDataObjects)
    }
    return metadata
  }

}
