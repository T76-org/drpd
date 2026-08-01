import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogButton } from '../../../../ui/overlays'
import type { InquiryDefinition } from '../../inquiries/catalog'
import { formatSinkInquiryOutcome } from '../../inquiries/presentation'
import {
  runSinkInquiry,
  type InquiryRunState,
  type SinkInquiryClient,
} from '../../inquiries/runner'

const bytesToHex = (bytes: Uint8Array): string => (
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ')
)

export const SourceInquiryDialog = ({
  open,
  onOpenChange,
  definition,
  client,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  definition: InquiryDefinition | null
  client: SinkInquiryClient | null
}) => {
  const [state, setState] = useState<InquiryRunState>({ phase: 'idle' })

  useEffect(() => {
    if (!open || !definition || !client) return
    const controller = new AbortController()
    void runSinkInquiry(client, definition.buildRequest({}), {
      signal: controller.signal,
      onStateChange: setState,
    })
    return () => controller.abort()
  }, [client, definition, open])

  const result = useMemo(() => {
    switch (state.phase) {
      case 'idle': return 'Preparing inquiry…'
      case 'sending': return 'Sending inquiry…'
      case 'waiting': return 'Waiting for Source…'
      case 'cancelled': return 'Inquiry view closed.'
      case 'transportError': return `Communication error: ${state.message}`
      case 'superseded': return `Result superseded by request ${state.status.requestId}.`
      case 'terminal': return `${formatSinkInquiryOutcome(state.status.outcome)} · Request ${state.status.requestId}`
      case 'response': return `Response received · Request ${state.status.requestId}`
    }
  }, [state])

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={definition?.label ?? 'Source inquiry'}
      description={definition?.description}
      dialogStyle={{ width: 'min(520px, calc(100vw - var(--space-32)))' }}
      footer={<DialogButton onClick={() => onOpenChange(false)}>Close</DialogButton>}
    >
      <div aria-live="polite" role="status">{result}</div>
      {state.phase === 'response' ? (
        <dl>
          <dt>Response class</dt><dd>{state.status.responseClass}</dd>
          <dt>Response type</dt><dd>{state.status.responseType}</dd>
          <dt>Response length</dt><dd>{state.status.responseLength} bytes</dd>
          <dt>Raw response body</dt><dd><code>{bytesToHex(state.rawResponse) || '(empty)'}</code></dd>
        </dl>
      ) : null}
      <p>Full packet decoding remains available in Message Log.</p>
    </Dialog>
  )
}
