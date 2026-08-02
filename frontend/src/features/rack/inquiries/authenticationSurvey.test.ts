import { describe, expect, it, vi } from 'vitest'
import { SinkInquiryOutcome, SinkInquiryType } from '../../../lib/device'
import { surveySourceAuthentication } from './authenticationSurvey'

vi.mock('./authVerifier', () => ({
  inspectUsbAuthenticationEvidence: vi.fn(async () => ({
    cryptographic: 'verified', trust: 'not-checked', policy: 'not-checked',
  })),
}))

const entry = (
  section: NonNullable<Awaited<ReturnType<typeof surveySourceAuthentication>>['eventData']>[number],
  key: string,
): string | undefined => section.entries.find((candidate) => candidate.key === key)?.value

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
    expect(result.summary).toContain('Stopped before a valid response')
    expect(result.summary).toContain('- **DIGESTS discovery:**')
    expect(result.summary).toContain('  - **Atomic attempts:** 1')
    expect(result.summary).toContain('trust and policy were not evaluated')
    expect(result.eventData.map(({ title }) => title)).toEqual(['DIGESTS Discovery', 'Workflow History'])
    expect(entry(result.eventData[0], 'Failure')).toContain('Firmware outcome')
    expect(entry(result.eventData[1], 'Attempt 1 — digests')).toContain('NOT_SUPPORTED')
  })

  it('emits nested slot summary and complete ordered forensic evidence', async () => {
    const chain = new Uint8Array(37)
    chain.set([37, 0, 0, 0])
    chain.set(new Uint8Array(32).fill(0xa5), 4)
    chain[36] = 0x30
    const digest = new Uint8Array(32).fill(0x11)
    const digests = new Uint8Array([0x10, 0x01, 0x01, 0x01, ...digest])
    const challenge = new Uint8Array(168)
    challenge.set([0x10, 0x03, 0, 1, 0x10, 0x10, 1, 0])
    challenge.fill(0x5a, 104)
    let requestId = 0
    let currentResponse = new Uint8Array()
    let pending = false
    const sent = vi.fn(async (request) => {
      requestId += 1
      pending = true
      if (request.type === SinkInquiryType.GET_DIGESTS) currentResponse = digests
      else if (request.type === SinkInquiryType.GET_CERTIFICATE) {
        currentResponse = new Uint8Array([0x10, 0x02, request.slot, 0, ...chain.slice(request.offset, request.offset + request.length)])
      } else currentResponse = challenge
    })
    const result = await surveySourceAuthentication({
      sendInquiryRequest: sent,
      getInquiryStatus: vi.fn(async () => {
        if (!pending) return { outcome: SinkInquiryOutcome.NONE, requestId, type: SinkInquiryType.GET_DIGESTS, responseClass: 0, responseType: 0, responseLength: 0 }
        pending = false
        const request = sent.mock.calls.at(-1)![0]
        return { outcome: SinkInquiryOutcome.RESPONSE, requestId, type: request.type, responseClass: 0, responseType: 0, responseLength: currentResponse.length }
      }),
      getInquiryResponse: vi.fn(async () => currentResponse),
    })

    expect(result.summary.split('\n')).toEqual(expect.arrayContaining([
      '- **Authentication slot 0:**',
      '  - **Certificate chain:** 37 bytes',
      '  - **Challenge response:** Received',
      '  - **Cryptographic verification:** verified',
      '- **Workflow:**',
    ]))
    expect(result.eventData.map(({ title }) => title)).toEqual([
      'DIGESTS Discovery', 'Authentication Slot 0', 'Workflow History',
    ])
    expect(entry(result.eventData[0], 'Raw Logical Response')).toContain('10 01 01 01')
    expect(entry(result.eventData[1], 'Complete Certificate Chain')).toContain('25 00 00 00')
    expect(entry(result.eventData[1], 'Raw Challenge Response')).toContain('10 03 00 01')
    expect(entry(result.eventData[1], 'Signature (bytes 104–167)')).toContain('5A 5A')
    expect(entry(result.eventData[1], 'Challenge Nonce')).toMatch(/`[0-9A-F]{64}`/)
    expect(entry(result.eventData[2], 'Atomic Attempts')).toBe('4')
    expect(entry(result.eventData[2], 'Attempt 2 — certificate')).toContain('offset 0, length 36')
    expect(entry(result.eventData[2], 'Attempt 3 — certificate')).toContain('offset 36, length 1')
  })
})
