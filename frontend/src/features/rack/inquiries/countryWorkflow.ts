import { SinkInquiryType } from '../../../lib/device'
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
}

/** Discover advertised country codes and query every Country_Info record serially. */
export const surveyCountryInformation = async (
  client: SinkInquiryClient,
): Promise<CountryInformationSurveyResult> => withSinkInquiryLease(client, async (run) => {
  const discovery = await run({ type: SinkInquiryType.GET_COUNTRY_CODES })
  if (discovery.phase !== 'response') {
    return {
      countryCodes: [],
      summary: `Country discovery: ${describeFailure(discovery)}. No Country_Info requests were sent.`,
    }
  }

  let countryCodes: string[]
  try {
    decodeInquiryResponse(discovery.status, discovery.rawResponse, discovery.request)
    countryCodes = parseCountryCodesDataBlock(discovery.rawResponse).countryCodes
    buildCountryInfoSteps(discovery.rawResponse)
  } catch (error) {
    return {
      countryCodes: [],
      summary: `Country discovery: malformed response (${error instanceof Error ? error.message : String(error)}). Raw: ${bytesToHex(discovery.rawResponse) || '(empty)'}.`,
    }
  }

  const lines = [
    `Country discovery: ${countryCodes.length} advertised (${countryCodes.join(', ')}).`,
    `Country_Codes raw: ${bytesToHex(discovery.rawResponse)}.`,
  ]
  for (const countryCode of countryCodes) {
    const result = await run({ type: SinkInquiryType.GET_COUNTRY_INFO, countryCode })
    if (result.phase !== 'response') {
      lines.push(`${countryCode}: ${describeFailure(result)}.`)
      continue
    }
    try {
      decodeInquiryResponse(result.status, result.rawResponse, result.request)
      const info = parseCountryInfoDataBlock(result.rawResponse)
      if (info.countryCode !== countryCode) {
        throw new Error(`response echoed ${info.countryCode ?? 'no code'}, expected ${countryCode}`)
      }
      lines.push(
        `${countryCode}: ASCII ${JSON.stringify(info.countrySpecificDataAscii)}; ` +
        `raw ${bytesToHex(info.countrySpecificData) || '(empty)'}.`,
      )
    } catch (error) {
      lines.push(`${countryCode}: malformed response (${error instanceof Error ? error.message : String(error)}); raw ${bytesToHex(result.rawResponse) || '(empty)'}.`)
    }
  }
  return { countryCodes, summary: lines.join('\n') }
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
