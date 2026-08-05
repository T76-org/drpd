import { SinkInquiryType, type LoggedEventDataSection } from '../../../lib/device'
import { parseManufacturerInfoDataBlock, parseSourceCapabilitiesExtendedDataBlock } from '../../../lib/device/drpd/usb-pd/DataObjects'
import {
  batteryReferencesFromScedb,
  buildBatteryDiscoverySection,
  describeBatteryReference,
  describeBatteryReferenceSummary,
  detailedValue,
  hex16,
  rawHexValue,
} from './batteryWorkflow'
import { decodeInquiryResponse } from './decode'
import { formatSinkInquiryOutcome } from './presentation'
import { runSinkInquiry, type InquiryRunState, type SinkInquiryClient } from './runner'

export const BATTERY_MANUFACTURER_IDENTITY_EVENT_TITLE =
  'INQUIRY - Battery manufacturer identity'

const describeFailure = (result: InquiryRunState): string => {
  if (result.phase === 'terminal') return formatSinkInquiryOutcome(result.status.outcome)
  if (result.phase === 'transportError') return `Communication error: ${result.message}`
  if (result.phase === 'superseded') return `Superseded by request ${result.status.requestId}`
  if (result.phase === 'cancelled') return 'Cancelled'
  return `Incomplete (${result.phase})`
}

export interface BatteryManufacturerSurveyResult {
  references: number[]
  summary: string
  eventData?: LoggedEventDataSection[]
}

const batterySectionTitle = (reference: number): string =>
  `Battery ${reference} — ${reference < 4 ? `Fixed battery ${reference}` : `Hot-swappable slot ${reference - 4}`}`

const failedBatterySection = (
  reference: number,
  outcome: string,
  raw?: Uint8Array,
  decodeError?: string,
): LoggedEventDataSection => ({
  title: batterySectionTitle(reference),
  entries: [
    { key: 'Battery Reference', value: detailedValue(`\`${reference}\``, `${describeBatteryReference(reference)}; advertised by Source Capabilities Extended.`) },
    { key: 'Outcome', value: outcome },
    ...(decodeError ? [{ key: 'Decode Error', value: decodeError }] : []),
    ...(raw ? [{ key: 'Raw Logical Response', value: detailedValue(rawHexValue(raw), 'Complete logical Manufacturer_Info response body.') }] : []),
  ],
})

const manufacturerSection = (reference: number, raw: Uint8Array): LoggedEventDataSection => {
  const identity = parseManufacturerInfoDataBlock(raw)
  const nullTerminated = raw.at(-1) === 0
  return {
    title: batterySectionTitle(reference),
    entries: [
      { key: 'Battery Reference', value: detailedValue(`\`${reference}\``, `${describeBatteryReference(reference)}; advertised by Source Capabilities Extended.`) },
      { key: 'Outcome', value: 'Response decoded successfully.' },
      { key: 'Vendor ID (bytes 0–1)', value: detailedValue(`**${hex16(identity.vid)}**`, `USB-IF Vendor ID. Raw little-endian bytes: ${rawHexValue(raw.subarray(0, 2))}.`) },
      { key: 'Product ID (bytes 2–3)', value: detailedValue(`**${hex16(identity.pid)}**`, `Product ID. Raw little-endian bytes: ${rawHexValue(raw.subarray(2, 4))}.`) },
      { key: 'Manufacturer String (bytes 4–end)', value: detailedValue(`**${identity.manufacturerString || '(empty)'}**`, `${nullTerminated ? 'Null-terminated' : 'Unterminated'} printable ASCII. Raw bytes${nullTerminated ? ' including terminator' : ''}: ${rawHexValue(identity.manufacturerStringBytes)}.`) },
      ...(!nullTerminated ? [{ key: 'Interoperability Warning', value: 'The Source omitted the required trailing null terminator. Dr. PD recovered the printable ASCII string using the declared Manufacturer_Info Data Size; raw bytes are preserved unchanged.' }] : []),
      { key: 'Battery Reference Validity', value: 'Advertised reference; Manufacturer_Info has no Invalid Battery Reference bit.' },
      { key: 'Raw Logical Response', value: detailedValue(rawHexValue(raw), 'Complete Manufacturer_Info response payload. The outer USB-PD packet header and CRC are not included.') },
    ],
  }
}

