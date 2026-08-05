import { SinkInquiryOutcome, SinkInquiryType, type LoggedEventDataSection, type SinkInquiryRequest } from '../../../lib/device'
import { withSinkInquiryLease, type InquiryRunState, type SinkInquiryClient } from './runner'
import {
  runAuthenticationWorkflow,
  type AuthenticationAttempt,
  type AuthenticationFailure,
  type AuthenticationSlotResult,
  type AuthenticationWorkflowResult,
} from './authWorkflow'
import { inspectUsbAuthenticationEvidence } from './authVerifier'

export const SOURCE_AUTHENTICATION_EVENT_TITLE = 'INQUIRY - Source authentication'

const compactHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join('')
const spacedHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')
const rawHex = (bytes: Uint8Array): string => `\`${spacedHex(bytes) || '(empty)'}\``
const hex8 = (value: number): string => `0x${value.toString(16).toUpperCase().padStart(2, '0')}`
const detailedValue = (value: string, explanation: string): string => `${value}\n\n_${explanation}_`

const sha256Hex = async (bytes: Uint8Array): Promise<string> => compactHex(new Uint8Array(
  await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer),
))

const RETRYABLE_AUTH_OUTCOMES = new Set<SinkInquiryOutcome>([
  SinkInquiryOutcome.WAIT,
  SinkInquiryOutcome.BUSY,
  SinkInquiryOutcome.GOODCRC_TIMEOUT,
  SinkInquiryOutcome.RESPONSE_TIMEOUT,
])

const automaticDecision = (
  _failure: AuthenticationFailure,
  attempt: AuthenticationAttempt,
): 'retry' | 'continue' | 'stop' => {
  const retryable = attempt.result.phase === 'transportError' || (
    attempt.result.phase === 'terminal' && RETRYABLE_AUTH_OUTCOMES.has(attempt.result.status.outcome)
  )
  if (retryable && attempt.attempt < 3) return 'retry'
  return attempt.step === 'digests' ? 'stop' : 'continue'
}

const describeResult = (result: InquiryRunState): string => {
  if (result.phase === 'response') return 'Response received.'
  if (result.phase === 'terminal') return `Firmware outcome: ${result.status.outcome}.`
  if (result.phase === 'transportError') return `Transport error: ${result.message}`
  if (result.phase === 'superseded') return `Superseded by request ${result.status.requestId}.`
  if (result.phase === 'cancelled') return 'Cancelled.'
  return `Inquiry ended in ${result.phase}.`
}

const responseBytes = (result: InquiryRunState): Uint8Array | undefined =>
  result.phase === 'response' ? result.rawResponse : result.phase === 'terminal' ? result.rawResponse : undefined

const describeRequest = (request: SinkInquiryRequest): string => {
  if (request.type === SinkInquiryType.GET_CERTIFICATE) {
    return `GET_CERTIFICATE slot ${request.slot}, offset ${request.offset}, length ${request.length}`
  }
  if (request.type === SinkInquiryType.CHALLENGE) return `CHALLENGE slot ${request.slot}`
  return request.type
}

const buildDiscoverySection = (result: AuthenticationWorkflowResult): LoggedEventDataSection => {
  const attempt = result.history.find(({ step }) => step === 'digests')
  const raw = attempt ? responseBytes(attempt.result) : undefined
  const populated = result.slotMask === undefined
    ? []
    : Array.from({ length: 8 }, (_, slot) => slot).filter((slot) => (result.slotMask! & (1 << slot)) !== 0)
  return {
    title: 'DIGESTS Discovery',
    entries: [
      { key: 'Outcome', value: attempt ? describeResult(attempt.result) : 'DIGESTS was not attempted.' },
      ...(attempt?.failure ? [{ key: 'Failure', value: `**${attempt.failure.layer}:** ${attempt.failure.message}` }] : []),
      ...(result.slotMask === undefined ? [] : [
        { key: 'Protocol Version (byte 0)', value: detailedValue(`\`${hex8(raw?.[0] ?? 0)}\``, 'Authentication protocol version returned by the Source.') },
        { key: 'Response Type (byte 1)', value: detailedValue(`\`${hex8(raw?.[1] ?? 0)}\``, 'DIGESTS response type.') },
        { key: 'Capabilities (byte 2)', value: detailedValue(`\`${hex8(raw?.[2] ?? 0)}\``, 'Authentication capabilities byte; DIGESTS requires 0x01.') },
        { key: 'Slot Mask (byte 3)', value: detailedValue(`**${hex8(result.slotMask)}**`, `Bits 7:0 identify populated digest slots: ${populated.join(', ') || 'none'}.`) },
        { key: 'Advertised Slots', value: populated.length === 0 ? 'None.' : populated.map((slot) => `\`${slot}\``).join(', ') },
      ]),
      ...(raw ? [{ key: 'Raw Logical Response', value: detailedValue(rawHex(raw), 'Complete DIGESTS response payload. The outer USB-PD packet header and CRC are not included.') }] : []),
    ],
  }
}

