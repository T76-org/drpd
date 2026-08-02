import { SinkInquiryType, type LoggedEventDataSection } from '../../../lib/device'
import { parseCountryCodesDataBlock, parseCountryInfoDataBlock } from '../../../lib/device/drpd/usb-pd/DataObjects'
import { decodeInquiryResponse } from './decode'
import { formatSinkInquiryOutcome } from './presentation'
import { expandBoundedFanOut, withSinkInquiryLease, type InquiryRunState, type SerialInquiryWorkflowStep, type SinkInquiryClient } from './runner'

export const COUNTRY_INFORMATION_EVENT_TITLE = 'INQUIRY - Country information'

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')

const describeFailure = (result: InquiryRunState): string => {
  if (result.phase === 'terminal') return formatSinkInquiryOutcome(result.status.outcome)
  if (result.phase === 'transportError') return `Communication error: ${result.message}`
  if (result.phase === 'superseded') return `Superseded by request ${result.status.requestId}`
  if (result.phase === 'cancelled') return 'Cancelled'
  return `Incomplete (${result.phase})`
}

export interface CountryInformationSurveyResult {
  countryCodes: string[]
  summary: string
  eventData?: LoggedEventDataSection[]
}

const rawHexValue = (bytes: Uint8Array): string => `\`${bytesToHex(bytes) || '(empty)'}\``

const countryCodesSection = (raw: Uint8Array, codes: string[]): LoggedEventDataSection => ({
  title: 'Country Codes',
  entries: [
    { key: 'Outcome', value: 'Response decoded successfully.' },
    { key: 'Country Count (byte 0)', value: `**${codes.length}** — raw \`0x${(raw[0] ?? 0).toString(16).toUpperCase().padStart(2, '0')}\`.` },
    { key: 'Reserved (byte 1)', value: `\`0x${(raw[1] ?? 0).toString(16).toUpperCase().padStart(2, '0')}\` — must be zero.` },
    { key: 'Country Codes (bytes 2–end)', value: codes.map((code, index) => `\`${code}\` at bytes ${2 + index * 2}–${3 + index * 2} (${rawHexValue(raw.subarray(2 + index * 2, 4 + index * 2))})`).join('\n\n') || 'None.' },
    { key: 'Raw Logical Response', value: `${rawHexValue(raw)}\n\n_Complete Country_Codes logical response body; no fabricated USB-PD header or CRC is included._` },
  ],
})

const failedSection = (
  title: string,
  outcome: string,
  raw?: Uint8Array,
  decodeError?: string,
): LoggedEventDataSection => ({
  title,
  entries: [
    { key: 'Outcome', value: outcome },
    ...(decodeError ? [{ key: 'Decode Error', value: decodeError }] : []),
    ...(raw ? [{ key: 'Raw Logical Response', value: rawHexValue(raw) }] : []),
  ],
})

const countryInfoSection = (requestedCode: string, raw: Uint8Array): LoggedEventDataSection => {
  const info = parseCountryInfoDataBlock(raw)
  return {
    title: `Country ${requestedCode}`,
    entries: [
      { key: 'Outcome', value: 'Response decoded successfully.' },
      { key: 'Requested Country Code', value: `**${requestedCode}** — uppercase ISO alpha-2; ASCII code bytes \`${bytesToHex(new TextEncoder().encode(requestedCode))}\`.` },
      { key: 'Echoed Country Code (bytes 0–1)', value: `**${info.countryCode ?? '(invalid)'}** — raw ${rawHexValue(raw.subarray(0, 2))}.` },
      { key: 'Reserved (bytes 2–3)', value: `${rawHexValue(raw.subarray(2, 4))} — both bytes must be zero.` },
      { key: 'Country-Specific Data (bytes 4–end)', value: `ASCII preview: **${info.countrySpecificDataAscii || '(empty)'}**\n\nRaw: ${rawHexValue(info.countrySpecificData)}.` },
      { key: 'Raw Logical Response', value: `${rawHexValue(raw)}\n\n_Complete Country_Info logical response body; no fabricated USB-PD header or CRC is included._` },
    ],
  }
}

