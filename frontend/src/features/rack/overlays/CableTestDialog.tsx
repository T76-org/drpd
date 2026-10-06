/**
 * Identity-only cable test. Firmware owns probing/discovery and a host-loss lease.
 * Session start/stop serialize per device, including React remounts. Every exit
 * requests Disabled; stale responses after exit are discarded.
 */
import { useEffect, useMemo, useState } from 'react'
import { CCBusRole, type CableTestResult } from '../../../lib/device'
import {
  buildDiscoverIdentityMetadata, parseDiscoverIdentityVDOs, readDataObjects,
} from '../../../lib/device/drpd/usb-pd/DataObjects'
import type { HumanReadableField } from '../../../lib/device/drpd/usb-pd/humanReadableField'
import { Dialog, DialogButton } from '../../../ui/overlays'
import styles from './CableTestDialog.module.css'

export interface CableTestClient {
  ccBus: {
    setRole: (role: CCBusRole) => Promise<void>
    getCableTestResult: () => Promise<CableTestResult>
  }
  refreshState: () => Promise<unknown>
}
const sessionQueues = new WeakMap<CableTestClient, Promise<unknown>>()
/** Serialize session operations so old cleanup cannot stop a newly opened test. */
const serialize = <T,>(client: CableTestClient, operation: () => Promise<T>): Promise<T> => {
  const next = (sessionQueues.get(client) ?? Promise.resolve()).catch(() => {}).then(operation)
  sessionQueues.set(client, next.catch(() => {}))
  return next
}
/** Flatten existing identity metadata without dropping any decoded field. */
const metadataRows = (field: HumanReadableField, prefix = ''): { label: string; value: string; help: string }[] => {
  const label = prefix ? `${prefix} / ${field.Label}` : field.Label
  if (field.type === 'OrderedDictionary' && field.value instanceof Map) {
    return Array.from(field.value.values()).flatMap((child) => metadataRows(child, label))
  }
  if (field.type === 'String' && typeof field.value === 'string') {
    return [{ label, value: field.value, help: field.explanation }]
  }
  if (field.type === 'Table' && Array.isArray(field.value)) {
    return field.value.flatMap((cell) => metadataRows(cell.field, label))
  }
  if (field.type === 'ByteData' && typeof field.value === 'object' && field.value && 'data' in field.value) {
    return [{ label, value: Array.from(field.value.data, (byte) => byte.toString(16).padStart(2, '0')).join(' '), help: field.explanation }]
  }
  return []
}
/** Separate wire encodings from the meanings supplied by the identity decoder. */
const tableValue = (label: string, value: string): { raw: string; result: string } => {
  if (label === 'SOP Product Type (UFP/Cable)') {
    const cableType = value.match(/(0b[01]+) \(SOP': ([^)]+)\)/)
    if (cableType) return { raw: cableType[1], result: cableType[2] }
  }
  if (value === 'true' || value === 'false') return { raw: value === 'true' ? '1' : '0', result: value === 'true' ? 'Yes' : 'No' }
  const encoded = value.match(/^(0b[01]+|0x[\da-fA-F]+|\d+) \(([\s\S]*)\)$/)
  if (encoded) return { raw: encoded[1], result: encoded[2] }
  if (/^0x[\da-fA-F]+$/.test(value)) return { raw: value, result: '' }
  if (/^\d+$/.test(value)) return { raw: value, result: value }
  return { raw: '', result: value }
}
interface IdentityTableRow {
  label: string
  raw: string
  result: string
  help: string
}
interface IdentityTableSection {
  title: string
  rows: IdentityTableRow[]
}
/** Explain evidence without claiming that silence proves a missing marker. */
const cableTestMessage = (result: CableTestResult | null): string => {
  switch (result?.outcome) {
    case 'IDENTITY': return 'E-marker identity received. Capabilities below are reported by the cable.'
    case 'DISCOVERING': return 'Cable termination detected. Reading e-marker identity…'
    case 'NO_RESPONSE': return 'Cable termination detected, but e-marker is not responding. Cable damage or insufficient VCONN power is also possible.'
    case 'RESPONSE_TIMEOUT': return 'PD responder detected (GoodCRC), but no identity received.'
    case 'NAK': return 'PD responder declined the identity request.'
    case 'MALFORMED': return 'PD responder returned an invalid cable identity.'
    case 'POWER_FAULT': return 'Cable termination detected, but VCONN did not reach the required voltage.'
    case 'UNSUPPORTED_CONNECTION': return 'Unexpected CC termination. Leave the far end unplugged; cable may be damaged or unsupported.'
    case 'DISABLED': return 'Cable Test stopped. Device is Disabled.'
    default: return 'no cable present or cable damaged'
  }
}
/** Show a continuously updated identity-only test for one connected Dr. PD. */
export const CableTestDialog = ({ client, onClose, onError }: {
  client: CableTestClient
  onClose: () => void
  onError: (message: string) => void
}) => {
  const [result, setResult] = useState<CableTestResult | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    let started = false
    let timer: ReturnType<typeof setTimeout> | undefined
    /** Stop only after this session's start has settled. */
    const stop = () => serialize(client, async () => {
      if (!started) return
      started = false
      await client.ccBus.setRole(CCBusRole.DISABLED)
      await client.refreshState()
    })
    /** Run one bounded poll; schedule the next only after its completion. */
    const poll = async () => {
      try {
        const snapshot = await serialize(client, () => client.ccBus.getCableTestResult())
        if (cancelled) return
        setResult(snapshot)
        if (snapshot.outcome !== 'DISABLED') timer = setTimeout(() => { void poll() }, 250)
      } catch (cause) {
        if (cancelled) return
        setResult(null)
        setError(cause instanceof Error ? cause.message : String(cause))
        void stop().catch((stopError) => onError(String(stopError)))
      }
    }
    void serialize(client, async () => {
      if (cancelled) return
      started = true
      await client.ccBus.setRole(CCBusRole.CABLE_TEST)
      await client.refreshState()
    }).then(() => { if (!cancelled) void poll() }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      void stop().catch((stopError) => onError(String(stopError)))
    })
    return () => {
      cancelled = true
      clearTimeout(timer)
      void stop().catch((cause) => onError(`Could not return device to Disabled: ${String(cause)}`))
    }
  }, [client, onError])

  const sections = useMemo<IdentityTableSection[]>(() => {
    if (result?.outcome !== 'IDENTITY') return [
      { title: 'Identity', rows: ['Vendor ID', 'Product ID', 'Certification XID'].map((label) => ({ label, raw: '', result: '', help: '' })) },
      { title: 'Cable capabilities', rows: ['Cable Type', 'Current Rating', 'Maximum VBUS Voltage', 'USB Highest Speed'].map((label) => ({ label, raw: '', result: '', help: '' })) },
    ]
    const vdos = readDataObjects(result.body, 4, result.body.length / 4 - 1)
    const decoded = metadataRows(buildDiscoverIdentityMetadata(parseDiscoverIdentityVDOs(vdos, 'SOP_PRIME')))
    const grouped = new Map<string, IdentityTableRow[]>()
    for (const row of decoded) {
      const path = row.label.replace('Discover Identity VDOs / ', '').replace('Product Type VDOs / ', '').split(' / ')
      const label = path.pop() ?? row.label
      const title = path.join(' / ') || 'Identity'
      const fields = grouped.get(title) ?? []
      fields.push({ label, ...tableValue(label, row.value), help: row.help })
      grouped.set(title, fields)
    }
    return Array.from(grouped, ([title, rows]) => ({ title, rows }))
  }, [result])
  return <Dialog open title="Cable Test" onOpenChange={(open) => { if (!open) onClose() }}
    dialogStyle={{ width: 'min(54rem, calc(100vw - 2rem))', maxWidth: 'calc(100vw - 2rem)' }}
    description="Plug the cable into Port 1 (DUT). Leave the far end unplugged. Either plug orientation is supported."
    footer={<DialogButton onClick={onClose}>Close</DialogButton>}>
    <div className={styles.body}>
      <p role="status">{error || cableTestMessage(result)}</p>
      {error ? <p>Test stopped. If communication was lost, firmware disables Cable Test when its host lease expires.</p> : null}
      <p className={styles.hint}>An unmarked cable can look identical to an empty port. This test reads e-marker data; it does not measure cable performance.</p>
      <div className={styles.tableScroll}>
        <table className={styles.fields} aria-label="Cable identity">
          <thead><tr><th scope="col">Field</th><th scope="col">Human-readable result</th><th scope="col">Raw value</th></tr></thead>
          {sections.map((section) => <tbody key={section.title}>
            <tr className={styles.section}><th colSpan={3} scope="colgroup">{section.title}</th></tr>
            {section.rows.map((row, index) => <tr key={`${row.label}-${index}`} title={row.help}>
              <th scope="row">{row.label}</th>
              <td aria-label={!row.raw && !row.result ? `${row.label} blank` : undefined}>{row.result}</td>
              <td className={styles.raw}>{row.raw}</td>
            </tr>)}
          </tbody>)}
        </table>
      </div>
      {result?.vconnContact ? <p>VCONN contact: CC{result.vconnContact}. Communication: CC{result.vconnContact === 1 ? 2 : 1}. GoodCRC: {result.goodCRC ? 'received' : 'not received'}.</p> : null}
      {result?.outcome === 'IDENTITY' ? <details><summary>Raw identity response (SOP′, PD {result.revision === 1 ? '2.0' : '3.x'})</summary>
        <code>{Array.from(result.body, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')}</code>
      </details> : null}
    </div>
  </Dialog>
}
