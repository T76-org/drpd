import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useLayoutEffect,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { DRPDDevice } from '../../../lib/device'
import {
  buildCapturedLogSelectionKey,
  type DRPDLogSelectionState,
  type LoggedCapturedMessage,
} from '../../../lib/device'
import {
  CONTROL_MESSAGE_TYPES,
  DATA_MESSAGE_TYPES,
  EXTENDED_MESSAGE_TYPES,
} from '../../../lib/device/drpd/usb-pd/message'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import type { RackDeviceState } from '../RackRenderer'
import {
  type MessageLogFilterRule,
  type MessageLogFilters,
} from '../overlays/usbPdLog/usbPdLogFilters'
import {
  MESSAGE_LOG_COLUMNS,
  readMessageLogColumnVisibility,
  readMessageLogColumnWidths,
  saveMessageLogColumnWidths,
  type MessageLogColumnId,
  type MessageLogColumnVisibility,
  type MessageLogColumnWidths,
} from '../overlays/usbPdLog/messageLogColumns'
import styles from './DrpdUsbPdLogInstrumentView.module.css'
import { DRPD_USB_PD_LOG_CONFIG } from './DrpdUsbPdLogTimeStrip.config'
import { formatWallClock } from './DrpdUsbPdLogTimeStrip.utils'

const LOG_END_TIMESTAMP_US = (2n ** 63n) - 1n
const ROW_HEIGHT_PX = DRPD_USB_PD_LOG_CONFIG.tableLayout.rowHeightPx
const PAGE_SIZE = DRPD_USB_PD_LOG_CONFIG.tableBehavior.pageSize
const OVERSCAN_ROWS = DRPD_USB_PD_LOG_CONFIG.tableBehavior.overscanRows
const COUNT_SYNC_INTERVAL_MS = DRPD_USB_PD_LOG_CONFIG.tableBehavior.countSyncIntervalMs
const HORIZONTAL_SCROLLBAR_GUTTER_PX = 12
const EMPTY_SELECTION: DRPDLogSelectionState = {
  selectedKeys: [],
  anchorIndex: null,
  activeIndex: null,
}

type ColumnResizeDrag = {
  columnId: MessageLogColumnId
  pointerId: number
  startX: number
  startWidthPx: number
}

const resolveCssLength = (
  value: string,
  fallback: number,
  context?: HTMLElement,
): number => {
  if (value.trim().length === 0 || typeof document === 'undefined') {
    return fallback
  }

  const probe = document.createElement('div')
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.style.pointerEvents = 'none'
  probe.style.width = value
  const parent = context ?? document.body
  parent.appendChild(probe)

  try {
    const resolved = window.getComputedStyle(probe).width
    const parsed = Number.parseFloat(resolved)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
  } finally {
    probe.remove()
  }
}

type DisplayRow = {
  key: string
  selectionKey: string
  kind: 'message' | 'event'
  eventType: LoggedCapturedMessage['eventType']
  startTimestampUs: bigint
  endTimestampUs: bigint
  timestamp: string
  duration: string
  delta: string
  messageId: string
  messageType: string
  sender: string
  receiver: string
  sopType: string
  valid: string
}

type DisplayColumnField = keyof Pick<
  DisplayRow,
  'timestamp' | 'duration' | 'delta' | 'messageId' | 'messageType' | 'sender' | 'receiver' | 'sopType' | 'valid'
>

const EMPTY_FILTERS: MessageLogFilters = {
  messageTypes: { include: [], exclude: [] },
  senders: { include: [], exclude: [] },
  receivers: { include: [], exclude: [] },
  sopTypes: { include: [], exclude: [] },
  crcValid: { include: [], exclude: [] },
}

const INVALID_MESSAGE_TYPE_LABEL = 'Invalid message'
const CRC_VALID_LABEL = 'Valid'
const CRC_INVALID_LABEL = 'Invalid'

const formatMicroseconds = (value: bigint | null): string => {
  if (value === null) {
    return '--'
  }
  return `${value}`
}

const formatTimestampCell = (row: LoggedCapturedMessage): string => {
  return formatWallClock(row.wallClockUs)
}

const normalizeSopType = (value: string | null): string => {
  switch(value) {
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
    default:
      return '--'
  }
}

const resolveMessageTypeLabel = (row: LoggedCapturedMessage): string => {
  if (row.entryKind === 'message' && (row.decodeResult !== 0 || row.parseError)) {
    return INVALID_MESSAGE_TYPE_LABEL
  }
  if (!row.messageKind || row.messageType == null) {
    return '--'
  }
  const mapping =
    row.messageKind === 'CONTROL'
      ? CONTROL_MESSAGE_TYPES[row.messageType]
      : row.messageKind === 'DATA'
        ? DATA_MESSAGE_TYPES[row.messageType]
        : row.messageKind === 'EXTENDED'
          ? EXTENDED_MESSAGE_TYPES[row.messageType]
          : undefined
  return mapping?.name.replaceAll('_', ' ') ?? `${row.messageKind} ${row.messageType}`
}

