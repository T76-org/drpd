import { SinkInquiryType, type SinkInquiryRequest } from '../../../lib/device'
import type { InquiryRunState } from './runner'

export const AUTH_MAX_CHAIN_BYTES = 4096
export const AUTH_MAX_CERT_PART_BYTES = 256
// One bounded header read discovers the exact chain length, followed by up to
// sixteen 256-byte reads for a 4096-byte chain.
export const AUTH_MAX_CERT_PARTS = 17

export type AuthenticationFailureLayer = 'transport' | 'protocol' | 'cryptographic' | 'trust' | 'policy'
export type AuthenticationControl = 'retry' | 'continue' | 'stop'

export interface AuthenticationFailure {
  layer: AuthenticationFailureLayer
  message: string
}

export interface AuthenticationAttempt {
  step: 'digests' | 'certificate' | 'challenge'
  slot?: number
  offset?: number
  attempt: number
  request: SinkInquiryRequest
  result: InquiryRunState
  failure?: AuthenticationFailure
}

export interface AuthenticationVerification {
  cryptographic: 'verified' | 'failed' | 'not-checked'
  trust: 'trusted' | 'untrusted' | 'missing-anchor' | 'not-checked'
  policy: 'allowed' | 'denied' | 'unknown' | 'not-checked'
  failure?: AuthenticationFailure
}

export interface AuthenticationSlotResult {
  slot: number
  digest: Uint8Array
  certificateChain?: Uint8Array
  challengeResponse?: Uint8Array
  verification?: AuthenticationVerification
  failure?: AuthenticationFailure
}

export interface AuthenticationWorkflowResult {
  phase: 'completed' | 'stopped'
  slotMask?: number
  slots: AuthenticationSlotResult[]
  history: AuthenticationAttempt[]
}

export interface AuthenticationWorkflowOptions {
  run: (request: SinkInquiryRequest) => Promise<InquiryRunState>
  selectSlots: (populatedSlots: readonly number[]) => readonly number[]
  decide: (failure: AuthenticationFailure, attempt: AuthenticationAttempt) => AuthenticationControl | Promise<AuthenticationControl>
  nonce: () => Uint8Array
  verify: (input: {
    slot: number
    digest: Uint8Array
    certificateChain: Uint8Array
    nonce: Uint8Array
    challengeResponse: Uint8Array
    slotMask: number
  }) => Promise<AuthenticationVerification>
  maxRetriesPerStep?: number
}

const protocolFailure = (message: string): AuthenticationFailure => ({ layer: 'protocol', message })

const parseHeader = (raw: Uint8Array, expectedType: number): void => {
  if (raw.length < 4) throw protocolFailure('Authentication response is shorter than its 4-byte header')
  if (raw[0] !== 0x10 && raw[0] !== 0x01) throw protocolFailure(`Unsupported authentication protocol version 0x${raw[0].toString(16).padStart(2, '0')}`)
  if (raw[1] === 0x7f) {
    if (raw.length !== 4) throw protocolFailure('Authentication ERROR response must be exactly 4 bytes')
    throw protocolFailure(`Authentication ERROR code 0x${raw[2].toString(16).padStart(2, '0')}, data 0x${raw[3].toString(16).padStart(2, '0')}`)
  }
  if (raw[1] !== expectedType) throw protocolFailure(`Unexpected authentication response type 0x${raw[1].toString(16).padStart(2, '0')}`)
}

export const parseDigestsResponse = (raw: Uint8Array): { slotMask: number; digests: Map<number, Uint8Array> } => {
  parseHeader(raw, 0x01)
  if (raw[2] !== 0x01) throw protocolFailure('DIGESTS capabilities must be 0x01')
  const slotMask = raw[3]
  const slots = Array.from({ length: 8 }, (_, slot) => slot).filter((slot) => (slotMask & (1 << slot)) !== 0)
  if (raw.length !== 4 + slots.length * 32) throw protocolFailure('DIGESTS length does not match slot mask')
  return { slotMask, digests: new Map(slots.map((slot, index) => [slot, raw.slice(4 + index * 32, 36 + index * 32)])) }
}

export const parseCertificateResponse = (raw: Uint8Array, slot: number, expectedLength: number): Uint8Array => {
  parseHeader(raw, 0x02)
  if (raw[2] !== slot || raw[3] !== 0) throw protocolFailure('CERTIFICATE slot or reserved field does not match request')
  if (raw.length !== 4 + expectedLength) throw protocolFailure('CERTIFICATE payload length does not match requested length')
  return raw.slice(4)
}

export const parseChallengeResponse = (raw: Uint8Array, slot: number, digestMask: number): Uint8Array => {
  parseHeader(raw, 0x03)
  if (raw.length !== 168) throw protocolFailure('CHALLENGE_AUTH must be exactly 168 bytes')
  if (raw[2] !== slot || (raw[3] & (1 << slot)) === 0) throw protocolFailure('CHALLENGE_AUTH does not identify the selected populated slot')
  if (raw[3] !== digestMask) throw protocolFailure('CHALLENGE_AUTH slot mask changed after DIGESTS')
  if (![0x10, 0x01].includes(raw[4]) || ![0x10, 0x01].includes(raw[5]) || raw[6] !== 0x01 || raw[7] !== 0) throw protocolFailure('CHALLENGE_AUTH version, capabilities, or reserved fields are invalid')
  if (raw.slice(72, 104).some((byte) => byte !== 0)) throw protocolFailure('PD Source CHALLENGE_AUTH context hash must be zero')
  return raw
}

