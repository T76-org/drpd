import { SinkInquiryType, type SinkInquiryCablePlug } from '../../../lib/device'
import { formatSinkInquiryOutcome } from './presentation'
import { decodeInquiryResponse } from './decode'
import { withSinkInquiryLease, type InquiryRunState, type SerialInquiryWorkflowStep, type SinkInquiryClient } from './runner'
import { parseSVIDsVDO, readDataObjects } from '../../../lib/device/drpd/usb-pd/DataObjects'

export const PORT_PARTNER_IDENTITY_EVENT_TITLE = 'INQUIRY - Port Partner identity'
export const PORT_PARTNER_SVIDS_EVENT_TITLE = 'INQUIRY - Port Partner SVIDs'

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')

const describeFailure = (result: InquiryRunState): string => {
  if (result.phase === 'terminal') return formatSinkInquiryOutcome(result.status.outcome)
  if (result.phase === 'transportError') return `Communication error: ${result.message}`
  if (result.phase === 'superseded') return `Superseded by request ${result.status.requestId}`
  if (result.phase === 'cancelled') return 'Cancelled'
  return `Incomplete (${result.phase})`
}

export interface VdmDiscoverySurveyResult {
  summary: string
}

/** Discover and decode the SOP Port Partner identity into one event-ready summary. */
export const surveyPortPartnerIdentity = async (
  client: SinkInquiryClient,
): Promise<VdmDiscoverySurveyResult> => withSinkInquiryLease(client, async (run) => {
  const result = await run({ type: SinkInquiryType.DISCOVER_IDENTITY })
  if (result.phase !== 'response') return { summary: `Discover Identity: ${describeFailure(result)}.` }
  try {
    const decoded = decodeInquiryResponse(result.status, result.rawResponse, result.request)
    return {
      summary: `Discover Identity: response received.\nDecoded:\n${decoded.summary}\nRaw VDO bytes: ${bytesToHex(result.rawResponse)}.`,
    }
  } catch (error) {
    return {
      summary: `Discover Identity: malformed response (${error instanceof Error ? error.message : String(error)}). Raw VDO bytes: ${bytesToHex(result.rawResponse) || '(empty)'}.`,
    }
  }
})

/** Discover all SOP Port Partner SVID pages, bounded to eight requests. */
export const surveyPortPartnerSvids = async (
  client: SinkInquiryClient,
): Promise<VdmDiscoverySurveyResult> => withSinkInquiryLease(client, async (run) => {
  const pages: number[][] = []
  const lines: string[] = []
  for (let pageIndex = 0; pageIndex < 8; pageIndex += 1) {
    const result = await run({ type: SinkInquiryType.DISCOVER_SVIDS })
    if (result.phase !== 'response') {
      lines.push(`Page ${pageIndex + 1}: ${describeFailure(result)}.`)
      const discovered = deduplicateOrderedSvids(pages)
      lines.unshift(`Discovered ${discovered.length} unique SVIDs before termination: ${discovered.map((svid) => `0x${svid.toString(16).toUpperCase().padStart(4, '0')}`).join(', ') || 'none'}.`)
      return { summary: lines.join('\n') }
    }
    try {
      decodeInquiryResponse(result.status, result.rawResponse, result.request)
      const parsed = parseDiscoverSvidPage(result.rawResponse)
      pages.push(parsed.ordered)
      lines.push(`Page ${pageIndex + 1}: ${parsed.ordered.map((svid) => `0x${svid.toString(16).toUpperCase().padStart(4, '0')}`).join(', ') || 'no SVIDs'}; raw ${bytesToHex(result.rawResponse)}.`)
      if (parsed.complete) {
        const discovered = deduplicateOrderedSvids(pages)
        lines.unshift(`Discovered ${discovered.length} unique SVIDs: ${discovered.map((svid) => `0x${svid.toString(16).toUpperCase().padStart(4, '0')}`).join(', ') || 'none'}.`)
        return { summary: lines.join('\n') }
      }
    } catch (error) {
      lines.push(`Page ${pageIndex + 1}: malformed response (${error instanceof Error ? error.message : String(error)}); raw ${bytesToHex(result.rawResponse) || '(empty)'}.`)
      const discovered = deduplicateOrderedSvids(pages)
      lines.unshift(`Discovered ${discovered.length} unique SVIDs before malformed response: ${discovered.map((svid) => `0x${svid.toString(16).toUpperCase().padStart(4, '0')}`).join(', ') || 'none'}.`)
      return { summary: lines.join('\n') }
    }
  }
  const discovered = deduplicateOrderedSvids(pages)
  lines.unshift(`Discovered ${discovered.length} unique SVIDs before the eight-page safety bound: ${discovered.map((svid) => `0x${svid.toString(16).toUpperCase().padStart(4, '0')}`).join(', ') || 'none'}.`)
  lines.push('Discovery stopped without a terminating SVID after eight pages.')
  return { summary: lines.join('\n') }
})

export const parseDiscoverSvidPage = (body: Uint8Array): { ordered: number[]; complete: boolean } => {
  if (body.length < 4 || body.length > 28 || body.length % 4 !== 0) throw new Error('Discover SVIDs body must contain 1 to 7 VDOs')
  const words = readDataObjects(body, 0, body.length / 4).slice(1)
  const ordered: number[] = []
  let complete = false
  for (const raw of words) for (const svid of [parseSVIDsVDO(raw).svid1, parseSVIDsVDO(raw).svid0]) {
    if (svid === 0) complete = true
    else if (complete) throw new Error('Discover SVIDs contains a nonzero SVID after its zero terminator')
    else ordered.push(svid)
  }
  return { ordered, complete: complete || ordered.length < 12 }
}

export const deduplicateOrderedSvids = (pages: readonly (readonly number[])[]): number[] => {
  const seen = new Set<number>()
  const result: number[] = []
  for (const page of pages) for (const svid of page) {
    if (!Number.isInteger(svid) || svid < 1 || svid > 0xffff) throw new Error('SVID must be an integer from 1 to 65535')
    if (!seen.has(svid)) { seen.add(svid); result.push(svid) }
  }
  return result
}

export const buildDiscoverModesSteps = (svids: readonly number[], plug?: SinkInquiryCablePlug): SerialInquiryWorkflowStep[] => {
  const unique = deduplicateOrderedSvids([svids])
  if (unique.length > 12) throw new Error('Discover Modes fan-out exceeds limit of 12')
  return unique.map((svid) => ({ id: `discover-modes-${svid.toString(16).padStart(4, '0')}`, request: { type: SinkInquiryType.DISCOVER_MODES, svid, ...(plug ? { plug } : {}) } }))
}

export const canRetryVdmSurveyStep = (attempts: number, nonRetryable = false, maxRetries = 2): boolean =>
  !nonRetryable && attempts <= maxRetries
