import { describe, expect, it, vi } from 'vitest'
import { SinkInquiryOutcome, SinkInquiryType, type SinkInquiryStatus } from '../../../lib/device'
import {
  expandBoundedFanOut,
  runGuidedInquiryWorkflow,
  runSerialInquiryWorkflow,
  runSinkInquiry,
  type SinkInquiryClient,
} from './runner'

const request = { type: SinkInquiryType.GET_REVISION } as const

const status = (
  outcome: SinkInquiryOutcome,
  requestId: number,
  type = SinkInquiryType.GET_REVISION,
  responseLength = 0,
): SinkInquiryStatus => ({
  outcome,
  requestId,
  type,
  responseClass: 0,
  responseType: 0,
  responseLength,
})

const clientWithStatuses = (...statuses: SinkInquiryStatus[]): SinkInquiryClient => ({
  sendInquiry: vi.fn(async () => undefined),
  getInquiryStatus: vi.fn(async () => statuses.shift() ?? status(SinkInquiryOutcome.PENDING, 1)),
  getInquiryResponse: vi.fn(async () => new Uint8Array()),
})

describe('runSinkInquiry', () => {
  it('serializes transactions sharing one client', async () => {
    let releaseFirst!: () => void
    const statuses = [
      status(SinkInquiryOutcome.NONE, 0), status(SinkInquiryOutcome.RESPONSE, 1),
      status(SinkInquiryOutcome.RESPONSE, 1), status(SinkInquiryOutcome.RESPONSE, 2),
    ]
    let sends = 0
    const client: SinkInquiryClient = {
      sendInquiryRequest: vi.fn(async () => {
        sends += 1
        if (sends === 1) await new Promise<void>((resolve) => { releaseFirst = resolve })
      }),
      getInquiryStatus: vi.fn(async () => statuses.shift()!),
      getInquiryResponse: vi.fn(async () => new Uint8Array()),
    }
    const first = runSinkInquiry(client, request, { wait: async () => undefined })
    await vi.waitFor(() => expect(sends).toBe(1))
    const second = runSinkInquiry(client, request, { wait: async () => undefined })
    await Promise.resolve()
    expect(sends).toBe(1)
    releaseFirst()
    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    expect(sends).toBe(2)
  })
  it('correlates request ID and returns exact raw response', async () => {
    const client = clientWithStatuses(
      status(SinkInquiryOutcome.NONE, 4),
      status(SinkInquiryOutcome.PENDING, 5),
      status(SinkInquiryOutcome.RESPONSE, 5, SinkInquiryType.GET_REVISION, 2),
    )
    client.getInquiryResponse = vi.fn(async () => new Uint8Array([0x12, 0x34]))
    const result = await runSinkInquiry(client, request, {
      wait: async () => undefined,
    })
    expect(result).toMatchObject({
      phase: 'response',
      status: { requestId: 5 },
      rawResponse: new Uint8Array([0x12, 0x34]),
    })
  })

  it.each([
    SinkInquiryOutcome.NOT_SUPPORTED,
    SinkInquiryOutcome.REJECTED,
    SinkInquiryOutcome.WAIT,
    SinkInquiryOutcome.GOODCRC_TIMEOUT,
    SinkInquiryOutcome.RESPONSE_TIMEOUT,
    SinkInquiryOutcome.PROTOCOL_ERROR,
    SinkInquiryOutcome.ABORTED,
  ])('returns %s as terminal protocol result', async (outcome) => {
    const result = await runSinkInquiry(
      clientWithStatuses(status(SinkInquiryOutcome.NONE, 1), status(outcome, 2)),
      request,
      { wait: async () => undefined },
    )
    expect(result).toMatchObject({ phase: 'terminal', status: { outcome } })
  })

  it('detects result replacement by another request', async () => {
    const result = await runSinkInquiry(
      clientWithStatuses(
        status(SinkInquiryOutcome.NONE, 1),
        status(SinkInquiryOutcome.PENDING, 2),
        status(SinkInquiryOutcome.PENDING, 3),
      ),
      request,
      { wait: async () => undefined },
    )
    expect(result).toMatchObject({ phase: 'superseded', status: { requestId: 3 } })
  })

  it('separates transport and malformed-body failures from protocol outcomes', async () => {
    const client = clientWithStatuses(
      status(SinkInquiryOutcome.NONE, 1),
      status(SinkInquiryOutcome.RESPONSE, 2, SinkInquiryType.GET_REVISION, 2),
    )
    client.getInquiryResponse = vi.fn(async () => new Uint8Array([0x12]))
    const result = await runSinkInquiry(client, request)
    expect(result).toMatchObject({ phase: 'transportError', message: expect.stringContaining('length mismatch') })
  })

  it('times out when firmware never publishes a correlated request', async () => {
    const result = await runSinkInquiry(
      clientWithStatuses(status(SinkInquiryOutcome.NONE, 1)),
      request,
      { maxPolls: 2, wait: async () => undefined },
    )
    expect(result).toMatchObject({ phase: 'transportError', message: 'Inquiry status polling timed out' })
  })

  it('records serial workflow history and stops on non-response outcome', async () => {
    const client = clientWithStatuses(
      status(SinkInquiryOutcome.NONE, 1),
      status(SinkInquiryOutcome.NOT_SUPPORTED, 2),
    )
    const result = await runSerialInquiryWorkflow(
      client,
      [
        { id: 'first', request },
        { id: 'second', request },
      ],
      { wait: async () => undefined },
    )
    expect(result).toMatchObject({
      phase: 'stopped',
      history: [{ stepId: 'first', result: { phase: 'terminal' } }],
    })
    expect(client.sendInquiry).toHaveBeenCalledTimes(1)
  })

  it('validates bounded polling options before transport', async () => {
    const client = clientWithStatuses()
    const states: string[] = []
    const result = await runSinkInquiry(client, request, {
      maxPolls: 0,
      onStateChange: ({ phase }) => states.push(phase),
    })
    expect(result).toMatchObject({ phase: 'transportError', message: expect.stringContaining('max polls') })
    expect(states[0]).toBe('validating')
    expect(client.getInquiryStatus).not.toHaveBeenCalled()
    expect(client.sendInquiry).not.toHaveBeenCalled()
  })

  it('supports guided Retry, Continue, Stop controls with history', async () => {
    const retryClient = clientWithStatuses(
      status(SinkInquiryOutcome.NONE, 1), status(SinkInquiryOutcome.WAIT, 2),
      status(SinkInquiryOutcome.WAIT, 2), status(SinkInquiryOutcome.NOT_SUPPORTED, 3),
    )
    const controls = ['retry', 'continue'] as const
    let decision = 0
    const continued = await runGuidedInquiryWorkflow(
      retryClient,
      [{ id: 'step', request }],
      {
        runner: { wait: async () => undefined },
        decide: () => controls[decision++],
      },
    )
    expect(continued.phase).toBe('completed')
    expect(continued.history.map(({ attempt }) => attempt)).toEqual([1, 2])

    const stopped = await runGuidedInquiryWorkflow(
      clientWithStatuses(status(SinkInquiryOutcome.NONE, 1), status(SinkInquiryOutcome.REJECTED, 2)),
      [{ id: 'step', request }],
      { decide: () => 'stop' },
    )
    expect(stopped.phase).toBe('stopped')
  })

  it('bounds guided all-items fan-out', () => {
    expect(expandBoundedFanOut(['US', 'CA'], (code) => ({ id: code, request }), 2)).toHaveLength(2)
    expect(() => expandBoundedFanOut(['US', 'CA', 'GB'], (code) => ({ id: code, request }), 2))
      .toThrow('exceeds limit')
  })
})
