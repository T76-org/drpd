import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogButton } from '../../../../ui/overlays'
import { validateInquiryParameters, type InquiryDefinition } from '../../inquiries/catalog'
import { SinkInquiryType, type SinkInquiryRequest } from '../../../../lib/device'
import { parseCountryCodesDataBlock } from '../../../../lib/device/drpd/usb-pd/DataObjects'
import { buildCountryInfoSteps } from '../../inquiries/countryWorkflow'
import { formatSinkInquiryOutcome } from '../../inquiries/presentation'
import { decodeInquiryResponse } from '../../inquiries/decode'
import {
  runSinkInquiry,
  type InquiryRunState,
  type InquiryHistoryEntry,
  type SerialInquiryWorkflowStep,
  type SinkInquiryClient,
} from '../../inquiries/runner'

const bytesToHex = (bytes: Uint8Array): string => (
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ')
)

const CountryInformationWorkflow = ({ client }: { client: SinkInquiryClient }) => {
  const maxRetries = 2
  const maxHistory = 64
  const [history, setHistory] = useState<InquiryHistoryEntry[]>([])
  const [codes, setCodes] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [running, setRunning] = useState(true)
  const [pending, setPending] = useState<{ steps: SerialInquiryWorkflowStep[]; index: number } | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const busyRef = useRef(true)

  const runSteps = useCallback(async (steps: SerialInquiryWorkflowStep[], startIndex: number) => {
    if (busyRef.current) return
    busyRef.current = true
    setRunning(true)
    for (let index = startIndex; index < steps.length; index += 1) {
      const step = steps[index]
      const attempt = history.filter(({ stepId }) => stepId === step.id).length + 1
      const result = await runSinkInquiry(client, step.request, { signal: controllerRef.current?.signal })
      setHistory((current) => [...current, { stepId: step.id, attempt, result }].slice(-maxHistory))
      if (result.phase !== 'response') {
        setPending({ steps, index })
        setRunning(false)
        busyRef.current = false
        return
      }
    }
    setPending(null)
    setRunning(false)
    busyRef.current = false
  }, [client, history])

  const discover = useCallback(async () => {
    const request = { type: SinkInquiryType.GET_COUNTRY_CODES } as const
    const result = await runSinkInquiry(client, request, { signal: controllerRef.current?.signal })
    setRunning(false)
    busyRef.current = false
    if (result.phase === 'response') {
      try {
        decodeInquiryResponse(result.status, result.rawResponse, result.request)
        const discovered = parseCountryCodesDataBlock(result.rawResponse).countryCodes
        setHistory((current) => [...current, { stepId: 'country-codes', attempt: current.filter(({ stepId }) => stepId === 'country-codes').length + 1, result }].slice(-maxHistory))
        setCodes(discovered)
        setSelected(discovered[0] ?? '')
        setPending(null)
      } catch (error) {
        const malformed: InquiryRunState = { phase: 'transportError', type: request.type, message: error instanceof Error ? error.message : String(error) }
        setHistory((current) => [...current, { stepId: 'country-codes', attempt: current.filter(({ stepId }) => stepId === 'country-codes').length + 1, result: malformed }].slice(-maxHistory))
        setPending({ steps: [{ id: 'country-codes', request }], index: 0 })
      }
    } else {
      setHistory((current) => [...current, { stepId: 'country-codes', attempt: current.filter(({ stepId }) => stepId === 'country-codes').length + 1, result }].slice(-maxHistory))
      setPending({ steps: [{ id: 'country-codes', request }], index: 0 })
    }
  }, [client])

  useEffect(() => {
    const controller = new AbortController()
    controllerRef.current = controller
    queueMicrotask(() => {
      if (!controller.signal.aborted) void discover()
    })
    return () => controller.abort()
  }, [discover])

  const resume = (control: 'retry' | 'continue' | 'stop') => {
    if (!pending) return
    if (control === 'stop') {
      setPending(null)
      return
    }
    if (control === 'retry' && pending.steps[pending.index]?.id === 'country-codes') {
      setRunning(true)
      busyRef.current = true
      void discover()
      return
    }
    void runSteps(pending.steps, pending.index + (control === 'continue' ? 1 : 0))
  }

  const latestResponse = [...history].reverse().find(({ result }) => result.phase === 'response')?.result
  const pendingStepId = pending?.steps[pending.index]?.id
  const pendingAttempts = pendingStepId ? history.filter(({ stepId }) => stepId === pendingStepId).length : 0
  const startCountrySteps = (selectedCode?: string) => {
    try {
      const body = new Uint8Array([codes.length, 0, ...codes.flatMap((code) => [code.charCodeAt(0), code.charCodeAt(1)])])
      void runSteps(buildCountryInfoSteps(body, selectedCode), 0)
    } catch (error) {
      const request = { type: SinkInquiryType.GET_COUNTRY_CODES } as const
      const malformed: InquiryRunState = { phase: 'transportError', type: request.type, message: error instanceof Error ? error.message : String(error) }
      setHistory((current) => [...current, { stepId: 'country-codes', attempt: current.filter(({ stepId }) => stepId === 'country-codes').length + 1, result: malformed }].slice(-maxHistory))
      setPending({ steps: [{ id: 'country-codes', request }], index: 0 })
    }
  }
  return <>
    {codes.length > 0 && !running && !pending ? <>
      <label>Country <select aria-label="Country" value={selected} onChange={(event) => setSelected(event.target.value)}>{codes.map((code) => <option key={code}>{code}</option>)}</select></label>
      <DialogButton disabled={running} onClick={() => startCountrySteps(selected)}>Get selected country</DialogButton>
      <DialogButton disabled={running} onClick={() => startCountrySteps()}>Get all countries</DialogButton>
    </> : null}
    {running ? <div role="status" aria-live="polite">Fetching country information…</div> : null}
    {pending ? <div role="alert">
      <p>Step {pending.steps[pending.index]?.id} did not return a response.</p>
      <DialogButton disabled={pendingAttempts > maxRetries} onClick={() => resume('retry')}>Retry</DialogButton>
      <DialogButton onClick={() => resume('continue')}>Continue</DialogButton>
      <DialogButton onClick={() => resume('stop')}>Stop</DialogButton>
    </div> : null}
    <h3>Inquiry history</h3>
    <ol>{history.map((entry, index) => <li key={`${entry.stepId}-${entry.attempt}-${index}`}>{entry.stepId} · attempt {entry.attempt} · {entry.result.phase}</li>)}</ol>
    {latestResponse?.phase === 'response' ? <p>Latest raw response body: <code>{bytesToHex(latestResponse.rawResponse)}</code></p> : null}
    <p>Full packet decoding remains available in Message Log.</p>
  </>
}

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
  const [submitted, setSubmitted] = useState<{ definitionId: string; request: SinkInquiryRequest } | null>(null)
  const [target, setTarget] = useState('PORT')
  const [batteryReference, setBatteryReference] = useState('0')
  const [countryCode, setCountryCode] = useState('')
  const confirmed = definition?.confirmation == null || approvedDefinitionId === definition.id
  const request = useMemo(() => definition?.workflow === 'immediate'
    ? definition.buildRequest({})
    : submitted && submitted.definitionId === definition?.id ? submitted.request : null,
  [definition, submitted])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setApprovedDefinitionId(null)
    onOpenChange(nextOpen)
  }

  useEffect(() => {
    if (!open || !definition || !client || !confirmed || !request) return
    const controller = new AbortController()
    void runSinkInquiry(client, request, {
      signal: controller.signal,
      onStateChange: setState,
    }).then((result) => {
      if (result.phase === 'response' && !controller.signal.aborted) void onResponse?.(definition)
    })
    return () => controller.abort()
  }, [client, confirmed, definition, onResponse, open, request])

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
    try { return decodeInquiryResponse(state.status, state.rawResponse, state.request) }
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
      {definition?.type === SinkInquiryType.GET_COUNTRY_INFO && client
        ? <CountryInformationWorkflow client={client} />
        : <>
      {definition && definition.workflow !== 'immediate' && !request ? (
        <form onSubmit={(event) => {
          event.preventDefault()
          const values = definition.type === SinkInquiryType.GET_MANUFACTURER_INFO
            ? { target, batteryReference: Number(batteryReference) }
            : { countryCode }
          const validation = validateInquiryParameters(definition as InquiryDefinition<Record<string, unknown>>, values)
          if (!validation.valid) return
          setSubmitted({
            definitionId: definition.id,
            request: (definition as InquiryDefinition<Record<string, unknown>>).buildRequest(values),
          })
        }}>
          {definition.type === SinkInquiryType.GET_MANUFACTURER_INFO ? <>
            <label>Target <select value={target} onChange={(event) => setTarget(event.target.value)}><option>PORT</option><option>BATTERY</option></select></label>
            {target === 'BATTERY' ? <label>Battery reference <input type="number" min="0" max="7" value={batteryReference} onChange={(event) => setBatteryReference(event.target.value)} /></label> : null}
          </> : <label>Country code <input aria-label="Country code" maxLength={2} value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} /></label>}
          <DialogButton variant="primary" type="submit">{definition.type === SinkInquiryType.GET_COUNTRY_INFO ? 'Send selected country' : 'Send inquiry'}</DialogButton>
        </form>
      ) : null}
      {definition?.workflow !== 'immediate' && !request ? null : <>
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
      </>}
      </>}
    </Dialog>
  )
}