const buildSlotSection = async (
  slot: AuthenticationSlotResult,
  history: readonly AuthenticationAttempt[],
): Promise<LoggedEventDataSection> => {
  const challengeAttempt = [...history].reverse().find(
    (attempt) => attempt.step === 'challenge' && attempt.slot === slot.slot,
  )
  const challengeRequest = challengeAttempt?.request.type === SinkInquiryType.CHALLENGE ? challengeAttempt.request : undefined
  const certificateAttempts = history.filter((attempt) => attempt.step === 'certificate' && attempt.slot === slot.slot)
  const entries: LoggedEventDataSection['entries'] = [
    { key: 'Slot', value: `\`${slot.slot}\`` },
    { key: 'Outcome', value: slot.failure ? `**${slot.failure.layer}:** ${slot.failure.message}` : 'Authentication evidence collected.' },
    { key: 'Digest', value: detailedValue(`\`${compactHex(slot.digest)}\``, '32-byte SHA-256 digest advertised for this certificate-chain slot.') },
  ]
  if (slot.certificateChain) {
    const chain = slot.certificateChain
    const declaredLength = chain[0] | ((chain[1] ?? 0) << 8)
    entries.push(
      { key: 'Certificate Chain Length', value: detailedValue(`**${chain.length} bytes**`, `Header bytes 0–1 declare ${declaredLength} bytes; retrieved in ${certificateAttempts.filter(({ result }) => result.phase === 'response').length} successful part(s).`) },
      { key: 'Certificate Chain SHA-256', value: `\`${await sha256Hex(chain)}\`` },
      { key: 'Chain Header — Reserved (bytes 2–3)', value: detailedValue(rawHex(chain.subarray(2, 4)), 'Reserved header bytes; both must be zero.') },
      { key: 'Root Certificate Hash (bytes 4–35)', value: detailedValue(`\`${compactHex(chain.subarray(4, 36))}\``, 'SHA-256 hash identifying the omitted root certificate.') },
      { key: 'Certificate Data (bytes 36–end)', value: detailedValue(rawHex(chain.subarray(36)), 'Complete wire-order DER certificate sequence returned by the Source.') },
      { key: 'Complete Certificate Chain', value: detailedValue(rawHex(chain), 'Complete reassembled certificate-chain body, including its 36-byte header.') },
    )
  } else {
    entries.push({ key: 'Certificate Chain', value: 'Unavailable.' })
  }
  if (challengeRequest) {
    entries.push({ key: 'Challenge Nonce', value: detailedValue(`\`${compactHex(challengeRequest.nonce)}\``, 'Fresh 32-byte nonce sent for this slot.') })
  }
  if (slot.challengeResponse) {
    const response = slot.challengeResponse
    entries.push(
      { key: 'Challenge Response', value: 'Received and structurally validated.' },
      { key: 'Header (bytes 0–7)', value: detailedValue(rawHex(response.subarray(0, 8)), `Protocol ${hex8(response[0])}; response type ${hex8(response[1])}; slot ${response[2]}; digest mask ${hex8(response[3])}; min/max protocol ${hex8(response[4])}/${hex8(response[5])}; capabilities ${hex8(response[6])}; reserved ${hex8(response[7])}.`) },
      { key: 'Certificate Chain Hash (bytes 8–39)', value: `\`${compactHex(response.subarray(8, 40))}\`` },
      { key: 'Salt (bytes 40–71)', value: `\`${compactHex(response.subarray(40, 72))}\`` },
      { key: 'Context Hash (bytes 72–103)', value: detailedValue(`\`${compactHex(response.subarray(72, 104))}\``, 'PD Source authentication requires this field to be all zero.') },
      { key: 'Signature (bytes 104–167)', value: detailedValue(rawHex(response.subarray(104, 168)), 'Raw 64-byte ECDSA P-256 signature evidence.') },
      { key: 'Raw Challenge Response', value: detailedValue(rawHex(response), 'Complete CHALLENGE_AUTH logical response body.') },
    )
  } else {
    entries.push({ key: 'Challenge Response', value: 'Unavailable.' })
  }
  entries.push(
    { key: 'Cryptographic Verification', value: `**${slot.verification?.cryptographic ?? 'not-checked'}**` },
    { key: 'Trust Verification', value: `**${slot.verification?.trust ?? 'not-checked'}**` },
    { key: 'Policy Decision', value: `**${slot.verification?.policy ?? 'not-checked'}**` },
    ...(slot.verification?.failure ? [{ key: 'Verification Failure', value: `**${slot.verification.failure.layer}:** ${slot.verification.failure.message}` }] : []),
  )
  return { title: `Authentication Slot ${slot.slot}`, entries }
}