/** Discover advertised batteries and query Manufacturer_Info for each reference serially. */
export const surveyBatteryManufacturerIdentity = async (
  client: SinkInquiryClient,
  onProgress?: (message: string) => void,
): Promise<BatteryManufacturerSurveyResult> => {
  onProgress?.('Discovering available batteries…')
  const discovery = await runSinkInquiry(client, {
    type: SinkInquiryType.GET_SOURCE_CAP_EXTENDED,
  })
  if (discovery.phase !== 'response') {
    const failure = describeFailure(discovery)
    return {
      references: [],
      summary: `- **Battery discovery:** ${failure}. No battery manufacturer requests were sent.`,
      eventData: [{ title: 'Source Capabilities Extended', entries: [{ key: 'Outcome', value: failure }] }],
    }
  }

  let references: number[]
  let fixedBatteries: number
  let hotSwappableBatterySlots: number
  let discoverySection: LoggedEventDataSection
  try {
    decodeInquiryResponse(discovery.status, discovery.rawResponse, discovery.request)
    const capabilities = parseSourceCapabilitiesExtendedDataBlock(discovery.rawResponse)
    references = batteryReferencesFromScedb(discovery.rawResponse)
    fixedBatteries = capabilities.fixedBatteries
    hotSwappableBatterySlots = capabilities.hotSwappableBatterySlots
    discoverySection = buildBatteryDiscoverySection(capabilities, discovery.rawResponse, references)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      references: [],
      summary: `- **Battery discovery:** malformed response (${message}). No battery manufacturer requests were sent.`,
      eventData: [{
        title: 'Source Capabilities Extended',
        entries: [
          { key: 'Outcome', value: 'Malformed response.' },
          { key: 'Decode Error', value: message },
          { key: 'Raw Logical Response', value: rawHexValue(discovery.rawResponse) },
        ],
      }],
    }
  }
  if (!references.length) {
    return {
      references,
      summary: '- **Advertised batteries:** 0 total — 0 fixed, 0 hot-swappable.',
      eventData: [discoverySection],
    }
  }

  const lines = [`- **Advertised batteries:** ${references.length} total — ${fixedBatteries} fixed, ${hotSwappableBatterySlots} hot-swappable.`]
  const eventData: LoggedEventDataSection[] = [discoverySection]
  for (const batteryReference of references) {
    onProgress?.(`Requesting manufacturer identity for battery ${batteryReference}…`)
    const result = await runSinkInquiry(client, {
      type: SinkInquiryType.GET_MANUFACTURER_INFO,
      target: 'BATTERY',
      batteryReference,
    })
    if (result.phase !== 'response') {
      const failure = describeFailure(result)
      lines.push(
        `- **Battery ${batteryReference} (${describeBatteryReferenceSummary(batteryReference)}):**`,
        `  - **Outcome:** ${failure}.`,
      )
      eventData.push(failedBatterySection(batteryReference, failure))
      continue
    }
    try {
      decodeInquiryResponse(result.status, result.rawResponse, result.request)
      const identity = parseManufacturerInfoDataBlock(result.rawResponse)
      lines.push(
        `- **Battery ${batteryReference} (${describeBatteryReferenceSummary(batteryReference)}):**`,
        `  - **VID:** ${hex16(identity.vid)}`,
        `  - **PID:** ${hex16(identity.pid)}`,
        `  - **Manufacturer:** ${identity.manufacturerString || '(empty)'}`,
        '  - **Battery reference:** Advertised',
      )
      eventData.push(manufacturerSection(batteryReference, result.rawResponse))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      lines.push(
        `- **Battery ${batteryReference} (${describeBatteryReferenceSummary(batteryReference)}):**`,
        `  - **Outcome:** Malformed response (${message}).`,
      )
      eventData.push(failedBatterySection(batteryReference, 'Malformed response.', result.rawResponse, message))
    }
  }
  return { references, summary: lines.join('\n'), eventData }
}
