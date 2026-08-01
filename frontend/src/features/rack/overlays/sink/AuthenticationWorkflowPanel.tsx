import { useState } from 'react'
import { DialogButton } from '../../../../ui/overlays'
import { runAuthenticationWorkflow, type AuthenticationControl, type AuthenticationFailure, type AuthenticationWorkflowResult } from '../../inquiries/authWorkflow'
import { verifyUsbAuthentication, type AuthenticationTrustAnchor, type AuthenticationVerifierPolicy } from '../../inquiries/authVerifier'
import { withSinkInquiryLease, type SinkInquiryClient } from '../../inquiries/runner'

type PolicyMode = 'inspect' | 'require-configured-anchor'
interface PendingDecision { failure: AuthenticationFailure; resolve: (control: AuthenticationControl) => void }
interface RecordedRun { policyId: string; mode: PolicyMode; anchorId?: string; allowedSlots?: readonly number[]; result: AuthenticationWorkflowResult }

const decodeAnchor = (text: string): Uint8Array => {
  const compact = text.trim().replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g, '')
  if (!compact) throw new Error('Anchor certificate is empty')
  try { return Uint8Array.from(atob(compact), (character) => character.charCodeAt(0)) }
  catch { throw new Error('Anchor must be a PEM certificate or base64 DER') }
}

export const AuthenticationWorkflowPanel = ({ client }: { client: SinkInquiryClient }) => {
  const [slot, setSlot] = useState(0)
  const [mode, setMode] = useState<PolicyMode>('inspect')
  const [anchorId, setAnchorId] = useState('local-anchor')
  const [slotClass, setSlotClass] = useState<'usb-if' | 'additional'>('usb-if')
  const [anchorText, setAnchorText] = useState('')
  const [running, setRunning] = useState(false)
  const [runs, setRuns] = useState<RecordedRun[]>([])
  const [configurationError, setConfigurationError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingDecision | null>(null)

  const start = async () => {
    setConfigurationError(null)
    let anchor: AuthenticationTrustAnchor | undefined
    try {
      if (anchorText.trim()) anchor = { id: anchorId.trim() || 'local-anchor', rootCertificateDer: decodeAnchor(anchorText), allowedSlots: slotClass === 'usb-if' ? [0, 1, 2, 3] : [4, 5, 6, 7] }
      if (mode === 'require-configured-anchor' && !anchor) throw new Error('A configured anchor is required by this policy')
    } catch (error) { setConfigurationError(error instanceof Error ? error.message : String(error)); return }
    const policy: AuthenticationVerifierPolicy = { id: mode, anchors: anchor ? [anchor] : [] }
    setRunning(true)
    const completed = await withSinkInquiryLease(client, async (run) => runAuthenticationWorkflow({
      run,
      selectSlots: () => [slot],
      decide: (failure) => new Promise<AuthenticationControl>((resolve) => setPending({ failure, resolve })),
      nonce: () => crypto.getRandomValues(new Uint8Array(32)),
      verify: async (input) => policy.anchors.length === 0
        ? { cryptographic: 'not-checked', trust: 'not-checked', policy: 'not-checked', failure: { layer: 'trust', message: 'Inspect policy has no configured anchor; trust and policy were not evaluated' } }
        : verifyUsbAuthentication({ ...input, policy }),
    }))
    setRuns((current) => [...current, { policyId: policy.id, mode, ...(anchor ? { anchorId: anchor.id, allowedSlots: anchor.allowedSlots } : {}), result: completed }].slice(-16))
    setPending(null)
    setRunning(false)
  }

  const choose = (control: AuthenticationControl) => { pending?.resolve(control); setPending(null) }
  return <>
    <label>Certificate slot <input aria-label="Certificate slot" type="number" min="0" max="7" value={slot} disabled={running} onChange={(event) => setSlot(Number(event.target.value))} /></label>
    <label>Policy <select aria-label="Authentication policy" value={mode} disabled={running} onChange={(event) => setMode(event.target.value as PolicyMode)}><option value="inspect">Inspect only</option><option value="require-configured-anchor">Require configured anchor</option></select></label>
    <label>Anchor identifier <input aria-label="Anchor identifier" value={anchorId} disabled={running} onChange={(event) => setAnchorId(event.target.value)} /></label>
    <label>Anchor slot class <select aria-label="Anchor slot class" value={slotClass} disabled={running} onChange={(event) => setSlotClass(event.target.value as typeof slotClass)}><option value="usb-if">USB-IF slots 0–3</option><option value="additional">Additional slots 4–7</option></select></label>
    <label>Root certificate (PEM or base64 DER) <textarea aria-label="Root certificate" value={anchorText} disabled={running} onChange={(event) => setAnchorText(event.target.value)} /></label>
    <DialogButton variant="primary" disabled={running || !Number.isInteger(slot) || slot < 0 || slot > 7 || (mode === 'require-configured-anchor' && !anchorText.trim())} onClick={() => void start()}>Authenticate source</DialogButton>
    {mode === 'inspect' && !anchorText.trim() ? <p>Inspect mode collects protocol evidence. Trust and policy will be reported as not evaluated.</p> : null}
    {configurationError ? <p role="alert">{configurationError}</p> : null}
    {running && !pending ? <p role="status">Authenticating source…</p> : null}
    {pending ? <div role="alert"><p>{pending.failure.layer}: {pending.failure.message}</p><DialogButton onClick={() => choose('retry')}>Retry</DialogButton><DialogButton onClick={() => choose('continue')}>Continue</DialogButton><DialogButton onClick={() => choose('stop')}>Stop</DialogButton></div> : null}
    <h3>Authentication history</h3>
    <ol>{runs.map((run, runIndex) => <li key={runIndex}>Policy {run.policyId} · anchor {run.anchorId ?? 'none'} · slots {run.allowedSlots?.join(', ') ?? 'none'} · {run.result.phase}<ol>{run.result.history.map((entry, index) => <li key={`${entry.step}-${entry.slot ?? 'none'}-${entry.offset ?? 'none'}-${entry.attempt}-${index}`}>{entry.step} · attempt {entry.attempt} · {entry.result.phase}{entry.failure ? ` · ${entry.failure.layer}: ${entry.failure.message}` : ''}</li>)}</ol>{run.result.slots.map((entry) => <dl key={entry.slot}><dt>Slot</dt><dd>{entry.slot}</dd><dt>Cryptographic</dt><dd>{entry.verification?.cryptographic ?? 'not-checked'}</dd><dt>Trust</dt><dd>{entry.verification?.trust ?? 'not-checked'}</dd><dt>Policy</dt><dd>{entry.verification?.policy ?? 'not-checked'}</dd></dl>)}</li>)}</ol>
  </>
}
