/**
 * Read-only Cable Test fly-out for a cached IDENTITY snapshot. Live sessions use
 * CableTestDialog; Retest hands control back to the parent to open that modal.
 */
import { useMemo } from 'react'
import type { CableTestResult } from '../../../lib/device'
import {
  buildDiscoverIdentityMetadata, parseDiscoverIdentityVDOs, readDataObjects,
} from '../../../lib/device/drpd/usb-pd/DataObjects'
import type { HumanReadableField } from '../../../lib/device/drpd/usb-pd/humanReadableField'
import styles from './CableTestPanel.module.css'

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

/** Explain the reported signalling class without implying measured throughput. */
const cableSpeedDescription = (raw: string, fallback: string): string => {
  const speeds: Record<string, string> = {
    '0b000': 'USB 2.0 — up to 480 Mbit/s',
    '0b001': 'USB 3.2 Gen1 — 5 Gbit/s per lane (up to 10 Gbit/s with two lanes)',
    '0b010': 'USB 3.2/USB4 Gen2 — 10 Gbit/s per lane (up to 20 Gbit/s with two lanes)',
    '0b011': 'USB4 Gen3 — up to 40 Gbit/s with two lanes',
    '0b100': 'USB4 Gen4 — up to 80 Gbit/s with two lanes',
  }
  return speeds[raw] ?? `${fallback} (speed unknown)`
}

/** Translate protocol containers into the information users are looking for. */
const identitySectionTitle = (title: string): string | null => {
  const titles: Record<string, string> = {
    'ID Header VDO': 'General Information',
    'Passive Cable VDO': 'Cable Information',
    'Active Cable VDO1': 'Cable Information',
    'Active Cable VDO2': 'Active Cable Features',
    'VPD VDO': 'Charge-Through Device Information',
  }
  return titles[title] ?? null
}

/** Use familiar labels while preserving the decoder's field explanations. */
const cableFieldLabel = (label: string): string => {
  const labels: Record<string, string> = {
    'SOP Product Type (UFP/Cable)': 'Cable Type',
    'SOP Product Type (DFP)': 'Host Product Type',
    'VBUS Current Handling Capability': 'Maximum Current',
    'Maximum VBUS Voltage': 'Maximum Voltage',
    'EPR Capable': 'EPR Support',
    'USB Highest Speed': 'Maximum USB Speed',
    'VBUS Through Cable': 'Power Pass-Through',
    'Cable Termination Type': 'VCONN Requirements',
    'SBU Supported': 'Sideband Support',
    'SBU Type': 'Sideband Type',
    'SOP" Controller Present': 'Far-End Controller',
    'VDO Version': 'Data Format Version',
    'USB4 Supported': 'USB4 Support',
    'USB 3.2 Supported': 'USB 3.2 Support',
    'USB 2.0 Supported': 'USB 2.0 Support',
    'USB Lanes Supported': 'Lane Count',
    'USB4 Asymmetric Mode Supported': 'Asymmetric Mode Support',
    'Physical Connection': 'Copper/Optical Connection',
    'Active Element': 'Retimer/Redriver',
    'Optically Isolated Active Cable': 'Optical Isolation',
    'U3/CLd Power': 'Power Consumption',
    'U3 to U0 Transition Mode': 'Power-State Behaviour',
    'USB 2.0 Hub Hops Consumed': 'Hub Hops',
  }
  return labels[label] ?? label
}

