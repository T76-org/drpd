import { SinkInquiryType } from '../../../lib/device'
import type { SerialInquiryWorkflowStep } from './runner'
import { parseSVIDsVDO, readDataObjects } from '../../../lib/device/drpd/usb-pd/DataObjects'

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

export const buildDiscoverModesSteps = (svids: readonly number[]): SerialInquiryWorkflowStep[] => {
  const unique = deduplicateOrderedSvids([svids])
  if (unique.length > 12) throw new Error('Discover Modes fan-out exceeds limit of 12')
  return unique.map((svid) => ({ id: `discover-modes-${svid.toString(16).padStart(4, '0')}`, request: { type: SinkInquiryType.DISCOVER_MODES, svid } }))
}

export const canRetryVdmSurveyStep = (attempts: number, nonRetryable = false, maxRetries = 2): boolean =>
  !nonRetryable && attempts <= maxRetries
