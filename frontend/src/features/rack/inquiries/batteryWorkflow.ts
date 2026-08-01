import { SinkInquiryType } from '../../../lib/device'
import { parseBatteryCapabilitiesDataBlock, parseSourceCapabilitiesExtendedDataBlock } from '../../../lib/device/drpd/usb-pd/DataObjects'
import { decodeInquiryResponse } from './decode'
import { formatSinkInquiryOutcome } from './presentation'
import { withSinkInquiryLease, type InquiryRunState, type SerialInquiryWorkflowStep, type SinkInquiryClient } from './runner'

export const BATTERY_CAPABILITIES_EVENT_TITLE = 'INQUIRY - Battery capabilities'

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')

const describeFailure = (result: InquiryRunState): string => {
  if (result.phase === 'terminal') return formatSinkInquiryOutcome(result.status.outcome)
  if (result.phase === 'transportError') return `Communication error: ${result.message}`
  if (result.phase === 'superseded') return `Superseded by request ${result.status.requestId}`
  if (result.phase === 'cancelled') return 'Cancelled'
  return `Incomplete (${result.phase})`
}

const formatCapacity = (raw: number): string => {
  if (raw === 0) return 'battery not present'
  if (raw === 0xffff) return 'unknown'
  return `${(raw / 10).toFixed(1)} Wh`
}

const describeBatteryReference = (reference: number): string =>
  reference < 4 ? `fixed battery ${reference}` : `hot-swappable slot ${reference - 4}`

export interface BatteryCapabilitiesSurveyResult {
  references: number[]
  summary: string
}

/** Discover advertised batteries and query Battery_Capabilities for each reference serially. */
export const surveyBatteryCapabilities = async (
  client: SinkInquiryClient,
): Promise<BatteryCapabilitiesSurveyResult> => withSinkInquiryLease(client, async (run) => {
  const discovery = await run({ type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED })
  if (discovery.phase !== 'response') {
    return {
      references: [],
      summary: `Battery discovery: ${describeFailure(discovery)}. No Battery_Capabilities requests were sent.`,
    }
  }

  let references: number[]
  let fixedBatteries: number
  let hotSwappableBatterySlots: number
  try {
    decodeInquiryResponse(discovery.status, discovery.rawResponse, discovery.request)
    const extendedCapabilities = parseSourceCapabilitiesExtendedDataBlock(discovery.rawResponse)
    fixedBatteries = extendedCapabilities.fixedBatteries
    hotSwappableBatterySlots = extendedCapabilities.hotSwappableBatterySlots
    references = batteryReferencesFromScedb(discovery.rawResponse)
  } catch (error) {
    return {
      references: [],
      summary: `Battery discovery: malformed response (${error instanceof Error ? error.message : String(error)}). Raw: ${bytesToHex(discovery.rawResponse) || '(empty)'}.`,
    }
  }

  const lines = [
    `Battery discovery: ${fixedBatteries} fixed, ${hotSwappableBatterySlots} hot-swappable; ${references.length} total (${references.join(', ') || 'none'}).`,
    `Source_Capabilities_Extended raw: ${bytesToHex(discovery.rawResponse)}.`,
  ]
  for (const batteryReference of references) {
    const request = { type: SinkInquiryType.GET_BATTERY_CAP, batteryReference } as const
    const result = await run(request)
    if (result.phase !== 'response') {
      lines.push(`Battery ${batteryReference} (${describeBatteryReference(batteryReference)}): ${describeFailure(result)}.`)
      continue
    }
    try {
      decodeInquiryResponse(result.status, result.rawResponse, result.request)
      const capabilities = parseBatteryCapabilitiesDataBlock(result.rawResponse)
      const invalidReference = (capabilities.batteryType & 0x01) !== 0
      lines.push(
        `Battery ${batteryReference} (${describeBatteryReference(batteryReference)}): ` +
        `VID 0x${capabilities.vid.toString(16).toUpperCase().padStart(4, '0')}, ` +
        `PID 0x${capabilities.pid.toString(16).toUpperCase().padStart(4, '0')}, ` +
        `design capacity ${formatCapacity(capabilities.batteryDesignCapacity)}, ` +
        `last full charge capacity ${formatCapacity(capabilities.batteryLastFullChargeCapacity)}, ` +
        `reference ${invalidReference ? 'invalid' : 'valid'}; raw ${bytesToHex(result.rawResponse)}.`,
      )
    } catch (error) {
      lines.push(`Battery ${batteryReference} (${describeBatteryReference(batteryReference)}): malformed response (${error instanceof Error ? error.message : String(error)}); raw ${bytesToHex(result.rawResponse) || '(empty)'}.`)
    }
  }
  return { references, summary: lines.join('\n') }
})

export const batteryReferencesFromScedb = (body: Uint8Array): number[] => {
  if (body.length !== 24 && body.length !== 25) throw new Error('SCEDB must contain exactly 24 or 25 bytes')
  const block = parseSourceCapabilitiesExtendedDataBlock(body)
  if (block.fixedBatteries > 4 || block.hotSwappableBatterySlots > 4) throw new Error('SCEDB battery counts exceed protocol bounds')
  return [
    ...Array.from({ length: block.fixedBatteries }, (_, index) => index),
    ...Array.from({ length: block.hotSwappableBatterySlots }, (_, index) => index + 4),
  ]
}

/** Build strict Cap→Status pairs for explicit references; invalid-reference results remain visible. */
export const buildBatterySurveySteps = (references: readonly number[]): SerialInquiryWorkflowStep[] => {
  if (references.length > 8 || new Set(references).size !== references.length || references.some((reference) => !Number.isInteger(reference) || reference < 0 || reference > 7)) {
    throw new Error('Battery survey references must be unique integers from 0 to 7')
  }
  return references.flatMap((batteryReference) => [
    { id: `battery-${batteryReference}-capabilities`, request: { type: SinkInquiryType.GET_BATTERY_CAP, batteryReference } },
    { id: `battery-${batteryReference}-status`, request: { type: SinkInquiryType.GET_BATTERY_STATUS, batteryReference } },
  ])
}

export const buildAllBatterySurveySteps = (): SerialInquiryWorkflowStep[] =>
  buildBatterySurveySteps([0, 1, 2, 3, 4, 5, 6, 7])
