import { type CSSProperties, useEffect, useState } from 'react'
import {
  buildCapturedLogSelectionKey,
  decodeLoggedCapturedMessage,
  DRPDDevice,
  type DRPDLogSelectionState,
  type LoggedCapturedMessage,
} from '../../../lib/device'
import type {
  HumanReadableField,
  HumanReadableMetadataRoot,
  HumanReadableTableCell,
} from '../../../lib/device/drpd/usb-pd/humanReadableField'
import type { RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import type { RackDeviceState } from '../RackRenderer'
import styles from './DrpdMessageDetailInstrumentView.module.css'

const EMPTY_SELECTION: DRPDLogSelectionState = {
  selectedKeys: [],
  anchorIndex: null,
  activeIndex: null,
}

type MessageDetailSection = {
  id: keyof HumanReadableMetadataRoot
  label: string
  field: HumanReadableField<'OrderedDictionary'>
}

const normalizeSelectionState = (value: unknown): DRPDLogSelectionState => {
  if (!value || typeof value !== 'object') {
    return EMPTY_SELECTION
  }
  const probe = value as Partial<DRPDLogSelectionState>
  return {
    selectedKeys: Array.isArray(probe.selectedKeys)
      ? probe.selectedKeys.filter((entry): entry is string => typeof entry === 'string')
      : [],
    anchorIndex:
      typeof probe.anchorIndex === 'number' && Number.isFinite(probe.anchorIndex)
        ? Math.max(0, Math.floor(probe.anchorIndex))
        : null,
    activeIndex:
      typeof probe.activeIndex === 'number' && Number.isFinite(probe.activeIndex)
        ? Math.max(0, Math.floor(probe.activeIndex))
        : null,
  }
}

const buildMetadataSections = (
  metadata: HumanReadableMetadataRoot,
): MessageDetailSection[] => {
  return [
    { id: 'baseInformation', label: metadata.baseInformation.Label, field: metadata.baseInformation },
    { id: 'technicalData', label: metadata.technicalData.Label, field: metadata.technicalData },
    { id: 'headerData', label: metadata.headerData.Label, field: metadata.headerData },
    {
      id: 'messageSpecificData',
      label: metadata.messageSpecificData.Label,
      field: metadata.messageSpecificData,
    },
  ]
}

const parseMessageSelectionKey = (
  selectionKey: string,
): { startTimestampUs: bigint } | null => {
  const match = /^message:(\d+):(\d+):(\d+)$/.exec(selectionKey)
  if (!match) {
    return null
  }
  const [, startTimestampUs] = match
  return {
    startTimestampUs: BigInt(startTimestampUs),
  }
}

const findSelectedMessageRow = (
  rows: LoggedCapturedMessage[],
  selectionKey: string,
): LoggedCapturedMessage | null => {
  return (
    rows.find(
      (row) =>
        row.entryKind === 'message' &&
        buildCapturedLogSelectionKey(row) === selectionKey,
    ) ?? null
  )
}

const formatByteDataSummary = (field: HumanReadableField<'ByteData'>): string => {
  const hex = Array.from(field.value.data, (value) => value.toString(16).padStart(2, '0')).join(' ')
  return hex.length > 0 ? hex.toUpperCase() : '--'
}

const isStringField = (field: HumanReadableField): field is HumanReadableField<'String'> => {
  return field.type === 'String'
}

const isByteDataField = (field: HumanReadableField): field is HumanReadableField<'ByteData'> => {
  return field.type === 'ByteData'
}

const isOrderedDictionaryField = (
  field: HumanReadableField,
): field is HumanReadableField<'OrderedDictionary'> => {
  return field.type === 'OrderedDictionary'
}

const isTableField = (field: HumanReadableField): field is HumanReadableField<'Table'> => {
  return field.type === 'Table'
}

const groupTableCellsIntoRows = (cells: HumanReadableTableCell[]): HumanReadableTableCell[][] => {
  const rows: HumanReadableTableCell[][] = []
  let currentRow: HumanReadableTableCell[] = []
  cells.forEach((cell) => {
    if (cell.kind === 'header' && currentRow.length > 0) {
      rows.push(currentRow)
      currentRow = [cell]
      return
    }
    currentRow.push(cell)
  })
  if (currentRow.length > 0) {
    rows.push(currentRow)
  }
  return rows
}

const MetadataFieldValue = ({
  field,
  depth,
}: {
  field: HumanReadableField
  depth: number
}) => {
  if (isStringField(field)) {
    return <span className={styles.scalarValue}>{field.value}</span>
  }

  if (isByteDataField(field)) {
    return <span className={styles.byteDataValue}>{formatByteDataSummary(field)}</span>
  }

  if (isOrderedDictionaryField(field)) {
    return (
      <div
        className={styles.nestedContainer}
        style={{ '--detail-indent-depth': `${depth}` } as CSSProperties}
      >
        <MetadataDictionaryTable field={field} depth={depth + 1} />
      </div>
    )
  }

  if (isTableField(field)) {
    return (
      <div
        className={styles.nestedContainer}
        style={{ '--detail-indent-depth': `${depth}` } as CSSProperties}
      >
        <MetadataNestedTable field={field} depth={depth + 1} />
      </div>
    )
  }

  return null
}

const MetadataDictionaryTable = ({
  field,
  depth,
}: {
  field: HumanReadableField<'OrderedDictionary'>
  depth: number
}) => {
  return (
    <table className={styles.metadataTable} data-depth={depth}>
      <tbody className={styles.metadataTableBody}>
        {Array.from(field.entries()).map(([key, entryField]) => (
          <tr className={styles.metadataRow} key={`${key}-${entryField.Label}`}>
            <th className={styles.metadataLabelCell} scope="row">
              <span className={styles.metadataLabelText}>{entryField.Label}</span>
            </th>
            <td className={styles.metadataValueCell}>
              <MetadataFieldValue field={entryField} depth={depth} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const MetadataNestedTable = ({
  field,
  depth,
}: {
  field: HumanReadableField<'Table'>
  depth: number
}) => {
  const rows = groupTableCellsIntoRows(field.value)
  return (
    <table className={styles.nestedTable} data-depth={depth}>
      <tbody className={styles.nestedTableBody}>
        {rows.map((row, rowIndex) => (
          <tr className={styles.nestedTableRow} key={`${field.Label}-${rowIndex}`}>
            {row.map((cell, cellIndex) =>
              cell.kind === 'header' ? (
                <th className={styles.nestedTableHeaderCell} key={`${rowIndex}-${cellIndex}`}>
                  <MetadataFieldValue field={cell.field} depth={depth} />
                </th>
              ) : (
                <td className={styles.nestedTableValueCell} key={`${rowIndex}-${cellIndex}`}>
                  <MetadataFieldValue field={cell.field} depth={depth} />
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Message detail instrument shell.
 */
export const DrpdMessageDetailInstrumentView = ({
  instrument,
  displayName,
  deviceState,
  isEditMode,
  onRemove
}: {
  instrument: RackInstrument
  displayName: string
  deviceState?: RackDeviceState
  isEditMode: boolean
  onRemove?: (instrumentId: string) => void
}) => {
  const driver = deviceState?.drpdDriver
  const [selection, setSelection] = useState<DRPDLogSelectionState>(() => EMPTY_SELECTION)
  const activeSelectionKey = selection.selectedKeys.length === 1 ? selection.selectedKeys[0] : null
  const [loadedSelectionKey, setLoadedSelectionKey] = useState<string | null>(null)
  const [sections, setSections] = useState<MessageDetailSection[]>([])
  const [expandedSectionIds, setExpandedSectionIds] = useState<string[]>([])

  useEffect(() => {
    if (!driver || !('getLogSelectionState' in driver) || typeof driver.getLogSelectionState !== 'function') {
      return
    }

    let cancelled = false

    const syncSelection = async () => {
      const nextSelection = normalizeSelectionState(
        await Promise.resolve(driver.getLogSelectionState()),
      )
      if (!cancelled) {
        setSelection(nextSelection)
      }
    }

    void syncSelection()

    const handleStateUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ changed?: string[] }>).detail
      if (detail?.changed && !detail.changed.includes('logSelection')) {
        return
      }
      void syncSelection()
    }

    driver.addEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
    return () => {
      cancelled = true
      driver.removeEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
    }
  }, [driver])

  useEffect(() => {
    if (
      activeSelectionKey === null ||
      !driver ||
      !('queryCapturedMessages' in driver) ||
      typeof driver.queryCapturedMessages !== 'function'
    ) {
      return
    }

    const parsedSelectionKey = parseMessageSelectionKey(activeSelectionKey)
    if (!parsedSelectionKey) {
      return
    }

    let cancelled = false

    const loadSections = async () => {
      const rows = await Promise.resolve(
        driver.queryCapturedMessages({
          startTimestampUs: parsedSelectionKey.startTimestampUs,
          endTimestampUs: parsedSelectionKey.startTimestampUs,
        }),
      )
      if (cancelled) {
        return
      }
      const row = findSelectedMessageRow(rows, activeSelectionKey)
      if (!row) {
        setLoadedSelectionKey(activeSelectionKey)
        setSections([])
        setExpandedSectionIds([])
        return
      }
      const decoded = decodeLoggedCapturedMessage(row)
      if (decoded.kind !== 'message') {
        setLoadedSelectionKey(activeSelectionKey)
        setSections([])
        setExpandedSectionIds([])
        return
      }
      const nextSections = buildMetadataSections(decoded.message.humanReadableMetadata)
      setLoadedSelectionKey(activeSelectionKey)
      setSections(nextSections)
      setExpandedSectionIds(nextSections.map((section) => section.id))
    }

    void loadSections()

    return () => {
      cancelled = true
    }
  }, [activeSelectionKey, driver])

  const toggleSection = (sectionId: string) => {
    setExpandedSectionIds((current) =>
      current.includes(sectionId)
        ? current.filter((entry) => entry !== sectionId)
        : [...current, sectionId],
    )
  }
  const visibleSections =
    activeSelectionKey !== null && loadedSelectionKey === activeSelectionKey ? sections : []

  return (
    <InstrumentBase
      instrument={instrument}
      displayName={displayName}
      isEditMode={isEditMode}
      onClose={
        onRemove
          ? () => {
              onRemove(instrument.id)
            }
          : undefined
      }
    >
      {activeSelectionKey !== null ? (
        <section className={styles.singleSelectionContainer} aria-label="Selected message details">
          <div className={styles.sectionsContainer}>
            {visibleSections.map((section) => {
              const isExpanded = expandedSectionIds.includes(section.id)
              return (
                <section className={styles.section} key={section.id}>
                  <h3 className={styles.sectionHeading}>
                    <button
                      type="button"
                      className={styles.sectionToggle}
                      aria-expanded={isExpanded}
                      onClick={() => {
                        toggleSection(section.id)
                      }}
                    >
                      <span
                        className={`${styles.sectionArrow} ${isExpanded ? styles.sectionArrowExpanded : ''}`}
                        aria-hidden="true"
                      >
                        ▶
                      </span>
                      <span className={styles.sectionHeadingText}>{section.label}</span>
                    </button>
                  </h3>
                  {isExpanded ? (
                    <div className={styles.sectionContent}>
                      <MetadataDictionaryTable field={section.field} depth={0} />
                    </div>
                  ) : null}
                </section>
              )
            })}
          </div>
        </section>
      ) : (
        <div className={styles.emptyStateContainer}>
          <p className={styles.emptyStateText}>Select a message to inspect.</p>
        </div>
      )}
    </InstrumentBase>
  )
}