/** Rank charging and data capabilities ahead of implementation details. */
const cableRowPriority = (title: string, label: string): number => {
  const order: Record<string, string[]> = {
    'General Information': ['Cable Type', 'Connector Type', 'USB Vendor ID', 'Modal Operation Supported', 'USB Host Capable', 'USB Device Capable', 'Host Product Type'],
    'Cable Information': ['Maximum Current', 'Maximum Voltage', 'EPR Support', 'Maximum USB Speed', 'Plug Type', 'Cable Latency', 'Power Pass-Through', 'VCONN Requirements', 'Sideband Support', 'Sideband Type', 'Far-End Controller', 'Hardware Version', 'Firmware Version', 'Data Format Version'],
    'Active Cable Features': ['USB4 Support', 'USB 3.2 Support', 'USB 2.0 Support', 'USB Generation', 'Lane Count', 'Asymmetric Mode Support', 'Copper/Optical Connection', 'Retimer/Redriver', 'Optical Isolation', 'Power Consumption', 'Maximum Operating Temperature', 'Shutdown Temperature', 'Power-State Behaviour', 'Hub Hops'],
  }
  const rank = order[title]?.indexOf(label) ?? -1
  return rank < 0 ? Number.MAX_SAFE_INTEGER : rank
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

/** Report an e-marker only when its identity or PD response confirms it. */
const cableTestMessage = (result: CableTestResult | null): { headline: string; instruction?: string } =>
  result?.outcome === 'IDENTITY' || result?.goodCRC
    ? { headline: 'E-marked cable detected.' }
    : { headline: 'No cable detected, damaged cable, or cable without an e-marker.', instruction: 'Ensure that the cable is not connected to any device and plug it into Port 1.' }

/** Build identity sections for the narrow fly-out table. */
const buildIdentitySections = (result: CableTestResult | null): IdentityTableSection[] => {
  if (result?.outcome !== 'IDENTITY') {
    return [
      { title: 'General Information', rows: ['Cable Type', 'Connector Type', 'USB Vendor ID'].map((label) => ({ label, raw: '', result: '', help: '' })) },
      { title: 'Cable Information', rows: ['Maximum Current', 'Maximum Voltage', 'EPR Support', 'Maximum USB Speed'].map((label) => ({ label, raw: '', result: '', help: '' })) },
    ]
  }
  const vdos = readDataObjects(result.body, 4, result.body.length / 4 - 1)
  const decoded = metadataRows(buildDiscoverIdentityMetadata(parseDiscoverIdentityVDOs(vdos, 'SOP_PRIME')))
  const grouped = new Map<string, IdentityTableRow[]>()
  for (const row of decoded) {
    const path = row.label.replace('Discover Identity VDOs / ', '').replace('Product Type VDOs / ', '').split(' / ')
    const label = path.pop() ?? row.label
    const title = identitySectionTitle(path.join(' / '))
    if (!title || label === 'Raw Value') continue
    const fields = grouped.get(title) ?? []
    const value = tableValue(label, row.value)
    if (label === 'USB Highest Speed') value.result = cableSpeedDescription(value.raw, value.result)
    fields.push({
      label: cableFieldLabel(label),
      ...value,
      result: value.result || value.raw,
      help: label === 'USB Highest Speed'
        ? `${row.help} Maximum signalling rate, not measured throughput. Actual speed depends on the connected devices, protocol, and lane count.`
        : row.help,
    })
    grouped.set(title, fields)
  }
  return Array.from(grouped, ([title, rows]) => ({
    title,
    rows: rows.sort((a, b) => cableRowPriority(title, a.label) - cableRowPriority(title, b.label)),
  }))
}

/** Show a cached identity-only Cable Test fly-out for one connected Dr. PD. */
export const CableTestPanel = ({
  initialResult = null,
  onClose,
  onRetest,
}: {
  initialResult?: CableTestResult | null
  onClose: () => void
  onRetest?: () => void
}) => {
  const sections = useMemo(() => buildIdentitySections(initialResult ?? null), [initialResult])
  const message = cableTestMessage(initialResult ?? null)

  return (
    <aside className={styles.panel} aria-label="Cable Test, Port 1" data-testid="cable-test-panel" data-mode="cached">
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <h2 className={styles.title}>Cable Test</h2>
          <p className={styles.subtitle}>Port 1</p>
        </div>
        <button type="button" className={styles.actionButton} onClick={onClose}>
          Close
        </button>
      </div>
      <div className={styles.body}>
        <p
          role="status"
          className={styles.statusPanel}
          data-state={message.instruction ? 'waiting' : 'detected'}
        >
          <strong className={styles.statusHeadline}>{message.headline}</strong>
          {message.instruction ? ` ${message.instruction}` : null}
        </p>
        <table className={styles.fields} aria-label="Cable identity">
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          {sections.map((section) => (
            <tbody key={section.title}>
              <tr className={styles.section}>
                <th colSpan={2} scope="colgroup">{section.title}</th>
              </tr>
              {section.rows.map((row, index) => (
                <tr key={`${row.label}-${index}`} title={row.help}>
                  <th scope="row">{row.label}</th>
                  <td aria-label={!row.raw && !row.result ? `${row.label} blank` : undefined}>{row.result}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <div className={styles.footer}>
        {onRetest ? (
          <button type="button" className={`${styles.actionButton} ${styles.actionButtonPrimary}`} onClick={onRetest}>
            Retest
          </button>
        ) : null}
        <button type="button" className={styles.actionButton} onClick={onClose}>
          Close
        </button>
      </div>
    </aside>
  )
}
