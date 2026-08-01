import { SinkInquiryType, type LoggedEventDataSection, type SinkInquiryCablePlug } from '../../../lib/device'
import { formatSinkInquiryOutcome } from './presentation'
import { decodeInquiryResponse } from './decode'
import { withSinkInquiryLease, type InquiryRunState, type SerialInquiryWorkflowStep, type SinkInquiryClient } from './runner'
import { parseDiscoverIdentityVDOs, parseSVIDsVDO, parseVDMHeader, readDataObjects } from '../../../lib/device/drpd/usb-pd/DataObjects'

export const PORT_PARTNER_IDENTITY_EVENT_TITLE = 'INQUIRY - Port Partner identity'
export const PORT_PARTNER_SVIDS_EVENT_TITLE = 'INQUIRY - Port Partner SVIDs'
export const PORT_PARTNER_MODES_EVENT_TITLE = 'INQUIRY - Port Partner modes'

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')

const hex16 = (value: number): string => `0x${value.toString(16).toUpperCase().padStart(4, '0')}`
const hex32 = (value: number): string => `0x${value.toString(16).toUpperCase().padStart(8, '0')}`
const rawHex = (bytes: Uint8Array): string => `\`${bytesToHex(bytes) || '(empty)'}\``
const detail = (value: string, explanation: string): string => `${value}\n\n_${explanation}_`
const cableTargetEntries = (plug?: SinkInquiryCablePlug): LoggedEventDataSection['entries'] => plug
  ? [{ key: 'Target', value: `**${plug === 'SOP_PRIME' ? 'SOP′' : 'SOP″'}** — explicitly addressed; no fallback to SOP.` }]
  : []

const vdmHeaderEntries = (raw: Uint8Array): LoggedEventDataSection['entries'] => {
  const word = readDataObjects(raw, 0, 1)[0]
  const header = parseVDMHeader(word)
  return [
    { key: 'VDM Header (bytes 0–3)', value: detail(`\`${hex32(word)}\``, `Raw little-endian bytes: ${rawHex(raw.subarray(0, 4))}.`) },
    { key: 'SVID (bits 31:16)', value: `**${hex16(header.svid)}**` },
    { key: 'VDM Type (bit 15)', value: `\`1\` — ${header.vdmType}.` },
    { key: 'Structured VDM Version (bits 14:11)', value: `${header.structuredVersionMajor}.${header.structuredVersionMinor}` },
    { key: 'Object Position (bits 10:8)', value: `\`${header.objectPosition}\`` },
    { key: 'Command Type (bits 7:6)', value: `\`${header.commandType}\` — **${header.commandTypeName}**.` },
    { key: 'Reserved (bit 5)', value: `\`${(word >>> 5) & 1}\` — must be zero.` },
    { key: 'Command (bits 4:0)', value: `\`${header.command}\` — **${header.commandName}**.` },
  ]
}

const failedSection = (title: string, outcome: string, raw?: Uint8Array, error?: string, plug?: SinkInquiryCablePlug): LoggedEventDataSection => ({
  title,
  entries: [
    { key: 'Outcome', value: outcome },
    ...cableTargetEntries(plug),
    ...(error ? [{ key: 'Decode Error', value: error }] : []),
    ...(raw ? [{ key: 'Raw Logical Response', value: detail(rawHex(raw), 'Complete logical response body; no fabricated USB-PD header or CRC is included.') }] : []),
  ],
})

const describeFailure = (result: InquiryRunState): string => {
  if (result.phase === 'terminal') return formatSinkInquiryOutcome(result.status.outcome)
  if (result.phase === 'transportError') return `Communication error: ${result.message}`
  if (result.phase === 'superseded') return `Superseded by request ${result.status.requestId}`
  if (result.phase === 'cancelled') return 'Cancelled'
  return `Incomplete (${result.phase})`
}

export interface VdmDiscoverySurveyResult {
  summary: string
  eventData?: LoggedEventDataSection[]
}

