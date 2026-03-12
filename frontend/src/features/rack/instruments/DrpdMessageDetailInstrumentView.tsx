import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  buildCapturedLogSelectionKey,
  decodeLoggedCapturedMessageWithContext,
  DRPDDevice,
  type DRPDLogSelectionState,
  type LoggedCapturedMessage,
} from '../../../lib/device'
import {
  HumanReadableField,
  type HumanReadableMetadataRoot,
  type HumanReadableTableCell,
} from '../../../lib/device/drpd/usb-pd/humanReadableField'
import type { Message } from '../../../lib/device/drpd/usb-pd/messageBase'
import type { SOPKind } from '../../../lib/device/drpd/usb-pd/types'
import type { RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import type { RackDeviceState } from '../RackRenderer'
import { useRackSizingConfig } from '../rackSizing'
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

type LoadedSelection =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | {
      kind: 'message'
      message: Message
      sections: MessageDetailSection[]
    }

type MessageByteSegment = {
  kind: 'sop' | 'header' | 'extendedHeader' | 'body' | 'crc32'
  bytes: Uint8Array
  tooltip: string
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

const formatSOPType = (kind: SOPKind): string => {
  switch (kind) {
    case 'SOP':
      return 'SOP'
    case 'SOP_PRIME':
      return "SOP'"
    case 'SOP_DOUBLE_PRIME':
      return "SOP''"
    case 'SOP_DEBUG_PRIME':
      return "SOP'-D"
    case 'SOP_DEBUG_DOUBLE_PRIME':
      return "SOP''-D"
    case 'SOP_HARD_RESET':
      return 'Hard Reset'
    case 'SOP_CABLE_RESET':
      return 'Cable Reset'
  }
}

const describeSOPType = (kind: SOPKind): string => {
  switch (kind) {
    case 'SOP':
      return 'Start of Packet ordered set for port-to-port USB-PD messages.'
    case 'SOP_PRIME':
      return 'SOP prime ordered set for cable-plug or VPD communication.'
    case 'SOP_DOUBLE_PRIME':
      return 'SOP double-prime ordered set for the far-end cable plug.'
    case 'SOP_DEBUG_PRIME':
      return 'Debug SOP prime ordered set used for debug communication.'
    case 'SOP_DEBUG_DOUBLE_PRIME':
      return 'Debug SOP double-prime ordered set used for debug communication.'
    case 'SOP_HARD_RESET':
      return 'Hard Reset ordered set.'
    case 'SOP_CABLE_RESET':
      return 'Cable Reset ordered set.'
  }
}

const buildMessageByteSegments = (message: Message): MessageByteSegment[] => {
  const payload = message.capturePayload ?? message.payload
  const chunkedExtended = message.header.messageHeader.extended && (message.header.extendedHeader?.chunked ?? false)
  const headerLength = message.header.messageHeader.extended ? 4 : 2
  const bodyLength = message.header.messageHeader.extended
    ? (message.header.extendedHeader?.dataSize ?? 0)
    : message.header.messageHeader.numberOfDataObjects * 4
  const bodyStart = message.payloadOffset
  const provisionalBodyEnd = Math.min(payload.length, bodyStart + bodyLength)
  const hasEmbeddedCRC = chunkedExtended
    ? payload.length >= bodyStart + 4
    : payload.length >= provisionalBodyEnd + 4
  const crcStart = hasEmbeddedCRC
    ? (
        chunkedExtended
          ? Math.max(bodyStart, payload.length - 4)
          : provisionalBodyEnd
      )
    : payload.length
  const bodyEnd = chunkedExtended ? crcStart : provisionalBodyEnd
  const segments: MessageByteSegment[] = [
    {
      kind: 'sop',
      bytes: payload.subarray(0, 4),
      tooltip: `SOP: ${formatSOPType(message.sop.kind)}. ${describeSOPType(message.sop.kind)}`,
    },
    {
      kind: 'header',
      bytes: payload.subarray(4, 6),
      tooltip: 'Message header: the 16-bit USB-PD header containing message type, roles, revision, and related flags.',
    },
  ]

  if (headerLength > 2) {
    segments.push({
      kind: 'extendedHeader',
      bytes: payload.subarray(6, 8),
      tooltip: 'Extended header: the 16-bit USB-PD extended-message header containing chunking and data-size fields.',
    })
  }

  if (bodyEnd > bodyStart) {
    segments.push({
      kind: 'body',
      bytes: payload.subarray(bodyStart, bodyEnd),
      tooltip: 'Message body: the message payload bytes, including data objects or extended-message data.',
    })
  }

  if (hasEmbeddedCRC) {
    segments.push({
      kind: 'crc32',
      bytes: payload.subarray(crcStart, crcStart + 4),
      tooltip: 'CRC32: the 32-bit checksum embedded at the end of the message.',
    })
  }

  return segments.filter((segment) => segment.bytes.length > 0)
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
  messageByteSegments,
}: {
  field: HumanReadableField
  messageByteSegments?: MessageByteSegment[] | null
}) => {
  if (isStringField(field)) {
    return <span className={styles.scalarValue}>{field.value}</span>
  }

  if (isByteDataField(field)) {
    if (messageByteSegments && field.Label === 'Message Bytes') {
      return (
        <span className={styles.byteDataSegments} aria-label="Segmented message bytes">
          {messageByteSegments.map((segment) => (
            <span
              className={`${styles.byteDataSegment} ${styles[`byteDataSegment${segment.kind[0].toUpperCase()}${segment.kind.slice(1)}` as keyof typeof styles]}`}
              key={`${segment.kind}-${Array.from(segment.bytes).join('-')}`}
              title={segment.tooltip}
            >
              {Array.from(segment.bytes, (value) => value.toString(16).padStart(2, '0').toUpperCase()).join(' ')}
            </span>
          ))}
        </span>
      )
    }
    return <span className={styles.byteDataValue}>{formatByteDataSummary(field)}</span>
  }

  return null
}

const FieldHelpButton = ({
  label,
  explanation,
}: {
  label: string
  explanation: string
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLSpanElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const popupId = useId()
  const [popupStyle, setPopupStyle] = useState<CSSProperties | null>(null)
  const rackSizing = useRackSizingConfig()

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current || !popupRef.current || typeof window === 'undefined') {
      return
    }

    const margin = rackSizing.popoverViewportInsetPx
    const updatePosition = () => {
      const buttonRect = buttonRef.current?.getBoundingClientRect()
      const popupRect = popupRef.current?.getBoundingClientRect()
      if (!buttonRect || !popupRect) {
        return
      }

      const maxLeft = Math.max(margin, window.innerWidth - popupRect.width - margin)
      const maxTop = Math.max(margin, window.innerHeight - popupRect.height - margin)
      const left = Math.min(Math.max(buttonRect.left, margin), maxLeft)
      const top = Math.min(Math.max(buttonRect.bottom, margin), maxTop)

      setPopupStyle({
        left: `${left}px`,
        top: `${top}px`,
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen, rackSizing.popoverViewportInsetPx])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        !containerRef.current?.contains(target) &&
        !popupRef.current?.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <span className={styles.fieldHelp} ref={containerRef}>
      <button
        type="button"
        ref={buttonRef}
        className={styles.fieldHelpButton}
        aria-label={`Show description for ${label}`}
        aria-expanded={isOpen}
        aria-controls={isOpen ? popupId : undefined}
        onClick={() => {
          setIsOpen((current) => !current)
        }}
      >
        <span className={styles.fieldHelpButtonIcon} aria-hidden="true">
          ?
        </span>
      </button>
      {isOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className={styles.fieldHelpPopup}
              id={popupId}
              ref={popupRef}
              role="dialog"
              aria-label={`${label} description`}
              style={popupStyle ?? { visibility: 'hidden' }}
            >
              <p className={styles.fieldHelpPopupText}>{explanation}</p>
            </div>,
            document.body,
          )
        : null}
    </span>
  )
}