const isRowCrcValid = (row: LoggedCapturedMessage): boolean =>
  row.entryKind === 'message' && row.decodeResult === 0 && !row.parseError

const resolveCrcValidLabel = (row: LoggedCapturedMessage): string =>
  isRowCrcValid(row) ? CRC_VALID_LABEL : CRC_INVALID_LABEL

const resolveSenderReceiver = (
  row: LoggedCapturedMessage,
): { sender: string; receiver: string } => {
  if (row.sopKind === 'SOP') {
    if (row.senderPowerRole === 'SOURCE') {
      return { sender: 'Source', receiver: 'Sink' }
    }
    if (row.senderPowerRole === 'SINK') {
      return { sender: 'Sink', receiver: 'Source' }
    }
  }

  if (
    row.sopKind === 'SOP_PRIME' ||
    row.sopKind === 'SOP_DOUBLE_PRIME' ||
    row.sopKind === 'SOP_DEBUG_PRIME' ||
    row.sopKind === 'SOP_DEBUG_DOUBLE_PRIME'
  ) {
    if (row.senderDataRole === 'CABLE_PLUG_VPD') {
      return { sender: 'Cable', receiver: 'Source' }
    }
    if (row.senderDataRole === 'UFP_DFP') {
      return { sender: 'Source', receiver: 'Cable' }
    }
    return { sender: 'Unknown', receiver: 'Unknown' }
  }

  return { sender: 'Unknown', receiver: 'Unknown' }
}

const countActiveFilters = (filters: MessageLogFilters): number =>
  Object.values(filters).reduce(
    (count, rule) => count + rule.include.length + rule.exclude.length,
    0,
  )

const filterRuleMatches = (rule: MessageLogFilterRule, value: string): boolean => {
  if (rule.exclude.includes(value)) {
    return false
  }
  return rule.include.length === 0 || rule.include.includes(value)
}

const messageMatchesFilters = (
  row: LoggedCapturedMessage,
  filters: MessageLogFilters,
): boolean => {
  if (row.entryKind === 'event') {
    return true
  }
  const senderReceiver = resolveSenderReceiver(row)
  return (
    filterRuleMatches(filters.messageTypes, resolveMessageTypeLabel(row)) &&
    filterRuleMatches(filters.senders, senderReceiver.sender) &&
    filterRuleMatches(filters.receivers, senderReceiver.receiver) &&
    filterRuleMatches(filters.sopTypes, normalizeSopType(row.sopKind)) &&
    filterRuleMatches(filters.crcValid, resolveCrcValidLabel(row))
  )
}

const toDisplayRows = (
  pageRows: LoggedCapturedMessage[],
  previousEndTimestampUs: bigint | null,
): DisplayRow[] => {
  let previousEnd = previousEndTimestampUs
  return pageRows.map((row) => {
    if (row.entryKind === 'event') {
      previousEnd = null
      return {
        key: `${row.startTimestampUs.toString()}-${row.createdAtMs}-event`,
        selectionKey: buildCapturedLogSelectionKey(row),
        kind: 'event',
        eventType: row.eventType,
        startTimestampUs: row.startTimestampUs,
        endTimestampUs: row.endTimestampUs,
        timestamp: formatWallClock(row.wallClockUs),
        duration: '',
        delta: '',
        messageId: '',
        messageType: row.eventText ?? 'Event',
        sender: '',
        receiver: '',
        sopType: '',
        valid: '',
      }
    }

    const durationUs = row.endTimestampUs - row.startTimestampUs
    const deltaUs = previousEnd === null ? null : row.startTimestampUs - previousEnd
    previousEnd = row.endTimestampUs
    const senderReceiver = resolveSenderReceiver(row)
    const isValid = row.decodeResult === 0 && !row.parseError

    return {
      kind: 'message',
      eventType: null,
      key: `${row.startTimestampUs.toString()}-${row.endTimestampUs.toString()}-${row.createdAtMs}`,
      selectionKey: buildCapturedLogSelectionKey(row),
      startTimestampUs: row.startTimestampUs,
      endTimestampUs: row.endTimestampUs,
      timestamp: formatTimestampCell(row),
      duration: formatMicroseconds(durationUs),
      delta: formatMicroseconds(deltaUs),
      messageId: row.messageId == null ? '--' : row.messageId.toString(),
      messageType: resolveMessageTypeLabel(row),
      sender: senderReceiver.sender,
      receiver: senderReceiver.receiver,
      sopType: normalizeSopType(row.sopKind),
      valid: isValid ? '✓' : '✗',
    }
  })
}