/** Query and decode one SVID's modes, retaining the explicit SOP target. */
export const surveySinglePortPartnerModes = async (
  client: SinkInquiryClient,
  svid: number,
  plug?: SinkInquiryCablePlug,
): Promise<VdmDiscoverySurveyResult> => withSinkInquiryLease(client, async (run) => {
  const formattedSvid = hex16(svid)
  const result = await run({ type: SinkInquiryType.DISCOVER_MODES, svid, ...(plug ? { plug } : {}) })
  const target = plug ? `${plug === 'SOP_PRIME' ? 'SOP′' : 'SOP″'} cable` : 'Port Partner'
  if (result.phase !== 'response') {
    const outcome = describeFailure(result)
    return {
      summary: `- **${target} modes for SVID ${formattedSvid}:**\n  - **Outcome:** ${outcome}.`,
      eventData: [failedSection(`Modes for SVID ${formattedSvid}`, outcome, undefined, undefined, plug)],
    }
  }
  try {
    decodeInquiryResponse(result.status, result.rawResponse, result.request)
    const modeVdos = readDataObjects(result.rawResponse, 0, result.rawResponse.length / 4).slice(1)
    return {
      summary: [
        `- **${target} modes for SVID ${formattedSvid}:**`,
        '  - **Outcome:** Response decoded successfully.',
        `  - **Mode count:** ${modeVdos.length}`,
        ...modeVdos.map((vdo, index) => `  - **Mode ${index + 1} VDO:** ${hex32(vdo)}`),
      ].join('\n'),
      eventData: [{
        title: `Modes for SVID ${formattedSvid}`,
        entries: [
          { key: 'Target', value: `**${target}** — explicitly addressed; no fallback to SOP.` },
          { key: 'Selected SVID', value: `**${formattedSvid}**` },
          ...vdmHeaderEntries(result.rawResponse),
          { key: 'Mode Count', value: `${modeVdos.length}` },
          ...modeVdos.map((vdo, index) => ({
            key: `Mode ${index + 1} VDO`,
            value: detail(`\`${hex32(vdo)}\``, `Raw mode-specific value; interpretation is defined by SVID ${formattedSvid}.`),
          })),
          { key: 'Raw Logical Response', value: detail(rawHex(result.rawResponse), 'Complete Discover Modes ACK logical response body.') },
        ],
      }],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      summary: `- **${target} modes for SVID ${formattedSvid}:**\n  - **Outcome:** Malformed response (${message}).`,
      eventData: [failedSection(`Modes for SVID ${formattedSvid}`, 'Malformed response.', result.rawResponse, message, plug)],
    }
  }
})

