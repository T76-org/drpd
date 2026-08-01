import { SinkInquiryOutcome } from '../../../lib/device'
import { withSinkInquiryLease, type SinkInquiryClient } from './runner'
import { runAuthenticationWorkflow, type AuthenticationAttempt, type AuthenticationFailure } from './authWorkflow'
import { inspectUsbAuthenticationEvidence } from './authVerifier'

export const SOURCE_AUTHENTICATION_EVENT_TITLE = 'INQUIRY - Source authentication'

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join('')

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

export const surveySourceAuthentication = async (
  client: SinkInquiryClient,
): Promise<{ summary: string }> => withSinkInquiryLease(client, async (run) => {
  const result = await runAuthenticationWorkflow({
    run,
    selectSlots: (populatedSlots) => populatedSlots,
    decide: automaticDecision,
    nonce: () => crypto.getRandomValues(new Uint8Array(32)),
    verify: inspectUsbAuthenticationEvidence,
  })

  const lines: string[] = []
  if (result.slotMask === undefined) {
    const finalAttempt = result.history.at(-1)
    lines.push(`Authentication discovery stopped before a valid DIGESTS response${finalAttempt?.failure ? `: ${finalAttempt.failure.layer}: ${finalAttempt.failure.message}` : '.'}`)
  } else {
    const populated = Array.from({ length: 8 }, (_, slot) => slot).filter((slot) => (result.slotMask! & (1 << slot)) !== 0)
    lines.push(`DIGESTS slot mask 0x${result.slotMask.toString(16).toUpperCase().padStart(2, '0')}; populated slots: ${populated.join(', ') || 'none'}.`)
  }

  for (const slot of result.slots) {
    const details = [
      `digest ${hex(slot.digest)}`,
      slot.certificateChain ? `certificate chain ${slot.certificateChain.length} bytes` : 'certificate chain unavailable',
      slot.challengeResponse ? 'challenge response received' : 'challenge response unavailable',
      `cryptographic ${slot.verification?.cryptographic ?? 'not-checked'}`,
      `trust ${slot.verification?.trust ?? 'not-checked'}`,
      `policy ${slot.verification?.policy ?? 'not-checked'}`,
    ]
    if (slot.failure) details.push(`${slot.failure.layer}: ${slot.failure.message}`)
    lines.push(`Slot ${slot.slot}: ${details.join('; ')}.`)
  }

  const failedAttempts = result.history.filter(({ failure }) => failure)
  lines.push(`Workflow ${result.phase}; ${result.history.length} atomic attempt${result.history.length === 1 ? '' : 's'}; ${failedAttempts.length} failed attempt${failedAttempts.length === 1 ? '' : 's'}.`)
  lines.push('Trust and policy were not evaluated because no configured root anchor was used.')
  return { summary: lines.join('\n') }
})
