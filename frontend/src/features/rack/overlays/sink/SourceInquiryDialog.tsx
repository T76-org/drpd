import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogButton } from '../../../../ui/overlays'
import type { InquiryDefinition } from '../../inquiries/catalog'
import { formatSinkInquiryOutcome } from '../../inquiries/presentation'
import { decodeInquiryResponse } from '../../inquiries/decode'
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
  onResponse,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  definition: InquiryDefinition | null
  client: SinkInquiryClient | null
  onResponse?: (definition: InquiryDefinition) => void | Promise<void>
}) => {
  const [state, setState] = useState<InquiryRunState>({ phase: 'idle' })
  const [approvedDefinitionId, setApprovedDefinitionId] = useState<string | null>(null)
  const confirmed = definition?.confirmation == null || approvedDefinitionId === definition.id

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setApprovedDefinitionId(null)
    onOpenChange(nextOpen)
  }

  useEffect(() => {
    if (!open || !definition || !client || !confirmed) return
    const controller = new AbortController()
    void runSinkInquiry(client, definition.buildRequest({}), {
      signal: controller.signal,
      onStateChange: setState,
    }).then((result) => {
      if (result.phase === 'response' && !controller.signal.aborted) void onResponse?.(definition)
    })
    return () => controller.abort()
  }, [client, confirmed, definition, onResponse, open])

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
  const decoded = useMemo(() => {
    if (state.phase !== 'response') return null
    try { return decodeInquiryResponse(state.status, state.rawResponse) }
    catch (error) { return { messageTypeName: 'Response', summary: `Could not decode response: ${error instanceof Error ? error.message : String(error)}` } }
  }, [state])

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title={definition?.confirmation && !confirmed ? definition.confirmation.title : (definition?.label ?? 'Source inquiry')}
      description={definition?.description}
      dialogStyle={{ width: 'min(520px, calc(100vw - var(--space-32)))' }}
      footer={definition?.confirmation && !confirmed ? (
        <>
          <DialogButton onClick={() => handleOpenChange(false)}>Cancel</DialogButton>
          <DialogButton variant="primary" onClick={() => setApprovedDefinitionId(definition.id)}>
            {definition.confirmation.confirmLabel}
          </DialogButton>
        </>
      ) : <DialogButton onClick={() => handleOpenChange(false)}>Close</DialogButton>}
    >
      {definition?.confirmation && !confirmed ? <p role="alert">{definition.confirmation.body}</p> : null}
      {definition?.confirmation && !confirmed ? null : <>
      <div aria-live="polite" role="status">{result}</div>
      {state.phase === 'response' ? (
        <dl>
          <dt>Decoded response</dt><dd><pre>{decoded?.summary}</pre></dd>
          <dt>Response class</dt><dd>{state.status.responseClass}</dd>
          <dt>Response type</dt><dd>{state.status.responseType}</dd>
          <dt>Response length</dt><dd>{state.status.responseLength} bytes</dd>
          <dt>Raw response body</dt><dd><code>{bytesToHex(state.rawResponse) || '(empty)'}</code></dd>
        </dl>
      ) : null}
      <p>Full packet decoding remains available in Message Log.</p>
      </>}
    </Dialog>
  )
}
