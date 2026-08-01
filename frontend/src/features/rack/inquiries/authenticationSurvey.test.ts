import { describe, expect, it, vi } from 'vitest'
import { SinkInquiryOutcome, SinkInquiryType } from '../../../lib/device'
import { surveySourceAuthentication } from './authenticationSurvey'

describe('automated source authentication survey', () => {
  it('records unsupported DIGESTS without retrying and reports an observational result', async () => {
    const statuses = [
      { outcome: SinkInquiryOutcome.NONE, requestId: 0 },
      { outcome: SinkInquiryOutcome.NOT_SUPPORTED, requestId: 1 },
    ].map((status) => ({ ...status, type: SinkInquiryType.GET_DIGESTS, responseClass: 0, responseType: 0, responseLength: 0 }))
    const sendInquiryRequest = vi.fn(async () => undefined)

    const result = await surveySourceAuthentication({
      sendInquiryRequest,
      getInquiryStatus: vi.fn(async () => statuses.shift()!),
      getInquiryResponse: vi.fn(),
    })

    expect(sendInquiryRequest).toHaveBeenCalledOnce()
    expect(result.summary).toContain('stopped before a valid DIGESTS response')
    expect(result.summary).toContain('1 atomic attempt; 1 failed attempt')
    expect(result.summary).toContain('Trust and policy were not evaluated')
  })
})
