import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogButton, DialogForm, DialogFormRow } from '../../../../ui/overlays'
import { validateInquiryParameters, type InquiryDefinition } from '../../inquiries/catalog'
import { SinkInquiryType, type LoggedEventDataSection, type SinkInquiryCablePlug, type SinkInquiryRequest } from '../../../../lib/device'
import { parseCountryCodesDataBlock } from '../../../../lib/device/drpd/usb-pd/DataObjects'
import { buildCountryInfoSteps } from '../../inquiries/countryWorkflow'
import { buildDiscoverModesSteps, canRetryVdmSurveyStep, deduplicateOrderedSvids, parseDiscoverSvidPage } from '../../inquiries/vdmWorkflow'
import { formatSinkInquiryOutcome } from '../../inquiries/presentation'
import { decodeInquiryResponse } from '../../inquiries/decode'
import {
  runSinkInquiry,
  withSinkInquiryLease,
  type InquiryRunState,
  type InquiryHistoryEntry,
  type SerialInquiryWorkflowStep,
  type SinkInquiryClient,
} from '../../inquiries/runner'
import {
  BATTERY_MANUFACTURER_IDENTITY_EVENT_TITLE,
  surveyBatteryManufacturerIdentity,
} from '../../inquiries/manufacturerWorkflow'
import { runSingleInquiryEvent, type InquiryEventResult } from '../../inquiries/inquiryEvent'
import styles from './SourceInquiryDialog.module.css'

const bytesToHex = (bytes: Uint8Array): string => (
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ')
)

const requestCablePlug = (request: SinkInquiryRequest): SinkInquiryCablePlug | undefined =>
  'plug' in request ? request.plug : undefined

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
    let failed = false
    await withSinkInquiryLease(client, async (run) => { for (let index = startIndex; index < steps.length; index += 1) {
      const step = steps[index]
      const attempt = history.filter(({ stepId }) => stepId === step.id).length + 1
      let result = await run(step.request, { signal: controllerRef.current?.signal })
      if (result.phase === 'response') {
        try { decodeInquiryResponse(result.status, result.rawResponse, result.request) }
        catch (error) { result = { phase: 'transportError', type: step.request.type, message: error instanceof Error ? error.message : String(error) } }
      }
      setHistory((current) => [...current, { stepId: step.id, attempt, result }].slice(-maxHistory))
      if (result.phase !== 'response') {
        failed = true
        setPending({ steps, index })
        setRunning(false)
        busyRef.current = false
        return
      }
    } })
    if (failed) return
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
    <ol>{history.map((entry, index) => <li key={`${entry.stepId}-${entry.attempt}-${index}`}>{entry.stepId} · attempt {entry.attempt} · {entry.result.phase}{entry.result.phase === 'terminal' && entry.result.rawResponse ? ` · ${bytesToHex(entry.result.rawResponse)}` : ''}</li>)}</ol>
    {latestResponse?.phase === 'response' ? <p>Latest raw response body: <code>{bytesToHex(latestResponse.rawResponse)}</code></p> : null}
    <p>Full packet decoding remains available in Message Log.</p>
  </>
}

type VdmSurveyPending =
  | { kind: 'discovery'; phase: 'identity' | 'svids'; pages: number[][]; pageIndex: number; nonRetryable?: boolean }
  | { kind: 'modes'; steps: SerialInquiryWorkflowStep[]; index: number }

