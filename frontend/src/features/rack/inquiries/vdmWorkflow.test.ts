import { describe, expect, it, vi } from 'vitest'
import { SinkInquiryOutcome, SinkInquiryType } from '../../../lib/device'
import { buildDiscoverModesSteps, canRetryVdmSurveyStep, deduplicateOrderedSvids, parseDiscoverSvidPage, surveyPortPartnerIdentity, surveyPortPartnerModes, surveyPortPartnerSvids } from './vdmWorkflow'

const words = (...values: number[]) => new Uint8Array(values.flatMap((value) => [value & 0xff, value >>> 8 & 0xff, value >>> 16 & 0xff, value >>> 24 & 0xff]))

describe('Port Partner VDM workflow helpers', () => {
  it('continues a full 12-SVID page and stops on a zero terminator', () => {
    const full = parseDiscoverSvidPage(words(0, 0x00010002, 0x00030004, 0x00050006, 0x00070008, 0x0009000a, 0x000b000c))
    expect(full.ordered).toHaveLength(12)
    expect(full.complete).toBe(false)
    const terminal = parseDiscoverSvidPage(words(0, 0x12340000))
    expect(terminal.complete).toBe(true)
  })

  it('preserves order while deduplicating and bounds all-modes fanout', () => {
    expect(deduplicateOrderedSvids([[1, 2], [2, 3]])).toEqual([1, 2, 3])
    expect(buildDiscoverModesSteps([1, 2, 2])).toHaveLength(2)
    expect(() => buildDiscoverModesSteps(Array.from({ length: 13 }, (_, index) => index + 1))).toThrow('limit of 12')
  })

  it('makes an unterminated safety-bound outcome explicitly non-retryable', () => {
    expect(canRetryVdmSurveyStep(1, true)).toBe(false)
    expect(canRetryVdmSurveyStep(2, false)).toBe(true)
    expect(canRetryVdmSurveyStep(3, false)).toBe(false)
  })

  it('rejects nonzero SVID data after a terminator', () => {
    expect(() => parseDiscoverSvidPage(words(0, 0, 0x12340000))).toThrow('after its zero terminator')
  })

  it('summarizes decoded identity with raw VDO evidence', async () => {
    const header = (0xff00 << 16) | (1 << 15) | (1 << 13) | (1 << 6) | 1
    const body = words(header, 1, 2, 3)
    const statuses = [
      { outcome: SinkInquiryOutcome.NONE, requestId: 0, type: SinkInquiryType.DISCOVER_IDENTITY, responseClass: 0, responseType: 0, responseLength: 0 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.DISCOVER_IDENTITY, responseClass: 2, responseType: 0x0f, responseLength: 16 },
    ]
    const result = await surveyPortPartnerIdentity({
      sendInquiryRequest: vi.fn(async () => undefined),
      getInquiryStatus: vi.fn(async () => statuses.shift()!),
      getInquiryResponse: vi.fn(async () => body),
    })

    expect(result.summary).toContain('Discover Identity: response received.')
    expect(result.summary).toContain('Raw VDO bytes:')
    expect(result.summary).toContain('"identity"')
  })

  it('collects all SVID pages in order and retains page raw bytes', async () => {
    const header = (0xff00 << 16) | (1 << 15) | (1 << 13) | (1 << 6) | 2
    const first = words(header, 0x00010002, 0x00030004, 0x00050006, 0x00070008, 0x0009000a, 0x000b000c)
    const second = words(header, 0x12340000)
    const statuses = [
      { outcome: SinkInquiryOutcome.NONE, requestId: 0, type: SinkInquiryType.DISCOVER_SVIDS, responseClass: 0, responseType: 0, responseLength: 0 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.DISCOVER_SVIDS, responseClass: 2, responseType: 0x0f, responseLength: 28 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.DISCOVER_SVIDS, responseClass: 2, responseType: 0x0f, responseLength: 28 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 2, type: SinkInquiryType.DISCOVER_SVIDS, responseClass: 2, responseType: 0x0f, responseLength: 8 },
    ]
    const responses = [first, second]
    const sendInquiryRequest = vi.fn(async () => undefined)
    const result = await surveyPortPartnerSvids({
      sendInquiryRequest,
      getInquiryStatus: vi.fn(async () => statuses.shift()!),
      getInquiryResponse: vi.fn(async () => responses.shift()!),
    })

    expect(sendInquiryRequest).toHaveBeenCalledTimes(2)
    expect(result.summary).toContain('Discovered 13 unique SVIDs:')
    expect(result.summary).toContain('0x0001, 0x0002')
    expect(result.summary).toContain('0x1234')
    expect(result.summary).toContain('Page 2: 0x1234; raw')
  })

  it('summarizes unsupported identity and SVID discovery truthfully', async () => {
    const unsupportedClient = (type: SinkInquiryType) => ({
      sendInquiryRequest: vi.fn(async () => undefined),
      getInquiryStatus: vi.fn()
        .mockResolvedValueOnce({ outcome: SinkInquiryOutcome.NONE, requestId: 0, type, responseClass: 0, responseType: 0, responseLength: 0 })
        .mockResolvedValueOnce({ outcome: SinkInquiryOutcome.NOT_SUPPORTED, requestId: 1, type, responseClass: 0, responseType: 0, responseLength: 0 }),
      getInquiryResponse: vi.fn(),
    })

    expect((await surveyPortPartnerIdentity(unsupportedClient(SinkInquiryType.DISCOVER_IDENTITY))).summary).toBe('Discover Identity: Not Supported.')
    expect((await surveyPortPartnerSvids(unsupportedClient(SinkInquiryType.DISCOVER_SVIDS))).summary).toContain('Page 1: Not Supported.')
  })

  it('discovers SVIDs then collects modes for every SVID', async () => {
    const svidHeader = (0xff00 << 16) | (1 << 15) | (1 << 13) | (1 << 6) | 2
    const svidBody = words(svidHeader, (0x1234 << 16) | 0x5678, 0)
    const modesHeader = (0x1234 << 16) | (1 << 15) | (1 << 13) | (1 << 6) | 3
    const modesBody = words(modesHeader, 0xdeadbeef, 0x01020304)
    const statuses = [
      { outcome: SinkInquiryOutcome.NONE, requestId: 0, type: SinkInquiryType.DISCOVER_SVIDS, responseClass: 0, responseType: 0, responseLength: 0 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.DISCOVER_SVIDS, responseClass: 2, responseType: 0x0f, responseLength: 12 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.DISCOVER_SVIDS, responseClass: 2, responseType: 0x0f, responseLength: 12 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 2, type: SinkInquiryType.DISCOVER_MODES, responseClass: 2, responseType: 0x0f, responseLength: 12 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 2, type: SinkInquiryType.DISCOVER_MODES, responseClass: 2, responseType: 0x0f, responseLength: 12 },
      { outcome: SinkInquiryOutcome.NOT_SUPPORTED, requestId: 3, type: SinkInquiryType.DISCOVER_MODES, responseClass: 0, responseType: 0, responseLength: 0 },
    ]
    const responses = [svidBody, modesBody]
    const sent: string[] = []
    const result = await surveyPortPartnerModes({
      sendInquiryRequest: vi.fn(async (request) => {
        sent.push(request.type === SinkInquiryType.DISCOVER_MODES
          ? `${request.type}:${request.svid.toString(16)}`
          : request.type)
      }),
      getInquiryStatus: vi.fn(async () => statuses.shift()!),
      getInquiryResponse: vi.fn(async () => responses.shift()!),
    })

    expect(sent).toEqual(['DISCOVER_SVIDS', 'DISCOVER_MODES:1234', 'DISCOVER_MODES:5678'])
    expect(result.summary).toContain('Discovered 2 unique SVIDs: 0x1234, 0x5678.')
    expect(result.summary).toContain('0x1234: 2 mode VDOs (0xDEADBEEF, 0x01020304)')
    expect(result.summary).toContain('0x5678: Not Supported.')
  })
})