/** Discover and decode the SOP Port Partner identity into one event-ready summary. */
export const surveyPortPartnerIdentity = async (
  client: SinkInquiryClient,
  plug?: SinkInquiryCablePlug,
): Promise<VdmDiscoverySurveyResult> => withSinkInquiryLease(client, async (run) => {
  const result = await run({ type: SinkInquiryType.DISCOVER_IDENTITY, ...(plug ? { plug } : {}) })
  const subject = plug ? `${plug === 'SOP_PRIME' ? 'SOP′' : 'SOP″'} cable` : 'Port Partner'
  if (result.phase !== 'response') {
    const outcome = describeFailure(result)
    return { summary: `- **${subject} identity:**\n  - **Outcome:** ${outcome}.`, eventData: [failedSection(`${subject} Identity`, outcome, undefined, undefined, plug)] }
  }
  try {
    decodeInquiryResponse(result.status, result.rawResponse, result.request)
    const words = readDataObjects(result.rawResponse, 0, result.rawResponse.length / 4)
    const identity = parseDiscoverIdentityVDOs(
      words.slice(1),
      plug === 'SOP_PRIME' ? 'SOP_PRIME' : plug === 'SOP_DOUBLE_PRIME' ? 'SOP_DOUBLE_PRIME' : 'SOP',
    )
    const id = identity.idHeader!
    const cert = identity.certStat!
    const product = identity.product!
    return {
      summary: [
        `- **${subject} identity:**`,
        '  - **Outcome:** Response decoded successfully.',
        `  - **VID:** ${hex16(id.usbVendorId)}`,
        `  - **PID:** ${hex16(product.usbProductId)}`,
        `  - **XID:** ${hex32(cert.xid)}`,
        `  - **Product type:** UFP ${id.sopProductTypeUfpOrCable}; DFP ${id.sopProductTypeDfp}`,
        `  - **Modal operation supported:** ${id.modalOperationSupported ? 'Yes' : 'No'}`,
      ].join('\n'),
      eventData: [{
        title: `${subject} Identity`,
        entries: [
          { key: 'Outcome', value: 'Response decoded successfully.' },
          ...cableTargetEntries(plug),
          ...vdmHeaderEntries(result.rawResponse),
          { key: 'ID Header VDO (VDO 1)', value: detail(`\`${hex32(id.raw)}\``, `VID ${hex16(id.usbVendorId)}; USB host capable: ${id.usbHostCapable}; USB device capable: ${id.usbDeviceCapable}; modal operation supported: ${id.modalOperationSupported}; UFP product type bits 29:27 = ${id.sopProductTypeUfpOrCable}; DFP product type bits 25:23 = ${id.sopProductTypeDfp}; connector type bits 22:21 = ${id.connectorType}.`) },
          { key: 'Cert Stat VDO (VDO 2)', value: detail(`\`${hex32(cert.raw)}\``, `XID: **${hex32(cert.xid)}**.`) },
          { key: 'Product VDO (VDO 3)', value: detail(`\`${hex32(product.raw)}\``, `PID: **${hex16(product.usbProductId)}**; bcdDevice: ${hex16(product.bcdDevice)}.`) },
          ...identity.productTypeVDOs.map((vdo, index) => ({ key: `Product Type VDO ${index + 1}`, value: `\`${hex32(vdo.raw)}\`\n\n\`\`\`json\n${JSON.stringify(vdo, null, 2)}\n\`\`\`` })),
          ...(identity.padVDOs.length ? [{ key: 'Pad VDOs', value: identity.padVDOs.map(hex32).join(', ') }] : []),
          ...(identity.rawVDOs.length ? [{ key: 'Unparsed VDOs', value: identity.rawVDOs.map(hex32).join(', ') }] : []),
          { key: 'Raw Logical Response', value: detail(rawHex(result.rawResponse), 'Complete Discover Identity ACK logical response body.') },
        ],
      }],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      summary: `- **${subject} identity:**\n  - **Outcome:** Malformed response (${message}).`,
      eventData: [failedSection(`${subject} Identity`, 'Malformed response.', result.rawResponse, message, plug)],
    }
  }
})

