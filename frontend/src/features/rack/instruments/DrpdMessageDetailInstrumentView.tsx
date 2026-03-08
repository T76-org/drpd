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

const buildCollapsedSectionsStorageKey = (instrumentId: string): string => {
  return `drpd:message-detail:collapsed-sections:${instrumentId}`
}

const readStoredCollapsedSectionIds = (instrumentId: string): string[] | null => {
  if (typeof window === 'undefined') {
    return null
  }
  const rawValue = window.localStorage.getItem(buildCollapsedSectionsStorageKey(instrumentId))
  if (!rawValue) {
    return null
  }
  try {
    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) {
      return null
    }
    return parsed.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    return null
  }
}

const writeStoredCollapsedSectionIds = (instrumentId: string, sectionIds: string[]): void => {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(
    buildCollapsedSectionsStorageKey(instrumentId),
    JSON.stringify(sectionIds),
  )
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
}: {
  field: HumanReadableField
}) => {
  if (isStringField(field)) {
    return <span className={styles.scalarValue}>{field.value}</span>
  }

  if (isByteDataField(field)) {
    return <span className={styles.byteDataValue}>{formatByteDataSummary(field)}</span>
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
        {Array.from(field.entries()).map(([key, entryField]) =>
          isOrderedDictionaryField(entryField) || isTableField(entryField) ? (
            <tr className={styles.metadataCompositeRow} key={`${key}-${entryField.Label}`}>
              <td className={styles.metadataCompositeCell} colSpan={2}>
                <div className={styles.metadataCompositeLabel}>{entryField.Label}</div>
                <div
                  className={styles.nestedContainer}
                  style={{ '--detail-indent-depth': `${depth}` } as CSSProperties}
                >
                  {isOrderedDictionaryField(entryField) ? (
                    <MetadataDictionaryTable field={entryField} depth={depth + 1} />
                  ) : (
                    <MetadataNestedTable field={entryField} depth={depth + 1} />
                  )}
                </div>
              </td>
            </tr>
          ) : (
            <tr className={styles.metadataRow} key={`${key}-${entryField.Label}`}>
              <th className={styles.metadataLabelCell} scope="row">
                <span className={styles.metadataLabelText}>{entryField.Label}</span>
              </th>
              <td className={styles.metadataValueCell}>
                <MetadataFieldValue field={entryField} />
              </td>
            </tr>
          ),
        )}
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
                  <MetadataFieldValue field={cell.field} />
                </th>
              ) : (
                <td className={styles.nestedTableValueCell} key={`${rowIndex}-${cellIndex}`}>
                  <MetadataFieldValue field={cell.field} />
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
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<(keyof HumanReadableMetadataRoot)[]>(
    () => (readStoredCollapsedSectionIds(instrument.id) ?? []) as (keyof HumanReadableMetadataRoot)[],
  )

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
        return
      }
      const decoded = decodeLoggedCapturedMessage(row)
      if (decoded.kind !== 'message') {
        setLoadedSelectionKey(activeSelectionKey)
        setSections([])
        return
      }
      const nextSections = buildMetadataSections(decoded.message.humanReadableMetadata)
      setLoadedSelectionKey(activeSelectionKey)
      setSections(nextSections)
      setCollapsedSectionIds((current) => {
        const nextIds = nextSections.map((section) => section.id)
        return current.filter((sectionId) => nextIds.includes(sectionId))
      })
    }

    void loadSections()

    return () => {
      cancelled = true
    }
  }, [activeSelectionKey, driver])

  const toggleSection = (sectionId: keyof HumanReadableMetadataRoot) => {
    setCollapsedSectionIds((current) =>
      current.includes(sectionId)
        ? current.filter((entry) => entry !== sectionId)
        : [...current, sectionId],
    )
  }

  useEffect(() => {
    writeStoredCollapsedSectionIds(instrument.id, collapsedSectionIds)
  }, [collapsedSectionIds, instrument.id])
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
              const isExpanded = !collapsedSectionIds.includes(section.id)
              return (
                <section className={styles.section} data-section-id={section.id} key={section.id}>
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