const FieldLabel = ({
  label,
  explanation,
  textClassName,
  showHelpButton = true,
}: {
  label: string
  explanation: string
  textClassName: string
  showHelpButton?: boolean
}) => {
  return (
    <span className={styles.fieldLabel}>
      <span className={textClassName}>{label}</span>
      {showHelpButton ? <FieldHelpButton label={label} explanation={explanation} /> : null}
    </span>
  )
}

const NestedTableCellLabel = ({
  field,
  showHelpButton,
}: {
  field: HumanReadableField
  showHelpButton: boolean
}) => {
  const content: ReactNode = isStringField(field) ? field.value : <MetadataFieldValue field={field} />

  return (
    <span className={styles.fieldLabel}>
      <span className={styles.nestedTableCellText}>{content}</span>
      {showHelpButton ? <FieldHelpButton label={field.Label} explanation={field.explanation} /> : null}
    </span>
  )
}

const MetadataDictionaryTable = ({
  field,
  showHelpButton,
  messageByteSegments,
}: {
  field: HumanReadableField<'OrderedDictionary'>
  showHelpButton: boolean
  messageByteSegments?: MessageByteSegment[] | null
}) => {
  return (
    <table className={styles.metadataTable}>
      <tbody className={styles.metadataTableBody}>
        {Array.from(field.entries()).map(([key, entryField]) =>
          isOrderedDictionaryField(entryField) || isTableField(entryField) ? (
            <tr className={styles.metadataCompositeRow} key={`${key}-${entryField.Label}`}>
              <td className={styles.metadataCompositeCell} colSpan={2}>
                <div className={styles.metadataCompositeLabel}>
                  <FieldLabel
                    label={entryField.Label}
                    explanation={entryField.explanation}
                    textClassName={styles.metadataCompositeLabelText}
                    showHelpButton={showHelpButton}
                  />
                </div>
                <div className={styles.nestedContainer}>
                  {isOrderedDictionaryField(entryField) ? (
                    <MetadataDictionaryTable field={entryField} showHelpButton={showHelpButton} />
                  ) : (
                    <MetadataNestedTable field={entryField} showHelpButton={showHelpButton} />
                  )}
                </div>
              </td>
            </tr>
          ) : (
            <tr className={styles.metadataRow} key={`${key}-${entryField.Label}`}>
              <th className={styles.metadataLabelCell} scope="row">
                <FieldLabel
                  label={entryField.Label}
                  explanation={entryField.explanation}
                  textClassName={styles.metadataLabelText}
                  showHelpButton={showHelpButton}
                />
              </th>
              <td className={styles.metadataValueCell}>
                <MetadataFieldValue field={entryField} messageByteSegments={key === 'messageBytes' ? messageByteSegments : null} />
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
  showHelpButton,
}: {
  field: HumanReadableField<'Table'>
  showHelpButton: boolean
}) => {
  const rows = groupTableCellsIntoRows(field.value)
  return (
    <table className={styles.nestedTable}>
      <tbody className={styles.nestedTableBody}>
        {rows.map((row, rowIndex) => (
          <tr className={styles.nestedTableRow} key={`${field.Label}-${rowIndex}`}>
            {row.map((cell, cellIndex) =>
              cell.kind === 'header' ? (
                <th className={styles.nestedTableHeaderCell} key={`${rowIndex}-${cellIndex}`}>
                  <NestedTableCellLabel field={cell.field} showHelpButton={showHelpButton} />
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
  const [loadedSelection, setLoadedSelection] = useState<LoadedSelection>({ kind: 'none' })
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
          startTimestampUs: 0n,
          endTimestampUs: parsedSelectionKey.startTimestampUs,
          sortOrder: 'desc',
          limit: 64,
        }),
      )
      if (cancelled) {
        return
      }
      const orderedRows = [...rows].reverse()
      const row = findSelectedMessageRow(orderedRows, activeSelectionKey)
      if (!row) {
        setLoadedSelectionKey(activeSelectionKey)
        setLoadedSelection({ kind: 'none' })
        return
      }
      const targetIndex = orderedRows.findIndex(
        (candidate) => buildCapturedLogSelectionKey(candidate) === activeSelectionKey,
      )
      const decodeContext = targetIndex >= 0 ? orderedRows.slice(0, targetIndex + 1) : [row]
      const decoded = decodeLoggedCapturedMessageWithContext(row, decodeContext)
      if (decoded.kind !== 'message') {
        setLoadedSelectionKey(activeSelectionKey)
        setLoadedSelection({ kind: 'invalid' })
        return
      }
      const nextSections = buildMetadataSections(decoded.message.humanReadableMetadata)
      setLoadedSelectionKey(activeSelectionKey)
      setLoadedSelection({
        kind: 'message',
        message: decoded.message,
        sections: nextSections,
      })
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
  const visibleSelection =
    activeSelectionKey !== null && loadedSelectionKey === activeSelectionKey ? loadedSelection : { kind: 'none' as const }

  return (
    <InstrumentBase
      instrument={instrument}
      displayName={displayName}
      isEditMode={isEditMode}
      contentClassName={styles.contentFill}
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
          {visibleSelection.kind === 'invalid' ? (
            <div className={styles.invalidMessageState}>invalid</div>
          ) : visibleSelection.kind === 'message' ? (
            <div className={styles.sectionsContainer}>
              {visibleSelection.sections.map((section) => {
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
                        <MetadataDictionaryTable
                          field={section.field}
                          showHelpButton={section.id !== 'baseInformation'}
                          messageByteSegments={
                            section.id === 'technicalData' &&
                            section.field.getEntry('messageBytes')?.type === 'ByteData'
                              ? buildMessageByteSegments(visibleSelection.message)
                              : null
                          }
                        />
                      </div>
                    ) : null}
                  </section>
                )
              })}
            </div>
          ) : null}
        </section>
      ) : (
        <div className={styles.emptyStateContainer}>
          <p className={styles.emptyStateText}>Select a message to inspect.</p>
        </div>
      )}
    </InstrumentBase>
  )
}