const buildHistorySection = (result: AuthenticationWorkflowResult): LoggedEventDataSection => ({
  title: 'Workflow History',
  entries: [
    { key: 'Final Phase', value: `**${result.phase}**` },
    { key: 'Atomic Attempts', value: `${result.history.length}` },
    { key: 'Failed Attempts', value: `${result.history.filter(({ failure }) => failure).length}` },
    { key: 'Trust Policy', value: 'No configured root anchor was used; trust and policy therefore remain unevaluated.' },
    ...result.history.map((attempt, index) => {
      const raw = responseBytes(attempt.result)
      return {
        key: `Attempt ${index + 1} — ${attempt.step}`,
        value: [
          `**Request:** ${describeRequest(attempt.request)}; step attempt ${attempt.attempt}.`,
          `**Outcome:** ${describeResult(attempt.result)}`,
          ...(attempt.failure ? [`**Failure:** ${attempt.failure.layer}: ${attempt.failure.message}`] : []),
          ...(raw ? [`**Raw logical response:** ${rawHex(raw)}`] : []),
        ].join('\n\n'),
      }
    }),
  ],
})

const presentAuthenticationResult = async (
  result: AuthenticationWorkflowResult,
): Promise<{ summary: string; eventData: LoggedEventDataSection[] }> => {
  const lines: string[] = []
  if (result.slotMask === undefined) {
    const finalAttempt = result.history.at(-1)
    lines.push(
      '- **DIGESTS discovery:**',
      `  - **Outcome:** Stopped before a valid response${finalAttempt?.failure ? ` — ${finalAttempt.failure.layer}: ${finalAttempt.failure.message}` : ''}.`,
    )
  } else {
    const populated = Array.from({ length: 8 }, (_, slot) => slot).filter((slot) => (result.slotMask! & (1 << slot)) !== 0)
    lines.push(
      '- **DIGESTS discovery:**',
      `  - **Slot mask:** ${hex8(result.slotMask)}`,
      `  - **Populated slots:** ${populated.join(', ') || 'None'}`,
    )
  }
  for (const slot of result.slots) {
    lines.push(
      `- **Authentication slot ${slot.slot}:**`,
      `  - **Digest:** ${compactHex(slot.digest)}`,
      `  - **Certificate chain:** ${slot.certificateChain ? `${slot.certificateChain.length} bytes` : 'Unavailable'}`,
      `  - **Challenge response:** ${slot.challengeResponse ? 'Received' : 'Unavailable'}`,
      `  - **Cryptographic verification:** ${slot.verification?.cryptographic ?? 'not-checked'}`,
      `  - **Trust verification:** ${slot.verification?.trust ?? 'not-checked'}`,
      `  - **Policy decision:** ${slot.verification?.policy ?? 'not-checked'}`,
      ...(slot.failure ? [`  - **Failure:** ${slot.failure.layer}: ${slot.failure.message}`] : []),
    )
  }
  const failedAttempts = result.history.filter(({ failure }) => failure)
  lines.push(
    '- **Workflow:**',
    `  - **Final phase:** ${result.phase}`,
    `  - **Atomic attempts:** ${result.history.length}`,
    `  - **Failed attempts:** ${failedAttempts.length}`,
    '  - **Trust anchors:** Not configured; trust and policy were not evaluated.',
  )
  return {
    summary: lines.join('\n'),
    eventData: [
      buildDiscoverySection(result),
      ...await Promise.all(result.slots.map((slot) => buildSlotSection(slot, result.history))),
      buildHistorySection(result),
    ],
  }
}

export const surveySourceAuthentication = async (
  client: SinkInquiryClient,
): Promise<{ summary: string; eventData: LoggedEventDataSection[] }> => withSinkInquiryLease(client, async (run) => {
  const result = await runAuthenticationWorkflow({
    run,
    selectSlots: (populatedSlots) => populatedSlots,
    decide: automaticDecision,
    nonce: () => crypto.getRandomValues(new Uint8Array(32)),
    verify: inspectUsbAuthenticationEvidence,
  })
  return await presentAuthenticationResult(result)
})