const failureFromResult = (result: InquiryRunState): AuthenticationFailure | undefined => {
  if (result.phase === 'response') return undefined
  if (result.phase === 'transportError') return { layer: 'transport', message: result.message }
  if (result.phase === 'terminal') return { layer: 'transport', message: `Firmware outcome: ${result.status.outcome}` }
  return { layer: 'transport', message: `Inquiry ended in ${result.phase}` }
}

export const runAuthenticationWorkflow = async (options: AuthenticationWorkflowOptions): Promise<AuthenticationWorkflowResult> => {
  const history: AuthenticationAttempt[] = []
  const slots: AuthenticationSlotResult[] = []
  const maxRetries = options.maxRetriesPerStep ?? 2

  const execute = async (step: AuthenticationAttempt['step'], request: SinkInquiryRequest, details: Pick<AuthenticationAttempt, 'slot' | 'offset'> = {}): Promise<InquiryRunState | null> => {
    for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
      const result = await options.run(request)
      const failure = failureFromResult(result)
      const entry: AuthenticationAttempt = { step, request, result, attempt, ...details, ...(failure ? { failure } : {}) }
      history.push(entry)
      if (!failure) return result
      const action = await options.decide(failure, entry)
      if (action !== 'retry' || attempt > maxRetries) return null
    }
    return null
  }

  const digestRequest = { type: SinkInquiryType.GET_DIGESTS } as SinkInquiryRequest
  const digestResult = await execute('digests', digestRequest)
  if (!digestResult || digestResult.phase !== 'response') return { phase: 'stopped', slots, history }
  let parsed: ReturnType<typeof parseDigestsResponse>
  try { parsed = parseDigestsResponse(digestResult.rawResponse) }
  catch (failure) {
    const typed = failure as AuthenticationFailure
    history[history.length - 1].failure = typed
    return { phase: 'stopped', slots, history }
  }
  const selected = [...options.selectSlots([...parsed.digests.keys()])]
  if (selected.length === 0 || selected.some((slot, index) => !parsed.digests.has(slot) || selected.indexOf(slot) !== index)) {
    history[history.length - 1].failure = protocolFailure('Slot selection must contain unique populated slots')
    return { phase: 'stopped', slotMask: parsed.slotMask, slots, history }
  }

  for (const slot of selected) {
    const slotResult: AuthenticationSlotResult = { slot, digest: parsed.digests.get(slot)! }
    slots.push(slotResult)
    const chain = new Uint8Array(AUTH_MAX_CHAIN_BYTES)
    let offset = 0
    let totalLength: number | undefined
    let parts = 0
    while (totalLength === undefined || offset < totalLength) {
      const length = totalLength === undefined ? 36 : Math.min(AUTH_MAX_CERT_PART_BYTES, totalLength - offset)
      const request = { type: SinkInquiryType.GET_CERTIFICATE, slot, offset, length } as SinkInquiryRequest
      const result = await execute('certificate', request, { slot, offset })
      if (!result || result.phase !== 'response') { slotResult.failure = history[history.length - 1].failure; break }
      try {
        const part = parseCertificateResponse(result.rawResponse, slot, length)
        chain.set(part, offset)
        offset += part.length
        parts += 1
        if (parts === 1) {
          totalLength = chain[0] | (chain[1] << 8)
          if (totalLength < 37 || totalLength > AUTH_MAX_CHAIN_BYTES) throw protocolFailure('Certificate chain length is outside 37..4096 bytes')
        }
        if (parts > AUTH_MAX_CERT_PARTS) throw protocolFailure('Certificate retrieval exceeded 17 parts')
      } catch (failure) {
        slotResult.failure = failure as AuthenticationFailure
        history[history.length - 1].failure = slotResult.failure
        break
      }
    }
    if (slotResult.failure || totalLength === undefined) {
      const action = slotResult.failure ? await options.decide(slotResult.failure, history[history.length - 1]) : 'stop'
      if (action === 'continue') continue
      return { phase: 'stopped', slotMask: parsed.slotMask, slots, history }
    }
    slotResult.certificateChain = chain.slice(0, totalLength)
    const nonce = options.nonce()
    if (nonce.length !== 32) {
      slotResult.failure = { layer: 'cryptographic', message: 'Nonce generator must return exactly 32 bytes' }
      return { phase: 'stopped', slotMask: parsed.slotMask, slots, history }
    }
    const challengeRequest = { type: SinkInquiryType.CHALLENGE, slot, nonce: nonce.slice() } as SinkInquiryRequest
    const challenge = await execute('challenge', challengeRequest, { slot })
    if (!challenge || challenge.phase !== 'response') {
      slotResult.failure = history[history.length - 1].failure
      if (slotResult.failure && await options.decide(slotResult.failure, history[history.length - 1]) === 'continue') continue
      return { phase: 'stopped', slotMask: parsed.slotMask, slots, history }
    }
    try { slotResult.challengeResponse = parseChallengeResponse(challenge.rawResponse, slot, parsed.slotMask) }
    catch (failure) {
      slotResult.failure = failure as AuthenticationFailure
      history[history.length - 1].failure = slotResult.failure
      if (await options.decide(slotResult.failure, history[history.length - 1]) === 'continue') continue
      return { phase: 'stopped', slotMask: parsed.slotMask, slots, history }
    }
    slotResult.verification = await options.verify({ slot, digest: slotResult.digest, certificateChain: slotResult.certificateChain, nonce, challengeResponse: slotResult.challengeResponse, slotMask: parsed.slotMask })
    if (slotResult.verification.failure) slotResult.failure = slotResult.verification.failure
  }
  return { phase: 'completed', slotMask: parsed.slotMask, slots, history }
}