const PortPartnerSurveyWorkflow = ({ client, plug }: { client: SinkInquiryClient; plug?: SinkInquiryCablePlug }) => {
  const [history, setHistory] = useState<InquiryHistoryEntry[]>([])
  const [svids, setSvids] = useState<number[] | null>(null)
  const [selected, setSelected] = useState('')
  const [running, setRunning] = useState(true)
  const [pending, setPending] = useState<VdmSurveyPending | null>(null)
  const [workflowError, setWorkflowError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const busyRef = useRef(true)
  const maxRetries = 2
  const appendAttempt = useCallback((stepId: string, result: InquiryRunState) => setHistory((current) => [
    ...current,
    { stepId, attempt: current.filter((entry) => entry.stepId === stepId).length + 1, result },
  ].slice(-64)), [])

  const discover = useCallback(async (startAtSvids = false, initialPages: number[][] = [], pageStart = 0) => {
    if (!busyRef.current) busyRef.current = true
    setRunning(true)
    setWorkflowError(null)
    let failed: VdmSurveyPending | null = null
    const completedSvids: { value: number[] | null } = { value: null }
    await withSinkInquiryLease(client, async (run) => {
      if (!startAtSvids) {
        const request: SinkInquiryRequest = { type: SinkInquiryType.DISCOVER_IDENTITY, ...(plug ? { plug } : {}) }
        let result = await run(request, { signal: controllerRef.current?.signal })
        if (result.phase === 'response') {
          try { decodeInquiryResponse(result.status, result.rawResponse, result.request) }
          catch (error) { result = { phase: 'transportError', type: request.type, message: error instanceof Error ? error.message : String(error) } }
        }
        appendAttempt('discover-identity', result)
        if (result.phase !== 'response') { failed = { kind: 'discovery', phase: 'identity', pages: [], pageIndex: 0 }; return }
      }

      const pages = [...initialPages]
      for (let pageIndex = pageStart; pageIndex < 8; pageIndex += 1) {
        const request: SinkInquiryRequest = { type: SinkInquiryType.DISCOVER_SVIDS, ...(plug ? { plug } : {}) }
        const stepId = `discover-svids-page-${pageIndex + 1}`
        let result = await run(request, { signal: controllerRef.current?.signal })
        let parsed: ReturnType<typeof parseDiscoverSvidPage> | null = null
        if (result.phase === 'response') {
          try {
            decodeInquiryResponse(result.status, result.rawResponse, result.request)
            parsed = parseDiscoverSvidPage(result.rawResponse)
          } catch (error) { result = { phase: 'transportError', type: request.type, message: error instanceof Error ? error.message : String(error) } }
        }
        appendAttempt(stepId, result)
        if (result.phase !== 'response' || !parsed) { failed = { kind: 'discovery', phase: 'svids', pages, pageIndex }; return }
        pages.push(parsed.ordered)
        if (parsed.complete) { completedSvids.value = deduplicateOrderedSvids(pages); return }
      }
      failed = { kind: 'discovery', phase: 'svids', pages, pageIndex: 8, nonRetryable: true }
      setWorkflowError('Discover SVIDs exceeded the eight-page safety bound without a terminator.')
    })
    if (completedSvids.value) {
      setSvids(completedSvids.value)
      setSelected(completedSvids.value[0]?.toString() ?? '')
      setPending(null)
    } else if (failed) setPending(failed)
    setRunning(false)
    busyRef.current = false
  }, [appendAttempt, client, plug])

  const runModes = useCallback(async (steps: SerialInquiryWorkflowStep[], startIndex: number) => {
    if (busyRef.current) return
    busyRef.current = true
    setRunning(true)
    let failed: VdmSurveyPending | null = null
    await withSinkInquiryLease(client, async (run) => {
      for (let index = startIndex; index < steps.length; index += 1) {
        const step = steps[index]
        let result = await run(step.request, { signal: controllerRef.current?.signal })
        if (result.phase === 'response') {
          try { decodeInquiryResponse(result.status, result.rawResponse, result.request) }
          catch (error) { result = { phase: 'transportError', type: step.request.type, message: error instanceof Error ? error.message : String(error) } }
        }
        appendAttempt(step.id, result)
        if (result.phase !== 'response') { failed = { kind: 'modes', steps, index }; return }
      }
    })
    setPending(failed)
    setRunning(false)
    busyRef.current = false
  }, [appendAttempt, client])

  useEffect(() => {
    const controller = new AbortController()
    controllerRef.current = controller
    queueMicrotask(() => { if (!controller.signal.aborted) void discover() })
    return () => controller.abort()
  }, [discover])

  const pendingStepId = pending?.kind === 'modes'
    ? pending.steps[pending.index]?.id
    : pending?.phase === 'identity' ? 'discover-identity' : `discover-svids-page-${(pending?.pageIndex ?? 0) + 1}`
  const attempts = pendingStepId ? history.filter((entry) => entry.stepId === pendingStepId).length : 0
  const resume = (action: 'retry' | 'continue' | 'stop') => {
    if (!pending) return
    if (action === 'stop') { setPending(null); return }
    if (action === 'retry' && pending.kind === 'discovery' && pending.nonRetryable) return
    if (plug && action === 'retry') { setSvids(null); void discover(false, [], 0); return }
    if (pending.kind === 'modes') { void runModes(pending.steps, pending.index + (action === 'continue' ? 1 : 0)); return }
    if (pending.phase === 'identity') { void discover(action === 'continue'); return }
    if (action === 'continue') {
      const discovered = deduplicateOrderedSvids(pending.pages)
      setSvids(discovered); setSelected(discovered[0]?.toString() ?? ''); setPending(null)
    } else void discover(false, [], 0)
  }
  const startModes = (values: number[]) => {
    try { setWorkflowError(null); void runModes(buildDiscoverModesSteps(values, plug), 0) }
    catch (error) { setWorkflowError(error instanceof Error ? error.message : String(error)) }
  }

  return <>
    {svids !== null && !running && !pending ? <>
      <p>{svids.length > 0 ? `Discovered SVIDs: ${svids.map((value) => `0x${value.toString(16).toUpperCase().padStart(4, '0')}`).join(', ')}` : 'No SVIDs were discovered.'}</p>
      {svids.length > 0 ? <>
        <label>SVID <select aria-label="Discovered SVID" value={selected} onChange={(event) => setSelected(event.target.value)}>{svids.map((value) => <option key={value} value={value}>{`0x${value.toString(16).toUpperCase().padStart(4, '0')}`}</option>)}</select></label>
        <DialogButton onClick={() => startModes([Number(selected)])}>Discover selected SVID modes</DialogButton>
        <DialogButton onClick={() => startModes(svids)}>Discover all SVID modes</DialogButton>
      </> : null}
    </> : null}
    {running ? <div role="status">Discovering {plug ?? 'Port Partner'} identity, SVIDs, or modes…</div> : null}
    {pending ? <div role="alert"><p>Step {pendingStepId} did not return a usable response.</p>
      <DialogButton disabled={!canRetryVdmSurveyStep(attempts, pending.kind === 'discovery' && pending.nonRetryable === true, maxRetries)} onClick={() => resume('retry')}>Retry</DialogButton>
      <DialogButton onClick={() => resume('continue')}>Continue</DialogButton>
      <DialogButton onClick={() => resume('stop')}>Stop</DialogButton>
    </div> : null}
    {workflowError ? <p role="alert">{workflowError}</p> : null}
    <h3>Inquiry history</h3>
    <ol>{history.map((entry, index) => <li key={`${entry.stepId}-${entry.attempt}-${index}`}>{entry.stepId} · attempt {entry.attempt} · {entry.result.phase}{entry.result.phase === 'terminal' && entry.result.rawResponse ? ` · ${bytesToHex(entry.result.rawResponse)}` : ''}</li>)}</ol>
    <p>Full packet decoding remains available in Message Log.</p>
  </>
}

export const SourceInquiryDialog = ({
  open,
  onOpenChange,
  definition,
  client,
  onResponse,
  logOnly = false,
  publishLogEvent,
  executeInquiryEvent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  definition: InquiryDefinition | null
  client: SinkInquiryClient | null
  onResponse?: (definition: InquiryDefinition) => void | Promise<void>
  logOnly?: boolean
  publishLogEvent?: (title: string, summary: string, eventData?: LoggedEventDataSection[]) => Promise<void>
  executeInquiryEvent?: (request: SinkInquiryRequest) => Promise<InquiryEventResult>
}) => {
  const [state, setState] = useState<InquiryRunState>({ phase: 'idle' })
  const [approvedDefinitionId, setApprovedDefinitionId] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<{ definitionId: string; request: SinkInquiryRequest } | null>(null)
  const [target, setTarget] = useState('PORT')
  const [batteryReference, setBatteryReference] = useState('0')
  const [countryCode, setCountryCode] = useState('')
  const [svid, setSvid] = useState('65280')
  const [manufacturerWorkflowRunning, setManufacturerWorkflowRunning] = useState(false)
  const [manufacturerWorkflowProgress, setManufacturerWorkflowProgress] = useState<string | null>(null)
  const confirmed = definition?.confirmation == null || approvedDefinitionId === definition.id
  const request = useMemo(() => definition?.workflow === 'immediate'
    ? definition.buildRequest({})
    : submitted && submitted.definitionId === definition?.id ? submitted.request : null,
  [definition, submitted])
  const manufacturerParameterForm = definition?.type === SinkInquiryType.GET_MANUFACTURER_INFO &&
    definition.workflow !== 'immediate' && !request

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setApprovedDefinitionId(null)
      setManufacturerWorkflowProgress(null)
    }
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
      description={definition?.type === SinkInquiryType.GET_MANUFACTURER_INFO
        ? undefined
        : definition?.description}
      dialogStyle={{ width: definition?.type === SinkInquiryType.GET_MANUFACTURER_INFO
        ? 'min(320px, calc(100vw - var(--space-32)))'
        : 'min(520px, calc(100vw - var(--space-32)))' }}
      footer={definition?.confirmation && !confirmed ? (
        <>
          <DialogButton onClick={() => handleOpenChange(false)}>Cancel</DialogButton>
          <DialogButton variant="primary" onClick={() => setApprovedDefinitionId(definition.id)}>
            {definition.confirmation.confirmLabel}
          </DialogButton>
        </>
      ) : manufacturerParameterForm ? (
        <>
          <DialogButton
            disabled={manufacturerWorkflowRunning}
            onClick={() => handleOpenChange(false)}
          >Cancel</DialogButton>
          <DialogButton
            variant="primary"
            type="submit"
            form="manufacturer-info-form"
            disabled={manufacturerWorkflowRunning}
          >Send inquiry</DialogButton>
        </>
      ) : <DialogButton onClick={() => handleOpenChange(false)}>Close</DialogButton>}
      >
        {definition?.confirmation && !confirmed ? <p role="alert">{definition.confirmation.body}</p> : null}
        {definition?.confirmation && !confirmed ? null : <>
      {definition?.type === SinkInquiryType.GET_MANUFACTURER_INFO
        ? <p className={styles.manufacturerDescription}>{definition.description}</p>
        : null}
      {definition?.id.startsWith('survey-cable-') && client
          ? <PortPartnerSurveyWorkflow client={client} plug={requestCablePlug(definition.buildRequest({}))} />
        : definition?.type === SinkInquiryType.GET_COUNTRY_INFO && client
          ? <CountryInformationWorkflow client={client} />
        : <>
      {definition && definition.workflow !== 'immediate' && !request ? (
        <form className={definition.type === SinkInquiryType.GET_MANUFACTURER_INFO
          ? styles.manufacturerForm
          : undefined} id={definition.type === SinkInquiryType.GET_MANUFACTURER_INFO
          ? 'manufacturer-info-form'
          : undefined} onSubmit={(event) => {
          event.preventDefault()
          const values = definition.type === SinkInquiryType.GET_MANUFACTURER_INFO
            ? { target, batteryReference: Number(batteryReference) }
            : definition.type === SinkInquiryType.GET_BATTERY_CAP || definition.type === SinkInquiryType.GET_BATTERY_STATUS
              ? { batteryReference: Number(batteryReference) }
            : definition.type === SinkInquiryType.DISCOVER_MODES
              ? { svid: Number(svid) }
            : { countryCode }
          const validation = validateInquiryParameters(definition as InquiryDefinition<Record<string, unknown>>, values)
          if (!validation.valid) return
          const nextRequest = (definition as InquiryDefinition<Record<string, unknown>>)
            .buildRequest(values)
          if (logOnly && client) {
            if (definition.type === SinkInquiryType.GET_MANUFACTURER_INFO && target === 'BATTERY') {
              setManufacturerWorkflowRunning(true)
              setManufacturerWorkflowProgress('Discovering available batteries…')
              void surveyBatteryManufacturerIdentity(client, setManufacturerWorkflowProgress)
                .then(async ({ summary, eventData }) => {
                  await publishLogEvent?.(BATTERY_MANUFACTURER_IDENTITY_EVENT_TITLE, summary, eventData)
                  handleOpenChange(false)
                })
                .catch((error) => setState({
                  phase: 'transportError',
                  type: SinkInquiryType.GET_MANUFACTURER_INFO,
                  message: error instanceof Error ? error.message : String(error),
                }))
                .finally(() => setManufacturerWorkflowRunning(false))
              return
            }
            setState({ phase: 'sending', type: nextRequest.type })
            void (executeInquiryEvent?.(nextRequest) ?? runSingleInquiryEvent(client, nextRequest))
              .then(async ({ title, summary, eventData }) => {
                await publishLogEvent?.(title, summary, eventData)
                handleOpenChange(false)
              })
              .catch((error) => setState({
                phase: 'transportError',
                type: nextRequest.type,
                message: error instanceof Error ? error.message : String(error),
              }))
            return
          }
          setSubmitted({ definitionId: definition.id, request: nextRequest })
          }}>
            {definition.type === SinkInquiryType.GET_MANUFACTURER_INFO ? <>
              <DialogForm>
                <DialogFormRow
                  className={styles.manufacturerTargetRow}
                  label="Target"
                  htmlFor="manufacturer-info-target"
                >
                  <select
                    id="manufacturer-info-target"
                    className={styles.manufacturerTargetSelect}
                    value={target}
                    disabled={manufacturerWorkflowRunning}
                    onChange={(event) => setTarget(event.target.value)}
                  >
                    <option>PORT</option>
                    <option>BATTERY</option>
                  </select>
                </DialogFormRow>
              </DialogForm>
            </> : definition.type === SinkInquiryType.GET_BATTERY_CAP || definition.type === SinkInquiryType.GET_BATTERY_STATUS
            ? <label>Battery reference <input aria-label="Battery reference" type="number" min="0" max="7" value={batteryReference} onChange={(event) => setBatteryReference(event.target.value)} /></label>
            : definition.type === SinkInquiryType.DISCOVER_MODES
              ? <label>SVID <input aria-label="SVID" type="number" min="1" max="65535" value={svid} onChange={(event) => setSvid(event.target.value)} /></label>
            : <label>Country code <input aria-label="Country code" maxLength={2} value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} /></label>}
          {definition.type === SinkInquiryType.GET_MANUFACTURER_INFO ? null :
            <DialogButton variant="primary" type="submit">{definition.type === SinkInquiryType.GET_COUNTRY_INFO ? 'Send selected country' : 'Send inquiry'}</DialogButton>}
          {manufacturerWorkflowProgress ? <p role="status">{manufacturerWorkflowProgress}</p> : null}
          {state.phase === 'transportError' ? <p role="alert">Communication error: {state.message}</p> : null}
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
      {state.phase === 'terminal' && state.rawResponse ? <p>Raw terminal response body: <code>{bytesToHex(state.rawResponse)}</code></p> : null}
      <p>Full packet decoding remains available in Message Log.</p>
      </>}
      </>}
      </>}
    </Dialog>
  )
}
