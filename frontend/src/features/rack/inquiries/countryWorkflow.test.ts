import { describe, expect, it, vi } from 'vitest'
import { SinkInquiryOutcome, SinkInquiryType } from '../../../lib/device'
import { buildCountryInfoSteps, surveyCountryInformation } from './countryWorkflow'

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

  it('surveys every advertised country and preserves decoded and raw information', async () => {
    const statuses = [
      { outcome: SinkInquiryOutcome.NONE, requestId: 0, type: SinkInquiryType.GET_COUNTRY_CODES, responseClass: 0, responseType: 0, responseLength: 0 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.GET_COUNTRY_CODES, responseClass: 0, responseType: 0x0e, responseLength: 6 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.GET_COUNTRY_CODES, responseClass: 0, responseType: 0x0e, responseLength: 6 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 2, type: SinkInquiryType.GET_COUNTRY_INFO, responseClass: 0, responseType: 0x0d, responseLength: 7 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 2, type: SinkInquiryType.GET_COUNTRY_INFO, responseClass: 0, responseType: 0x0d, responseLength: 7 },
      { outcome: SinkInquiryOutcome.NOT_SUPPORTED, requestId: 3, type: SinkInquiryType.GET_COUNTRY_INFO, responseClass: 0, responseType: 0, responseLength: 0 },
    ]
    const responses = [
      new Uint8Array([2, 0, 0x43, 0x41, 0x55, 0x53]),
      new Uint8Array([0x43, 0x41, 0, 0, 0x41, 0x42, 0x43]),
    ]
    const sent: string[] = []
    const result = await surveyCountryInformation({
      sendInquiryRequest: vi.fn(async (request) => {
        sent.push(request.type === SinkInquiryType.GET_COUNTRY_INFO
          ? `${request.type}:${request.countryCode}`
          : request.type)
      }),
      getInquiryStatus: vi.fn(async () => statuses.shift()!),
      getInquiryResponse: vi.fn(async () => responses.shift()!),
    })

    expect(sent).toEqual(['GET_COUNTRY_CODES', 'GET_COUNTRY_INFO:CA', 'GET_COUNTRY_INFO:US'])
    expect(result.countryCodes).toEqual(['CA', 'US'])
    expect(result.summary).toContain('CA: ASCII "ABC"; raw 41 42 43.')
    expect(result.summary).toContain('US: Not Supported.')
  })

  it('summarizes country discovery failure without sending country requests', async () => {
    const sendInquiryRequest = vi.fn(async () => undefined)
    const result = await surveyCountryInformation({
      sendInquiryRequest,
      getInquiryStatus: vi.fn()
        .mockResolvedValueOnce({ outcome: SinkInquiryOutcome.NONE, requestId: 0, type: SinkInquiryType.GET_COUNTRY_CODES, responseClass: 0, responseType: 0, responseLength: 0 })
        .mockResolvedValueOnce({ outcome: SinkInquiryOutcome.NOT_SUPPORTED, requestId: 1, type: SinkInquiryType.GET_COUNTRY_CODES, responseClass: 0, responseType: 0, responseLength: 0 }),
      getInquiryResponse: vi.fn(),
    })

    expect(sendInquiryRequest).toHaveBeenCalledTimes(1)
    expect(result.summary).toBe('Country discovery: Not Supported. No Country_Info requests were sent.')
  })
})
