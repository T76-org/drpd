import { SinkInquiryType } from '../../../lib/device'
import { parseCountryCodesDataBlock } from '../../../lib/device/drpd/usb-pd/DataObjects'
import { expandBoundedFanOut, type SerialInquiryWorkflowStep } from './runner'

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
