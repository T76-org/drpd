import { SinkInquiryType } from '../../../lib/device'
import { parseManufacturerInfoDataBlock } from '../../../lib/device/drpd/usb-pd/DataObjects'
import { batteryReferencesFromScedb } from './batteryWorkflow'
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
    return {
      references: [],
      summary: `Battery discovery: ${describeFailure(discovery)}. No battery manufacturer requests were sent.`,
    }
  }

  const references = batteryReferencesFromScedb(discovery.rawResponse)
  if (!references.length) {
    return { references, summary: 'Battery discovery: the Source advertised no batteries.' }
  }

  const lines = [`Battery discovery: ${references.length} available (${references.join(', ')}).`]
  for (const batteryReference of references) {
    onProgress?.(`Requesting manufacturer identity for battery ${batteryReference}…`)
    const result = await runSinkInquiry(client, {
      type: SinkInquiryType.GET_MANUFACTURER_INFO,
      target: 'BATTERY',
      batteryReference,
    })
    if (result.phase !== 'response') {
      lines.push(`Battery ${batteryReference}: ${describeFailure(result)}.`)
      continue
    }
    try {
      const identity = parseManufacturerInfoDataBlock(result.rawResponse)
      lines.push(
        `Battery ${batteryReference}: VID 0x${identity.vid.toString(16).toUpperCase().padStart(4, '0')}, ` +
        `PID 0x${identity.pid.toString(16).toUpperCase().padStart(4, '0')}, ` +
        `manufacturer ${identity.manufacturerString || '(empty)'}.`,
      )
    } catch (error) {
      lines.push(`Battery ${batteryReference}: malformed response (${error instanceof Error ? error.message : String(error)}).`)
    }
  }
  return { references, summary: lines.join('\n') }
}