/** Discover advertised country codes and query every Country_Info record serially. */
export const surveyCountryInformation = async (
  client: SinkInquiryClient,
): Promise<CountryInformationSurveyResult> => withSinkInquiryLease(client, async (run) => {
  const discovery = await run({ type: SinkInquiryType.GET_COUNTRY_CODES })
  if (discovery.phase !== 'response') {
    const failure = describeFailure(discovery)
    return {
      countryCodes: [],
      summary: `- **Country discovery:** ${failure}. No Country_Info requests were sent.`,
      eventData: [failedSection('Country Codes', failure)],
    }
  }

  let countryCodes: string[]
  try {
    decodeInquiryResponse(discovery.status, discovery.rawResponse, discovery.request)
    countryCodes = parseCountryCodesDataBlock(discovery.rawResponse).countryCodes
    buildCountryInfoSteps(discovery.rawResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      countryCodes: [],
      summary: `- **Country discovery:** malformed response (${message}). No Country_Info requests were sent.`,
      eventData: [failedSection('Country Codes', 'Malformed response.', discovery.rawResponse, message)],
    }
  }

  const lines = [
    `- **Advertised countries:** ${countryCodes.length} total${countryCodes.length ? ` — ${countryCodes.join(', ')}` : ''}.`,
  ]
  const eventData: LoggedEventDataSection[] = [countryCodesSection(discovery.rawResponse, countryCodes)]
  for (const countryCode of countryCodes) {
    const result = await run({ type: SinkInquiryType.GET_COUNTRY_INFO, countryCode })
    if (result.phase !== 'response') {
      const failure = describeFailure(result)
      lines.push(
        `- **Country ${countryCode}:**`,
        `  - **Outcome:** ${failure}.`,
      )
      eventData.push(failedSection(`Country ${countryCode}`, failure))
      continue
    }
    try {
      decodeInquiryResponse(result.status, result.rawResponse, result.request)
      const info = parseCountryInfoDataBlock(result.rawResponse)
      if (info.countryCode !== countryCode) {
        throw new Error(`response echoed ${info.countryCode ?? 'no code'}, expected ${countryCode}`)
      }
      lines.push(
        `- **Country ${countryCode}:**`,
        `  - **Country-specific information:** ${info.countrySpecificDataAscii || '(empty)'}`,
      )
      eventData.push(countryInfoSection(countryCode, result.rawResponse))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      lines.push(
        `- **Country ${countryCode}:**`,
        `  - **Outcome:** Malformed response (${message}).`,
      )
      eventData.push(failedSection(`Country ${countryCode}`, 'Malformed response.', result.rawResponse, message))
    }
  }
  return { countryCodes, summary: lines.join('\n'), eventData }
})

/** Validate Country_Codes and expand selected/all Country_Info requests with a hard bound. */
export const buildCountryInfoSteps = (
  body: Uint8Array,
  selectedCountryCode?: string,
): SerialInquiryWorkflowStep[] => {
  if (body.length < 4 || body.length > 26 || body[0] < 1 || body[0] > 12 || body[1] !== 0 || body.length !== 2 + body[0] * 2) {
    throw new Error('Country_Codes count/reserved/length fields are malformed')
  }
  const codes = parseCountryCodesDataBlock(body).countryCodes
  if (codes.some((code) => !/^[A-Z]{2}$/.test(code))) throw new Error('Country_Codes entries must be uppercase ASCII alpha-2')
  const selected = selectedCountryCode == null ? codes : codes.filter((code) => code === selectedCountryCode)
  if (selectedCountryCode != null && selected.length === 0) throw new Error(`${selectedCountryCode} was not advertised by the Source`)
  return expandBoundedFanOut(selected, (countryCode) => ({
    id: `country-info-${countryCode}`,
    request: { type: SinkInquiryType.GET_COUNTRY_INFO, countryCode },
  }), 12)
}
