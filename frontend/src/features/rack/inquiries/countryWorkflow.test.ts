import { describe, expect, it } from 'vitest'
import { SinkInquiryType } from '../../../lib/device'
import { buildCountryInfoSteps } from './countryWorkflow'

describe('buildCountryInfoSteps', () => {
  const codes = new Uint8Array([3, 0, 0x43, 0x41, 0x55, 0x53, 0x47, 0x42])

  it('builds bounded all-country fan-out in advertised order', () => {
    expect(buildCountryInfoSteps(codes).map(({ request }) => request)).toEqual([
      { type: SinkInquiryType.GET_COUNTRY_INFO, countryCode: 'CA' },
      { type: SinkInquiryType.GET_COUNTRY_INFO, countryCode: 'US' },
      { type: SinkInquiryType.GET_COUNTRY_INFO, countryCode: 'GB' },
    ])
  })

  it('builds one selected request and rejects unadvertised selection', () => {
    expect(buildCountryInfoSteps(codes, 'US')).toHaveLength(1)
    expect(() => buildCountryInfoSteps(codes, 'FR')).toThrow('not advertised')
  })

  it('rejects malformed and over-bound discovery results', () => {
    expect(() => buildCountryInfoSteps(new Uint8Array([1, 1, 0x43, 0x41]))).toThrow('malformed')
    const tooMany = new Uint8Array(2 + 13 * 2)
    tooMany[0] = 13
    for (let index = 2; index < tooMany.length; index += 1) tooMany[index] = 0x41
    expect(() => buildCountryInfoSteps(tooMany)).toThrow('malformed')
  })
})