/** Discover all SOP Port Partner SVID pages, bounded to eight requests. */
export const surveyPortPartnerSvids = async (
  client: SinkInquiryClient,
  plug?: SinkInquiryCablePlug,
): Promise<VdmDiscoverySurveyResult> => withSinkInquiryLease(client, async (run) => {
  const pages: number[][] = []
  const eventData: LoggedEventDataSection[] = []
  let ending = 'Discovery complete.'
  for (let pageIndex = 0; pageIndex < 8; pageIndex += 1) {
    const result = await run({ type: SinkInquiryType.DISCOVER_SVIDS, ...(plug ? { plug } : {}) })
    if (result.phase !== 'response') {
      const outcome = describeFailure(result)
      eventData.push(failedSection(`SVID Discovery Page ${pageIndex + 1}`, outcome, undefined, undefined, plug))
      ending = `Discovery stopped on page ${pageIndex + 1}: ${outcome}.`
      break
    }
    try {
      decodeInquiryResponse(result.status, result.rawResponse, result.request)
      const parsed = parseDiscoverSvidPage(result.rawResponse)
      pages.push(parsed.ordered)
      const rawVdos = readDataObjects(result.rawResponse, 0, result.rawResponse.length / 4).slice(1)
      eventData.push({ title: `SVID Discovery Page ${pageIndex + 1}`, entries: [
        { key: 'Outcome', value: 'Response decoded successfully.' },
        ...cableTargetEntries(plug),
        ...vdmHeaderEntries(result.rawResponse),
        ...rawVdos.map((vdo, index) => ({ key: `SVID VDO ${index + 1}`, value: detail(`\`${hex32(vdo)}\``, `First discovered SVID: ${hex16(parseSVIDsVDO(vdo).svid1)}; second discovered SVID: ${hex16(parseSVIDsVDO(vdo).svid0)}.`) })),
        { key: 'Ordered SVIDs', value: parsed.ordered.map((svid) => `\`${hex16(svid)}\``).join(', ') || 'None.' },
        { key: 'Terminator', value: parsed.complete ? 'Zero terminator or short terminal page observed.' : 'Not observed; another page is required.' },
        { key: 'Raw Logical Response', value: detail(rawHex(result.rawResponse), 'Complete Discover SVIDs ACK logical response body.') },
      ] })
      if (parsed.complete) {
        ending = `Discovery completed on page ${pageIndex + 1}.`
        break
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      eventData.push(failedSection(`SVID Discovery Page ${pageIndex + 1}`, 'Malformed response.', result.rawResponse, message, plug))
      ending = `Discovery stopped on malformed page ${pageIndex + 1}.`
      break
    }
  }
  const discovered = deduplicateOrderedSvids(pages)
  if (eventData.length === 8 && pages.length === 8 && !eventData.some((section) => section.entries.some((entry) => entry.key === 'Terminator' && entry.value.startsWith('Zero')))) ending = 'Discovery stopped at the eight-page safety bound without a terminator.'
  const pageBySvid = new Map<number, number>()
  pages.forEach((page, index) => page.forEach((svid) => { if (!pageBySvid.has(svid)) pageBySvid.set(svid, index + 1) }))
  return {
    summary: [
      `- **Discovered SVIDs:** ${discovered.length} unique (${discovered.map(hex16).join(', ') || 'none'}).`,
      ...discovered.flatMap((svid, index) => [`- **SVID ${hex16(svid)}:**`, `  - **Discovery order:** ${index + 1}`, `  - **Response page:** ${pageBySvid.get(svid)}`]),
      `- **Discovery status:** ${ending}`,
    ].join('\n'),
    eventData,
  }
})

/** Discover all bounded SOP Port Partner SVID pages, then query Modes for every unique SVID. */
export const surveyPortPartnerModes = async (
  client: SinkInquiryClient,
  plug?: SinkInquiryCablePlug,
): Promise<VdmDiscoverySurveyResult> => withSinkInquiryLease(client, async (run) => {
  const pages: number[][] = []
  const eventData: LoggedEventDataSection[] = []
  let discoveryComplete = false
  let discoveryOutcome = 'Incomplete discovery.'
  for (let pageIndex = 0; pageIndex < 8; pageIndex += 1) {
    const result = await run({ type: SinkInquiryType.DISCOVER_SVIDS, ...(plug ? { plug } : {}) })
    if (result.phase !== 'response') {
      const outcome = describeFailure(result)
      eventData.push(failedSection(`SVID Discovery Page ${pageIndex + 1}`, outcome, undefined, undefined, plug))
      discoveryOutcome = `Stopped on page ${pageIndex + 1}: ${outcome}.`
      break
    }
    try {
      decodeInquiryResponse(result.status, result.rawResponse, result.request)
      const parsed = parseDiscoverSvidPage(result.rawResponse)
      pages.push(parsed.ordered)
      const rawVdos = readDataObjects(result.rawResponse, 0, result.rawResponse.length / 4).slice(1)
      eventData.push({ title: `SVID Discovery Page ${pageIndex + 1}`, entries: [
        { key: 'Outcome', value: 'Response decoded successfully.' },
        ...cableTargetEntries(plug),
        ...vdmHeaderEntries(result.rawResponse),
        ...rawVdos.map((vdo, index) => ({ key: `SVID VDO ${index + 1}`, value: `\`${hex32(vdo)}\`` })),
        { key: 'Ordered SVIDs', value: parsed.ordered.map((svid) => `\`${hex16(svid)}\``).join(', ') || 'None.' },
        { key: 'Terminator', value: parsed.complete ? 'Observed.' : 'Not observed.' },
        { key: 'Raw Logical Response', value: detail(rawHex(result.rawResponse), 'Complete Discover SVIDs ACK logical response body.') },
      ] })
      if (parsed.complete) {
        discoveryComplete = true
        discoveryOutcome = `Completed on page ${pageIndex + 1}.`
        break
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      eventData.push(failedSection(`SVID Discovery Page ${pageIndex + 1}`, 'Malformed response.', result.rawResponse, message, plug))
      discoveryOutcome = `Stopped on malformed page ${pageIndex + 1}.`
      break
    }
  }

  const svids = deduplicateOrderedSvids(pages)
  if (!discoveryComplete && pages.length === 8) discoveryOutcome = 'Stopped at the eight-page safety bound without a terminator.'
  const lines = [`- **SVID discovery:** ${svids.length} unique (${svids.map(hex16).join(', ') || 'none'}).`, `  - **Status:** ${discoveryOutcome}`]
  if (svids.length === 0) {
    lines.push('- **Discover Modes:** No requests were sent.')
    return { summary: lines.join('\n'), eventData }
  }

  for (const svid of svids) {
    const request = { type: SinkInquiryType.DISCOVER_MODES, svid, ...(plug ? { plug } : {}) } as const
    const result = await run(request)
    const formattedSvid = `0x${svid.toString(16).toUpperCase().padStart(4, '0')}`
    if (result.phase !== 'response') {
      const outcome = describeFailure(result)
      lines.push(`- **SVID ${formattedSvid}:**`, `  - **Outcome:** ${outcome}.`)
      eventData.push(failedSection(`Modes for SVID ${formattedSvid}`, outcome, undefined, undefined, plug))
      continue
    }
    try {
      decodeInquiryResponse(result.status, result.rawResponse, result.request)
      const modeVdos = readDataObjects(result.rawResponse, 0, result.rawResponse.length / 4).slice(1)
      lines.push(`- **SVID ${formattedSvid}:**`, '  - **Outcome:** Response decoded successfully.', `  - **Mode count:** ${modeVdos.length}`, ...modeVdos.map((vdo, index) => `  - **Mode ${index + 1} VDO:** ${hex32(vdo)}`))
      eventData.push({ title: `Modes for SVID ${formattedSvid}`, entries: [
        { key: 'Outcome', value: 'Response decoded successfully.' },
        ...cableTargetEntries(plug),
        { key: 'Selected SVID', value: `**${formattedSvid}**` },
        ...vdmHeaderEntries(result.rawResponse),
        { key: 'Mode Count', value: `${modeVdos.length}` },
        ...modeVdos.map((vdo, index) => ({ key: `Mode ${index + 1} VDO`, value: detail(`\`${hex32(vdo)}\``, `Raw mode-specific value returned in VDO ${index + 1}; interpretation is defined by SVID ${formattedSvid}.`) })),
        { key: 'Raw Logical Response', value: detail(rawHex(result.rawResponse), 'Complete Discover Modes ACK logical response body.') },
      ] })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      lines.push(`- **SVID ${formattedSvid}:**`, `  - **Outcome:** Malformed response (${message}).`)
      eventData.push(failedSection(`Modes for SVID ${formattedSvid}`, 'Malformed response.', result.rawResponse, message, plug))
    }
  }
  return { summary: lines.join('\n'), eventData }
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
