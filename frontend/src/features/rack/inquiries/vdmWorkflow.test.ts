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

  it('renders decoded identity as nested Markdown with complete structured evidence', async () => {
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

    expect(result.summary).toBe([
      '- **Port Partner identity:**',
      '  - **Outcome:** Response decoded successfully.',
      '  - **VID:** 0x0001',
      '  - **PID:** 0x0000',
      '  - **XID:** 0x00000002',
      '  - **Product type:** UFP 0; DFP 0',
      '  - **Modal operation supported:** No',
    ].join('\n'))
    expect(result.eventData?.map((section) => section.title)).toEqual(['Port Partner Identity'])
    expect(result.eventData![0].entries.find((entry) => entry.key === 'VDM Header (bytes 0–3)')?.value).toContain('0xFF00A041')
    expect(result.eventData![0].entries.find((entry) => entry.key === 'Raw Logical Response')?.value).toContain('41 A0 00 FF')
  })

  it('renders Apple UFP and DFP product type VDOs as explained bitfields instead of JSON', async () => {
    const header = (0xff00 << 16) | (1 << 15) | (1 << 13) | (1 << 6) | 1
    const body = words(header, 0xd50005ac, 0, 0x73082170, 0x0d00003b, 0x07000000, 0)
    const statuses = [
      { outcome: SinkInquiryOutcome.NONE, requestId: 0, type: SinkInquiryType.DISCOVER_IDENTITY, responseClass: 0, responseType: 0, responseLength: 0 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.DISCOVER_IDENTITY, responseClass: 2, responseType: 0x0f, responseLength: body.length },
    ]
    const result = await surveyPortPartnerIdentity({
      sendInquiryRequest: vi.fn(async () => undefined),
      getInquiryStatus: vi.fn(async () => statuses.shift()!),
      getInquiryResponse: vi.fn(async () => body),
    })
    const entries = result.eventData![0].entries
    expect(entries).toContainEqual(expect.objectContaining({ key: 'Product Type VDO 1 Type', value: expect.stringContaining('UFP VDO') }))
    expect(entries).toContainEqual(expect.objectContaining({ key: 'Device Capability (bits 27:24)', value: expect.stringContaining('USB4 Device capable') }))
    expect(entries).toContainEqual(expect.objectContaining({ key: 'Alternate Modes (bits 5:3)', value: expect.stringContaining('TBT3 Alternate Mode') }))
    expect(entries).toContainEqual(expect.objectContaining({ key: 'Product Type VDO 2 Type', value: expect.stringContaining('DFP VDO') }))
    expect(entries).toContainEqual(expect.objectContaining({ key: 'Host Capability (bits 26:24)', value: expect.stringContaining('USB4 Host capable') }))
    expect(entries).toContainEqual(expect.objectContaining({ key: 'Port Number (bits 4:0)', value: expect.stringContaining('`0`') }))
    expect(entries.map((entry) => entry.value).join('\n')).not.toContain('```json')
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
    expect(result.summary).toContain('- **Discovered SVIDs:** 13 unique')
    expect(result.summary).toContain('0x0001, 0x0002')
    expect(result.summary).toContain('0x1234')
    expect(result.summary).toContain('- **SVID 0x1234:**\n  - **Discovery order:** 13\n  - **Response page:** 2')
    expect(result.eventData?.map((section) => section.title)).toEqual(['SVID Discovery Page 1', 'SVID Discovery Page 2'])
    expect(result.eventData![1].entries.find((entry) => entry.key === 'Raw Logical Response')?.value).toContain('00 00 34 12')
  })

  it('summarizes unsupported identity and SVID discovery truthfully', async () => {
    const unsupportedClient = (type: SinkInquiryType) => ({
      sendInquiryRequest: vi.fn(async () => undefined),
      getInquiryStatus: vi.fn()
        .mockResolvedValueOnce({ outcome: SinkInquiryOutcome.NONE, requestId: 0, type, responseClass: 0, responseType: 0, responseLength: 0 })
        .mockResolvedValueOnce({ outcome: SinkInquiryOutcome.NOT_SUPPORTED, requestId: 1, type, responseClass: 0, responseType: 0, responseLength: 0 }),
      getInquiryResponse: vi.fn(),
    })

    const identity = await surveyPortPartnerIdentity(unsupportedClient(SinkInquiryType.DISCOVER_IDENTITY))
    expect(identity.summary).toContain('  - **Outcome:** Not Supported.')
    expect(identity.eventData![0].entries).toContainEqual({ key: 'Outcome', value: 'Not Supported' })
    const svids = await surveyPortPartnerSvids(unsupportedClient(SinkInquiryType.DISCOVER_SVIDS))
    expect(svids.summary).toContain('Discovery stopped on page 1: Not Supported.')
    expect(svids.eventData![0].entries).toContainEqual({ key: 'Outcome', value: 'Not Supported' })
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
    expect(result.summary).toContain('- **SVID discovery:** 2 unique (0x1234, 0x5678).')
    expect(result.summary).toContain('- **SVID 0x1234:**\n  - **Outcome:** Response decoded successfully.\n  - **Mode count:** 2\n  - **Mode 1 VDO:** 0xDEADBEEF')
    expect(result.summary).toContain('- **SVID 0x5678:**\n  - **Outcome:** Not Supported.')
    expect(result.eventData?.map((section) => section.title)).toEqual([
      'SVID Discovery Page 1',
      'Modes for SVID 0x1234',
      'Modes for SVID 0x5678',
    ])
    expect(result.eventData![1].entries.find((entry) => entry.key === 'Mode 2 VDO')?.value).toContain('0x01020304')
    expect(result.eventData![2].entries).toContainEqual({ key: 'Outcome', value: 'Not Supported' })
  })

  it('retains malformed SVID raw bytes and the exact decode error', async () => {
    const malformed = words(0, 0x12340000, 0x00005678)
    const statuses = [
      { outcome: SinkInquiryOutcome.NONE, requestId: 0, type: SinkInquiryType.DISCOVER_SVIDS, responseClass: 0, responseType: 0, responseLength: 0 },
      { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: SinkInquiryType.DISCOVER_SVIDS, responseClass: 2, responseType: 0x0f, responseLength: 12 },
    ]
    const result = await surveyPortPartnerSvids({
      sendInquiryRequest: vi.fn(async () => undefined),
      getInquiryStatus: vi.fn(async () => statuses.shift()!),
      getInquiryResponse: vi.fn(async () => malformed),
    })
    const section = result.eventData![0]
    expect(section.entries.find((entry) => entry.key === 'Decode Error')?.value).toBe('Structured VDM ACK header does not correlate with request')
    expect(section.entries.find((entry) => entry.key === 'Raw Logical Response')?.value).toContain('00 00 00 00 00 00 34 12 78 56 00 00')
  })
})