export const DrpdUsbPdLogInstrumentView = ({
  instrument,
  displayName,
  deviceState,
  isEditMode,
  onRemove,
}: {
  instrument: RackInstrument
  displayName: string
  deviceRecord?: RackDeviceRecord
  deviceState?: RackDeviceState
  isEditMode: boolean
  onRemove?: (instrumentId: string) => void
  onUpdateDeviceConfig?: (
    deviceRecordId: string,
    updater: (current: Record<string, unknown> | undefined) => Record<string, unknown>,
  ) => Promise<void> | void
}) => {
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

  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const atBottomRef = useRef(true)
  const totalRowsRef = useRef(0)
  const loadingPagesRef = useRef(new Set<number>())
  const selectionTaskRef = useRef<Promise<void>>(Promise.resolve())
  const columnResizeDragRef = useRef<ColumnResizeDrag | null>(null)
  const [totalRows, setTotalRows] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [tableHorizontalPaddingPx, setTableHorizontalPaddingPx] = useState(16)
  const [rowHeightPx, setRowHeightPx] = useState<number>(ROW_HEIGHT_PX)
  const [headerSlotHeightPx, setHeaderSlotHeightPx] = useState<number>(ROW_HEIGHT_PX)
  const [pages, setPages] = useState<Map<number, DisplayRow[]>>(new Map())
  const [selection, setSelection] = useState<DRPDLogSelectionState>(EMPTY_SELECTION)
  const [filters, setFilters] = useState<MessageLogFilters>(EMPTY_FILTERS)
  const [columnVisibility, setColumnVisibility] =
    useState<MessageLogColumnVisibility>(() => readMessageLogColumnVisibility())
  const [columnWidths, setColumnWidths] =
    useState<MessageLogColumnWidths>(() => readMessageLogColumnWidths())
  const [resizingColumnId, setResizingColumnId] = useState<MessageLogColumnId | null>(null)
  const [filterRows, setFilterRows] = useState<LoggedCapturedMessage[]>([])
  const driver = deviceState?.drpdDriver
  const selectedKeySet = useMemo(
    () => new Set(selection.selectedKeys),
    [selection.selectedKeys],
  )
  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters])
  const visibleColumns = useMemo(() => {
    const next = MESSAGE_LOG_COLUMNS.filter((column) => columnVisibility[column.id])
    return next.length > 0 ? next : MESSAGE_LOG_COLUMNS
  }, [columnVisibility])
  const gridMinimumWidthPx = useMemo(() => {
    let width = 0
    for (const column of visibleColumns) {
      width += columnWidths[column.id]
    }
    return width
  }, [columnWidths, visibleColumns])
  const gridTemplateColumns = useMemo(() => {
    return visibleColumns.map((column, index) => (
      index === visibleColumns.length - 1
        ? `${columnWidths[column.id]}px minmax(0, 1fr)`
        : `${columnWidths[column.id]}px`
    )).join(' ')
  }, [columnWidths, visibleColumns])
  const tableOuterWidthPx = Math.max(viewportWidth, gridMinimumWidthPx + tableHorizontalPaddingPx)
  const tableBottomGutterPx =
    viewportWidth > 0 && tableOuterWidthPx > viewportWidth ? HORIZONTAL_SCROLLBAR_GUTTER_PX : 0
  const hasActiveFilters = activeFilterCount > 0
  const filteredRows = useMemo(
    () => (hasActiveFilters ? filterRows.filter((row) => messageMatchesFilters(row, filters)) : []),
    [filterRows, filters, hasActiveFilters],
  )
  const filteredDisplayRows = useMemo(
    () => (hasActiveFilters ? toDisplayRows(filteredRows, null) : []),
    [filteredRows, hasActiveFilters],
  )
  const displayedTotalRows = hasActiveFilters ? filteredDisplayRows.length : totalRows

  const firstVisibleRow = Math.max(0, Math.floor(scrollTop / rowHeightPx) - OVERSCAN_ROWS)
  const visibleRowCount = Math.ceil(viewportHeight / rowHeightPx) + OVERSCAN_ROWS * 2
  const lastVisibleRow = Math.min(displayedTotalRows - 1, firstVisibleRow + visibleRowCount)

  const visibleRows = useMemo(() => {
    const rows: Array<{ index: number; row: DisplayRow | null }> = []
    if (displayedTotalRows <= 0 || lastVisibleRow < firstVisibleRow) {
      return rows
    }
    for (let index = firstVisibleRow; index <= lastVisibleRow; index += 1) {
      if (hasActiveFilters) {
        rows.push({
          index,
          row: filteredDisplayRows[index] ?? null,
        })
        continue
      }
      const pageIndex = Math.floor(index / PAGE_SIZE)
      const rowInPageIndex = index % PAGE_SIZE
      rows.push({
        index,
        row: pages.get(pageIndex)?.[rowInPageIndex] ?? null,
      })
    }
    return rows
  }, [displayedTotalRows, filteredDisplayRows, firstVisibleRow, hasActiveFilters, lastVisibleRow, pages])

  const queryAllCapturedMessages = useCallback(async (): Promise<LoggedCapturedMessage[]> => {
    if (!driver) {
      return []
    }
    return await driver.queryCapturedMessages({
      startTimestampUs: 0n,
      endTimestampUs: LOG_END_TIMESTAMP_US,
      sortOrder: 'asc',
    })
  }, [driver])

  const getRowKeyAtIndex = async (index: number): Promise<string | null> => {
    if (!driver || index < 0 || index >= displayedTotalRows) {
      return null
    }
    if (hasActiveFilters) {
      return filteredDisplayRows[index]?.selectionKey ?? null
    }
    const pageIndex = Math.floor(index / PAGE_SIZE)
    const rowInPageIndex = index % PAGE_SIZE
    const cached = pages.get(pageIndex)?.[rowInPageIndex]
    if (cached) {
      return cached.selectionKey
    }
    const keys = await driver.resolveLogSelectionKeysForIndexRange(index, index)
    return keys[0] ?? null
  }

  const persistSelection = async (next: DRPDLogSelectionState): Promise<void> => {
    const normalized = normalizeSelectionState(next)
    if (!driver) {
      setSelection(normalized)
      return
    }
    await driver.setLogSelectionState(normalized)
    setSelection(normalized)
  }

  const readSelectionFromDriver = useCallback(async (): Promise<DRPDLogSelectionState> => {
    if (!driver) {
      return EMPTY_SELECTION
    }
    const maybeSelection = driver.getLogSelectionState()
    return normalizeSelectionState(await Promise.resolve(maybeSelection))
  }, [driver])

  const enqueueSelectionTask = (task: () => Promise<void>): void => {
    selectionTaskRef.current = selectionTaskRef.current
      .then(async () => {
        await task()
      })
      .catch(() => undefined)
  }

  const applySingleSelectionAtIndex = async (index: number): Promise<void> => {
    const rowKey = await getRowKeyAtIndex(index)
    if (!rowKey) {
      return
    }
    const nextSelection: DRPDLogSelectionState = {
      selectedKeys: [rowKey],
      anchorIndex: index,
      activeIndex: index,
    }
    await persistSelection(nextSelection)
  }

  const applyRangeSelection = async (
    anchorIndex: number,
    activeIndex: number,
    additive: boolean,
    baseSelectedKeys?: string[],
  ): Promise<void> => {
    if (!driver || displayedTotalRows <= 0) {
      return
    }
    const normalizedAnchor = Math.max(0, Math.min(anchorIndex, displayedTotalRows - 1))
    const normalizedActive = Math.max(0, Math.min(activeIndex, displayedTotalRows - 1))
    const rangeKeys = hasActiveFilters
      ? filteredDisplayRows
          .slice(
            Math.min(normalizedAnchor, normalizedActive),
            Math.max(normalizedAnchor, normalizedActive) + 1,
          )
          .map((row) => row.selectionKey)
      : await driver.resolveLogSelectionKeysForIndexRange(
          normalizedAnchor,
          normalizedActive,
        )
    const selectedKeys = additive
      ? Array.from(new Set([...(baseSelectedKeys ?? selection.selectedKeys), ...rangeKeys]))
      : rangeKeys
    await persistSelection({
      selectedKeys,
      anchorIndex: normalizedAnchor,
      activeIndex: normalizedActive,
    })
  }

  const scrollRowIntoView = (index: number): void => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }
    const rowTop = index * rowHeightPx
    const rowBottom = rowTop + rowHeightPx
    if (rowTop < viewport.scrollTop) {
      viewport.scrollTop = rowTop
      return
    }
    const viewportBottom = viewport.scrollTop + viewport.clientHeight
    if (rowBottom > viewportBottom) {
      viewport.scrollTop = rowBottom - viewport.clientHeight
    }
  }

  const applyColumnResize = (clientX: number, pointerId: number): void => {
    const drag = columnResizeDragRef.current
    if (!drag || drag.pointerId !== pointerId) {
      return
    }
    const column = MESSAGE_LOG_COLUMNS.find((candidate) => candidate.id === drag.columnId)
    if (!column) {
      return
    }
    const deltaPx = clientX - drag.startX
    const nextWidthPx = Math.max(column.minWidthPx, Math.round(drag.startWidthPx + deltaPx))
    setColumnWidths((previous) => {
      if (previous[drag.columnId] === nextWidthPx) {
        return previous
      }
      const next = {
        ...previous,
        [drag.columnId]: nextWidthPx,
      }
      saveMessageLogColumnWidths(next)
      return next
    })
  }

  const handleColumnResizePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    columnId: MessageLogColumnId,
  ): void => {
    event.preventDefault()
    event.stopPropagation()
    columnResizeDragRef.current = {
      columnId,
      pointerId: event.pointerId ?? -1,
      startX: Number.isFinite(event.clientX) ? event.clientX : 0,
      startWidthPx: columnWidths[columnId],
    }
    setResizingColumnId(columnId)
    event.currentTarget.setPointerCapture?.(event.pointerId ?? -1)
  }

  const handleColumnResizeMouseDown = (
    event: ReactMouseEvent<HTMLButtonElement>,
    columnId: MessageLogColumnId,
  ): void => {
    if (columnResizeDragRef.current) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    columnResizeDragRef.current = {
      columnId,
      pointerId: -1,
      startX: Number.isFinite(event.clientX) ? event.clientX : 0,
      startWidthPx: columnWidths[columnId],
    }
    setResizingColumnId(columnId)
  }

  const handleColumnResizePointerMove = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = columnResizeDragRef.current
    const pointerId = event.pointerId ?? -1
    if (!drag || drag.pointerId !== pointerId) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const clientX = Number.isFinite(event.clientX) ? event.clientX : drag.startX
    applyColumnResize(clientX, pointerId)
  }

  const handleColumnResizePointerUp = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = columnResizeDragRef.current
    const pointerId = event.pointerId ?? -1
    if (!drag || drag.pointerId !== pointerId) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    columnResizeDragRef.current = null
    setResizingColumnId(null)
    event.currentTarget.releasePointerCapture?.(pointerId)
  }

  useEffect(() => {
    if (resizingColumnId === null) {
      return undefined
    }

    const handlePointerMove = (event: PointerEvent) => {
      const drag = columnResizeDragRef.current
      if (!drag || drag.pointerId !== (event.pointerId ?? -1)) {
        return
      }
      event.preventDefault()
      applyColumnResize(Number.isFinite(event.clientX) ? event.clientX : drag.startX, drag.pointerId)
    }

    const handlePointerUp = (event: PointerEvent) => {
      const drag = columnResizeDragRef.current
      if (!drag || drag.pointerId !== (event.pointerId ?? -1)) {
        return
      }
      event.preventDefault()
      columnResizeDragRef.current = null
      setResizingColumnId(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    const handleMouseMove = (event: MouseEvent) => {
      const drag = columnResizeDragRef.current
      if (!drag || drag.pointerId !== -1) {
        return
      }
      event.preventDefault()
      applyColumnResize(Number.isFinite(event.clientX) ? event.clientX : drag.startX, -1)
    }

    const handleMouseUp = (event: MouseEvent) => {
      const drag = columnResizeDragRef.current
      if (!drag || drag.pointerId !== -1) {
        return
      }
      event.preventDefault()
      columnResizeDragRef.current = null
      setResizingColumnId(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingColumnId])

  useEffect(() => {
    totalRowsRef.current = totalRows
  }, [totalRows])

  useEffect(() => {
    setScrollTop(0)
    if (viewportRef.current) {
      viewportRef.current.scrollTop = 0
    }
  }, [activeFilterCount])

  useEffect(() => {
    if (!driver) {
      setFilterRows([])
      setFilters(EMPTY_FILTERS)
      return
    }

    let cancelled = false
    void queryAllCapturedMessages().then((rows) => {
      if (cancelled) {
        return
      }
      if (hasActiveFilters) {
        setFilterRows(rows)
      }
    })

    return () => {
      cancelled = true
    }
  }, [driver, hasActiveFilters, queryAllCapturedMessages, totalRows])

  useEffect(() => {
    const handleGlobalFiltersChanged = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      const next = detail?.filters as MessageLogFilters | undefined
      if (!next) {
        return
      }
      setFilters(next)
      if (countActiveFilters(next) > 0) {
        void queryAllCapturedMessages().then((rows) => {
          setFilterRows(rows)
        })
      } else {
        setFilterRows([])
      }
    }

    window.addEventListener('drpd-message-log-filters-changed', handleGlobalFiltersChanged)
    return () => {
      window.removeEventListener('drpd-message-log-filters-changed', handleGlobalFiltersChanged)
    }
  }, [queryAllCapturedMessages])

  useEffect(() => {
    const handleGlobalColumnsChanged = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      const next = detail?.visibility as MessageLogColumnVisibility | undefined
      if (!next) {
        return
      }
      setColumnVisibility(next)
      const nextWidths = detail?.widths as MessageLogColumnWidths | undefined
      if (nextWidths) {
        setColumnWidths(nextWidths)
      }
    }

    window.addEventListener('drpd-message-log-columns-changed', handleGlobalColumnsChanged)
    return () => {
      window.removeEventListener('drpd-message-log-columns-changed', handleGlobalColumnsChanged)
    }
  }, [])

  useEffect(() => {
    if (!driver) {
      setSelection(EMPTY_SELECTION)
      return
    }

    let cancelled = false
    void readSelectionFromDriver().then((next) => {
      if (!cancelled) {
        setSelection(next)
      }
    })

    const handleStateUpdated = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      const changed = Array.isArray(detail?.changed) ? detail.changed : []
      if (!changed.includes('logSelection')) {
        return
      }
      void readSelectionFromDriver().then((next) => {
        if (!cancelled) {
          setSelection(next)
        }
      })
    }

    driver.addEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
    return () => {
      cancelled = true
      driver.removeEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
    }
  }, [driver, readSelectionFromDriver])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    const updateRowHeight = () => {
      const nextRowHeight = resolveCssLength(
        window.getComputedStyle(viewport).getPropertyValue('--log-row-height'),
        ROW_HEIGHT_PX,
      )
      setRowHeightPx(nextRowHeight)
    }

    updateRowHeight()
    window.addEventListener('resize', updateRowHeight)
    return () => {
      window.removeEventListener('resize', updateRowHeight)
    }
  }, [])

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) {
      return
    }
    const updateTablePadding = () => {
      const computedStyle = window.getComputedStyle(wrapper)
      setTableHorizontalPaddingPx(
        resolveCssLength(computedStyle.getPropertyValue('--space-8'), 8, wrapper) * 2,
      )
    }
    updateTablePadding()
    window.addEventListener('resize', updateTablePadding)
    return () => {
      window.removeEventListener('resize', updateTablePadding)
    }
  }, [])

  useLayoutEffect(() => {
    const header = headerRef.current
    if (!header) {
      return undefined
    }

    const updateHeaderHeight = () => {
      const visualHeight = header.getBoundingClientRect().height
      setHeaderSlotHeightPx(
        visualHeight > 0 ? Math.ceil(visualHeight + 2) : ROW_HEIGHT_PX,
      )
    }

    updateHeaderHeight()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateHeaderHeight)
      return () => {
        window.removeEventListener('resize', updateHeaderHeight)
      }
    }

    const observer = new ResizeObserver(updateHeaderHeight)
    observer.observe(header)
    return () => {
      observer.disconnect()
    }
  }, [visibleColumns])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return undefined
    }
    setViewportHeight(viewport.clientHeight)
    setViewportWidth(viewport.clientWidth)

    if (typeof ResizeObserver === 'undefined') {
      return undefined
    }

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      setViewportHeight(rect?.height ?? 0)
      setViewportWidth(rect?.width ?? 0)
    })

    observer.observe(viewport)

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const refreshCount = async () => {
      if (!driver) {
        setTotalRows(0)
        setPages(new Map())
        loadingPagesRef.current.clear()
        return
      }

      const counts = await driver.getLogCounts()
      if (cancelled) {
        return
      }

      setTotalRows(counts.messages)
      totalRowsRef.current = counts.messages
      setPages(new Map())
      loadingPagesRef.current.clear()

      requestAnimationFrame(() => {
        if (!viewportRef.current) {
          return
        }
        viewportRef.current.scrollTop = viewportRef.current.scrollHeight
      })
    }

    void refreshCount()

    return () => {
      cancelled = true
    }
  }, [driver])

  useEffect(() => {
    if (!driver) {
      return undefined
    }

    const handleAdded = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      if (detail?.kind !== 'message' && detail?.kind !== 'event') {
        return
      }

      const addedRow = detail.row as LoggedCapturedMessage | undefined
      const previousTotalRows = totalRowsRef.current

      setTotalRows((previous) => previous + 1)
      totalRowsRef.current = previousTotalRows + 1

      setPages((previous) => {
        if (previous.size === 0 || !addedRow) {
          return previous
        }

        const next = new Map(previous)
        const targetPageIndex = Math.floor(previousTotalRows / PAGE_SIZE)
        const targetIndex = previousTotalRows % PAGE_SIZE
        const targetPage = next.get(targetPageIndex)
        if (!targetPage) {
          return next
        }

        if (targetIndex === 0) {
          const previousPage = next.get(targetPageIndex - 1)
          const previousTail = previousPage?.[previousPage.length - 1] ?? null
          const previousEnd =
            previousTail && previousTail.kind === 'event'
              ? null
              : previousTail?.endTimestampUs ?? null
          next.set(targetPageIndex, toDisplayRows([addedRow], previousEnd))
          return next
        }

        if (targetPage.length === targetIndex) {
          const previousTail = targetPage[targetPage.length - 1] ?? null
          const previousEnd =
            previousTail && previousTail.kind === 'event'
              ? null
              : previousTail?.endTimestampUs ?? null
          const appended = toDisplayRows([addedRow], previousEnd)[0]
          next.set(targetPageIndex, [...targetPage, appended])
          return next
        }

        // Fallback: invalidate the target page to force a correct refetch.
        next.delete(targetPageIndex)
        if (targetIndex === 0 && targetPageIndex > 0) {
          next.delete(targetPageIndex - 1)
        }
        return next
      })

      if (atBottomRef.current) {
        requestAnimationFrame(() => {
          if (!viewportRef.current) {
            return
          }
          viewportRef.current.scrollTop = viewportRef.current.scrollHeight
        })
      }
    }

    const handleDeleted = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      if (!detail?.messagesDeleted) {
        return
      }

      const deletedCount = Number(detail.messagesDeleted)
      const reason = typeof detail.reason === 'string' ? detail.reason : null

      if (reason === 'clear') {
        setPages(new Map())
        setTotalRows(0)
        totalRowsRef.current = 0
        setSelection({
          selectedKeys: [],
          anchorIndex: null,
          activeIndex: null,
        })
        return
      }

      if (Number.isFinite(deletedCount) && deletedCount > 0) {
        setTotalRows((previous) => Math.max(0, previous - deletedCount))
        totalRowsRef.current = Math.max(0, totalRowsRef.current - deletedCount)
        setPages((previous) => {
          if (previous.size === 0) {
            return previous
          }
          // Row removals shift indexes, so cached pages become misaligned.
          return new Map()
        })
        return
      }

      void driver.getLogCounts().then((counts) => {
        setTotalRows(counts.messages)
        totalRowsRef.current = counts.messages
        setPages(new Map())
      })
    }

    driver.addEventListener(DRPDDevice.LOG_ENTRY_ADDED_EVENT, handleAdded)
    driver.addEventListener(DRPDDevice.LOG_ENTRY_DELETED_EVENT, handleDeleted)

    return () => {
      driver.removeEventListener(DRPDDevice.LOG_ENTRY_ADDED_EVENT, handleAdded)
      driver.removeEventListener(DRPDDevice.LOG_ENTRY_DELETED_EVENT, handleDeleted)
    }
  }, [driver])

  useEffect(() => {
    if (!driver) {
      return undefined
    }

    const timer = window.setInterval(() => {
      void driver.getLogCounts().then((counts) => {
        const current = totalRowsRef.current
        if (counts.messages === current) {
          return
        }

        totalRowsRef.current = counts.messages
        setTotalRows(counts.messages)
        setPages((previous) => {
          if (previous.size === 0) {
            return previous
          }
          // Keep cache if we only missed monotonic appends inside the same tail page.
          if (counts.messages > current) {
            const oldLast = current > 0 ? Math.floor((current - 1) / PAGE_SIZE) : 0
            const newLast = Math.floor((counts.messages - 1) / PAGE_SIZE)
            const next = new Map(previous)
            for (let index = oldLast; index <= newLast; index += 1) {
              next.delete(index)
            }
            return next
          }
          // Decreases imply trims/clear/retention; safest is full cache reset.
          return new Map()
        })
      })
    }, COUNT_SYNC_INTERVAL_MS)

    return () => {
      window.clearInterval(timer)
    }
  }, [driver])

  useEffect(() => {
    if (hasActiveFilters || !driver || totalRows <= 0 || lastVisibleRow < firstVisibleRow) {
      return
    }

    const firstPage = Math.floor(firstVisibleRow / PAGE_SIZE)
    const lastPage = Math.floor(lastVisibleRow / PAGE_SIZE)

    for (let pageIndex = firstPage; pageIndex <= lastPage; pageIndex += 1) {
      if (pages.has(pageIndex) || loadingPagesRef.current.has(pageIndex)) {
        continue
      }

      loadingPagesRef.current.add(pageIndex)
      const pageStart = pageIndex * PAGE_SIZE
      const queryOffset = pageStart === 0 ? 0 : pageStart - 1
      const queryLimit = PAGE_SIZE + (pageStart === 0 ? 0 : 1)

      void driver
        .queryCapturedMessages({
          startTimestampUs: 0n,
          endTimestampUs: LOG_END_TIMESTAMP_US,
          sortOrder: 'asc',
          offset: queryOffset,
          limit: queryLimit,
        })
        .then((rows) => {
          const previousRow = pageStart === 0 ? null : (rows[0] ?? null)
          const pageRows = pageStart === 0 ? rows : rows.slice(1)
          const nextRows = toDisplayRows(
            pageRows,
            previousRow?.entryKind === 'event' ? null : previousRow?.endTimestampUs ?? null,
          )
          setPages((previous) => {
            const next = new Map(previous)
            next.set(pageIndex, nextRows)
            return next
          })
        })
        .finally(() => {
          loadingPagesRef.current.delete(pageIndex)
        })
    }
  }, [driver, firstVisibleRow, hasActiveFilters, lastVisibleRow, pages, totalRows])

  const handleRowClick = (
    event: ReactMouseEvent<HTMLDivElement>,
    index: number,
    row: DisplayRow | null,
  ) => {
    if (!row || !driver || index < 0 || index >= displayedTotalRows || isEditMode) {
      return
    }
    viewportRef.current?.focus()
    const isToggleMulti = event.metaKey || event.ctrlKey
    const isRange = event.shiftKey

    enqueueSelectionTask(async () => {
      const current = await readSelectionFromDriver()

      if (isRange) {
        const anchorIndex = current.anchorIndex ?? current.activeIndex ?? index
        await applyRangeSelection(anchorIndex, index, isToggleMulti, current.selectedKeys)
        return
      }

      if (isToggleMulti) {
        const nextKeys = new Set(current.selectedKeys)
        const alreadySelected = nextKeys.has(row.selectionKey)
        if (alreadySelected) {
          nextKeys.delete(row.selectionKey)
        } else {
          nextKeys.add(row.selectionKey)
        }
        await persistSelection({
          selectedKeys: Array.from(nextKeys),
          anchorIndex: index,
          activeIndex: alreadySelected ? current.activeIndex : index,
        })
        return
      }

      if (current.selectedKeys.length === 1 && current.selectedKeys[0] === row.selectionKey) {
        await persistSelection(EMPTY_SELECTION)
        return
      }

      await applySingleSelectionAtIndex(index)
    })
  }

  const handleViewportKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!driver || isEditMode) {
      return
    }
    const key = event.key
    if (key === 'Escape') {
      if (selection.selectedKeys.length === 0) {
        return
      }
      event.preventDefault()
      enqueueSelectionTask(async () => {
        await persistSelection(EMPTY_SELECTION)
      })
      return
    }
    if (displayedTotalRows <= 0) {
      return
    }
    if (key !== 'ArrowDown' && key !== 'ArrowUp') {
      return
    }
    event.preventDefault()

    enqueueSelectionTask(async () => {
      const current = await readSelectionFromDriver()
      const direction = key === 'ArrowDown' ? 1 : -1
      const baseIndex =
        current.activeIndex ??
        current.anchorIndex ??
        (direction > 0 ? -1 : displayedTotalRows)
      const nextIndex = Math.max(0, Math.min(displayedTotalRows - 1, baseIndex + direction))
      scrollRowIntoView(nextIndex)
      if (event.shiftKey) {
        const anchorIndex = current.anchorIndex ?? baseIndex
        await applyRangeSelection(anchorIndex, nextIndex, false, current.selectedKeys)
        return
      }
      await applySingleSelectionAtIndex(nextIndex)
    })
  }

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
      <div
        ref={wrapperRef}
        className={styles.wrapper}
        data-testid="drpd-usbpd-log"
      >
        <div
          className={styles.headerSlot}
          style={{ height: `${headerSlotHeightPx}px` }}
        >
          <div
            ref={headerRef}
            className={`${styles.scaleFrame} ${styles.headerRow}`}
            style={{
              gridTemplateColumns,
              transform: `translateX(${-scrollLeft}px)`,
              width: `${tableOuterWidthPx}px`,
            }}
          >
            {visibleColumns.map((column) => (
              <span
                key={column.id}
                className={`${styles.headerCell} ${resizingColumnId === column.id ? styles.resizingColumn : ''}`}
              >
                <span className={styles.headerLabel}>{column.label}</span>
                <button
                  type="button"
                  className={styles.columnResizeHandle}
                  aria-label={`Resize ${column.label} column`}
                  onPointerDown={(event) => {
                    handleColumnResizePointerDown(event, column.id)
                  }}
                  onMouseDown={(event) => {
                    handleColumnResizeMouseDown(event, column.id)
                  }}
                  onPointerMove={handleColumnResizePointerMove}
                  onPointerUp={handleColumnResizePointerUp}
                  onPointerCancel={handleColumnResizePointerUp}
                />
              </span>
            ))}
          </div>
        </div>
        <div
          ref={viewportRef}
          className={styles.viewport}
          tabIndex={isEditMode ? -1 : 0}
          onKeyDown={handleViewportKeyDown}
          onScroll={(event) => {
            const element = event.currentTarget
            setScrollTop(element.scrollTop)
            setScrollLeft(element.scrollLeft)
            atBottomRef.current =
              element.scrollHeight - element.clientHeight - element.scrollTop <= rowHeightPx * 2
          }}
          data-testid="drpd-usbpd-log-viewport"
          style={{
            paddingBottom: tableBottomGutterPx > 0 ? `${tableBottomGutterPx}px` : undefined,
          }}
        >
          <div
            className={styles.canvas}
            style={{
              height: `${Math.max(displayedTotalRows * rowHeightPx, 0)}px`,
              width: `${tableOuterWidthPx}px`,
            }}
          >
            <div
              className={styles.rowScaleFrame}
              style={{
                height: `${Math.max(displayedTotalRows * rowHeightPx, 0)}px`,
                width: `${tableOuterWidthPx}px`,
              }}
              data-testid="drpd-usbpd-log-canvas"
            >
              {visibleRows.map(({ index, row }) => (
                <div
                  key={row?.key ?? `placeholder-${index}`}
                  className={[
                    styles.dataRow,
                    row && selectedKeySet.has(row.selectionKey) ? styles.selectedRow : '',
                    row?.kind === 'event' ? styles.eventRow : '',
                    row?.eventType === 'capture_changed' ? styles.eventRowCapture : '',
                    row?.eventType === 'cc_role_changed' ? styles.eventRowRole : '',
                    row?.eventType === 'cc_status_changed' ? styles.eventRowStatus : '',
                    row?.eventType === 'mark' ? styles.eventRowMark : '',
                    row?.eventType === 'vbus_ovp' ? styles.eventRowOvp : '',
                    row?.eventType === 'vbus_ocp' ? styles.eventRowOcp : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{
                    gridTemplateColumns,
                    transform: `translateY(${index * rowHeightPx}px)`,
                  }}
                  onClick={(event) => {
                    handleRowClick(event, index, row)
                  }}
                >
                  {row?.kind === 'event' ? (
                    <span className={styles.eventLabel} style={{ gridColumn: `1 / ${visibleColumns.length + 1}` }}>
                      {row.timestamp ? `${row.timestamp}  ${row.messageType}` : row.messageType}
                    </span>
                  ) : (
                    visibleColumns.map((column) => (
                      <span
                        key={column.id}
                        className={[
                          column.align === 'right' ? styles.right : '',
                          column.align === 'center' ? styles.center : '',
                        ].filter(Boolean).join(' ')}
                      >
                        {row?.[column.field as DisplayColumnField] ?? ''}
                      </span>
                    ))
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </InstrumentBase>
  )
}
