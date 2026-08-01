import { describe, expect, it, vi } from 'vitest'
import { SinkInquiryOutcome, SinkInquiryType } from '../types'
import { dispatchSinkInquiryRpc } from './sinkInquiryRpc'

describe('dispatchSinkInquiryRpc', () => {
  it('dispatches all inquiry methods', async () => {
    const status = {
      outcome: SinkInquiryOutcome.RESPONSE,
      requestId: 2,
      type: SinkInquiryType.GET_REVISION,
      responseClass: 1,
      responseType: 12,
      responseLength: 1,
    }
    const response = new Uint8Array([0xab])
    const sink = {
      sendInquiry: vi.fn(async () => undefined),
      getInquiryStatus: vi.fn(async () => status),
      getInquiryResponse: vi.fn(async () => response),
    }
    expect(await dispatchSinkInquiryRpc(sink, 'sendInquiry', [SinkInquiryType.GET_REVISION]))
      .toEqual({ handled: true, value: null })
    expect(await dispatchSinkInquiryRpc(sink, 'getInquiryStatus', [])).toEqual({ handled: true, value: status })
    expect(await dispatchSinkInquiryRpc(sink, 'getInquiryResponse', [])).toEqual({ handled: true, value: response })
    expect(await dispatchSinkInquiryRpc(sink, 'other', [])).toEqual({ handled: false })
  })
})

