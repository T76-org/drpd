import { describe, expect, it, vi } from 'vitest'
import { SinkInquiryOutcome, SinkInquiryType, type SinkInquiryRequest } from '../../../lib/device'
import { parseChallengeResponse, parseDigestsResponse, runAuthenticationWorkflow } from './authWorkflow'
import type { InquiryRunState } from './runner'

const response = (request: SinkInquiryRequest, rawResponse: Uint8Array): InquiryRunState => ({
  phase: 'response', request, rawResponse,
  status: { outcome: SinkInquiryOutcome.RESPONSE, requestId: 1, type: request.type, responseClass: 0, responseType: 0, responseLength: rawResponse.length },
})

const digests = (mask: number): Uint8Array => new Uint8Array([
  0x10, 0x01, 0x01, mask,
  ...Array.from({ length: mask.toString(2).split('1').length - 1 }, (_, digest) => Array(32).fill(digest + 1)).flat(),
])

describe('authentication workflow', () => {
  it('strictly correlates DIGESTS and PD Source CHALLENGE_AUTH fields', () => {
    expect([...parseDigestsResponse(digests(0x05)).digests.keys()]).toEqual([0, 2])
    expect(() => parseDigestsResponse(new Uint8Array([0x01, 1, 1, 1]))).toThrow(/length/)
    expect(() => parseDigestsResponse(new Uint8Array([0x10, 0x7f, 0x03, 0x00]))).toThrow(/code 0x03, data 0x00/)
    expect(() => parseDigestsResponse(new Uint8Array([0x10, 0x7f, 0x03, 0x00, 0x00]))).toThrow(/exactly 4 bytes/)
    const challenge = new Uint8Array(168)
    challenge.set([0x10, 0x03, 2, 0x05, 0x10, 0x10, 0x01, 0])
    expect(parseChallengeResponse(challenge, 2, 0x05)).toBe(challenge)
    challenge[72] = 1
    expect(() => parseChallengeResponse(challenge, 2, 0x05)).toThrow(/context hash/)
  })

  it('retrieves an exact bounded chain, uses a fresh nonce, verifies, and retains history', async () => {
    const chain = new Uint8Array(300)
    chain[0] = 0x2c
    chain[1] = 0x01
    const nonce = new Uint8Array(32).fill(0xa5)
    const challenge = new Uint8Array(168)
    challenge.set([0x10, 0x03, 0, 1, 0x10, 0x10, 1, 0])
    const run = vi.fn(async (request: SinkInquiryRequest) => {
      if (request.type === SinkInquiryType.GET_DIGESTS) return response(request, digests(1))
      if (request.type === SinkInquiryType.GET_CERTIFICATE) {
        const body = chain.slice(request.offset, request.offset + request.length)
        return response(request, new Uint8Array([0x10, 2, request.slot, 0, ...body]))
      }
      return response(request, challenge)
    })
    const verify = vi.fn(async () => ({ cryptographic: 'verified', trust: 'trusted', policy: 'allowed' } as const))
    const result = await runAuthenticationWorkflow({ run, selectSlots: () => [0], decide: () => 'stop', nonce: () => nonce.slice(), verify })
    expect(result.phase).toBe('completed')
    expect(result.slots[0].certificateChain).toEqual(chain)
    expect(result.history.map(({ step, offset }) => [step, offset])).toEqual([
      ['digests', undefined], ['certificate', 0], ['certificate', 36], ['certificate', 292], ['challenge', undefined],
    ])
    expect(run.mock.calls.at(-1)?.[0]).toMatchObject({ type: SinkInquiryType.CHALLENGE, slot: 0, nonce })
    expect(verify).toHaveBeenCalledOnce()
  })

  it('retries boundedly and records layered firmware failure without false success', async () => {
    const requestState = (request: SinkInquiryRequest): InquiryRunState => ({
      phase: 'terminal',
      status: { outcome: SinkInquiryOutcome.NOT_SUPPORTED, requestId: 2, type: request.type, responseClass: 0, responseType: 0, responseLength: 0 },
    })
    const run = vi.fn(async (request: SinkInquiryRequest) => requestState(request))
    const result = await runAuthenticationWorkflow({
      run, selectSlots: () => [0], decide: () => 'retry', nonce: () => new Uint8Array(32),
      verify: vi.fn(), maxRetriesPerStep: 2,
    })
    expect(result.phase).toBe('stopped')
    expect(run).toHaveBeenCalledTimes(3)
    expect(result.history.map(({ attempt }) => attempt)).toEqual([1, 2, 3])
    expect(result.history.every(({ failure }) => failure?.layer === 'transport')).toBe(true)
  })
})
