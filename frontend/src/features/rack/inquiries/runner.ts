import {
  SinkInquiryOutcome,
  type SinkInquiryRequest,
  type SinkInquiryStatus,
  type SinkInquiryType,
} from '../../../lib/device'

export interface SinkInquiryClient {
  sendInquiry: (type: SinkInquiryType) => Promise<void>
  getInquiryStatus: () => Promise<SinkInquiryStatus>
  getInquiryResponse: () => Promise<Uint8Array>
}

export type InquiryRunState =
  | { phase: 'idle' }
  | { phase: 'validating'; request: SinkInquiryRequest }
  | { phase: 'sending'; type: SinkInquiryType }
  | { phase: 'waiting'; type: SinkInquiryType; requestId: number | null }
  | { phase: 'response'; status: SinkInquiryStatus; rawResponse: Uint8Array }
  | { phase: 'terminal'; status: SinkInquiryStatus }
  | { phase: 'superseded'; expectedType: SinkInquiryType; status: SinkInquiryStatus }
  | { phase: 'transportError'; type: SinkInquiryType; message: string }
  | { phase: 'cancelled'; type: SinkInquiryType }

export interface InquiryRunnerOptions {
  pollIntervalMs?: number
  maxPolls?: number
  signal?: AbortSignal
  onStateChange?: (state: InquiryRunState) => void
  wait?: (milliseconds: number) => Promise<void>
}

export interface SerialInquiryWorkflowStep {
  id: string
  request: SinkInquiryRequest
}

export interface InquiryHistoryEntry {
  stepId: string
  attempt: number
  result: InquiryRunState
}

export type GuidedWorkflowControl = 'retry' | 'continue' | 'stop'

export interface GuidedInquiryWorkflowOptions {
  runner?: InquiryRunnerOptions
  maxRetriesPerStep?: number
  decide: (
    step: SerialInquiryWorkflowStep,
    result: InquiryRunState,
    history: readonly InquiryHistoryEntry[],
  ) => GuidedWorkflowControl
}

export interface SerialInquiryWorkflowResult {
  phase: 'completed' | 'stopped'
  history: InquiryHistoryEntry[]
}

const defaultWait = async (milliseconds: number): Promise<void> => {
  await new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
}

const isTerminalOutcome = (outcome: SinkInquiryOutcome): boolean => (
  outcome !== SinkInquiryOutcome.NONE && outcome !== SinkInquiryOutcome.PENDING
)

const validateRunnerOptions = (options: InquiryRunnerOptions): void => {
  const pollIntervalMs = options.pollIntervalMs ?? 50
  const maxPolls = options.maxPolls ?? 100
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 0 || pollIntervalMs > 60_000) {
    throw new Error('Inquiry poll interval must be between 0 and 60000 ms')
  }
  if (!Number.isInteger(maxPolls) || maxPolls < 1 || maxPolls > 1_000) {
    throw new Error('Inquiry max polls must be an integer between 1 and 1000')
  }
}

export const runSinkInquiry = async (
  client: SinkInquiryClient,
  request: SinkInquiryRequest,
  options: InquiryRunnerOptions = {},
): Promise<InquiryRunState> => {
  const type = request.type
  const emit = (state: InquiryRunState): InquiryRunState => {
    options.onStateChange?.(state)
    return state
  }
  const cancelled = (): InquiryRunState => emit({ phase: 'cancelled', type })

  try {
    emit({ phase: 'validating', request })
    validateRunnerOptions(options)
    const baseline = await client.getInquiryStatus()
    if (options.signal?.aborted) return cancelled()
    emit({ phase: 'sending', type })
    await client.sendInquiry(type)

    let requestId: number | null = null
    const maxPolls = options.maxPolls ?? 100
    const wait = options.wait ?? defaultWait
    for (let poll = 0; poll < maxPolls; poll += 1) {
      if (options.signal?.aborted) return cancelled()
      const status = await client.getInquiryStatus()
      if (requestId === null) {
        if (status.requestId === baseline.requestId) {
          emit({ phase: 'waiting', type, requestId: null })
        } else if (status.type !== type) {
          return emit({ phase: 'superseded', expectedType: type, status })
        } else {
          requestId = status.requestId
        }
      } else if (status.requestId !== requestId || status.type !== type) {
        return emit({ phase: 'superseded', expectedType: type, status })
      }

      if (requestId !== null && status.outcome === SinkInquiryOutcome.RESPONSE) {
        const rawResponse = await client.getInquiryResponse()
        if (rawResponse.byteLength !== status.responseLength) {
          throw new Error(
            `Inquiry response length mismatch: expected ${status.responseLength}, got ${rawResponse.byteLength}`,
          )
        }
        return emit({ phase: 'response', status, rawResponse })
      }
      if (requestId !== null && isTerminalOutcome(status.outcome)) {
        return emit({ phase: 'terminal', status })
      }

      emit({ phase: 'waiting', type, requestId })
      await wait(options.pollIntervalMs ?? 50)
    }
    throw new Error('Inquiry status polling timed out')
  } catch (error) {
    if (options.signal?.aborted) return cancelled()
    return emit({
      phase: 'transportError',
      type,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

export const runSerialInquiryWorkflow = async (
  client: SinkInquiryClient,
  steps: readonly SerialInquiryWorkflowStep[],
  options: InquiryRunnerOptions = {},
): Promise<SerialInquiryWorkflowResult> => {
  const history: InquiryHistoryEntry[] = []
  for (const step of steps) {
    const result = await runSinkInquiry(client, step.request, options)
    history.push({ stepId: step.id, attempt: 1, result })
    if (result.phase !== 'response') {
      return { phase: 'stopped', history }
    }
  }
  return { phase: 'completed', history }
}

export const expandBoundedFanOut = <T>(
  items: readonly T[],
  buildStep: (item: T, index: number) => SerialInquiryWorkflowStep,
  maxItems = 32,
): SerialInquiryWorkflowStep[] => {
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 256) {
    throw new Error('Guided inquiry fan-out limit must be an integer between 1 and 256')
  }
  if (items.length > maxItems) {
    throw new Error(`Guided inquiry fan-out exceeds limit of ${maxItems}`)
  }
  return items.map(buildStep)
}

export const runGuidedInquiryWorkflow = async (
  client: SinkInquiryClient,
  steps: readonly SerialInquiryWorkflowStep[],
  options: GuidedInquiryWorkflowOptions,
): Promise<SerialInquiryWorkflowResult> => {
  const maxRetries = options.maxRetriesPerStep ?? 2
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 10) {
    throw new Error('Guided inquiry retries must be an integer between 0 and 10')
  }
  const history: InquiryHistoryEntry[] = []
  for (const step of steps) {
    let retries = 0
    while (true) {
      const result = await runSinkInquiry(client, step.request, options.runner)
      history.push({ stepId: step.id, attempt: retries + 1, result })
      if (result.phase === 'response') break
      const control = options.decide(step, result, history)
      if (control === 'continue') break
      if (control === 'stop') return { phase: 'stopped', history }
      if (retries >= maxRetries) return { phase: 'stopped', history }
      retries += 1
    }
  }
  return { phase: 'completed', history }
}
