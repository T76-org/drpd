import { useEffect, useMemo, useRef, useState } from 'react'
import { DRPDDevice } from '../../../lib/device'
import type { LoggedCapturedMessage } from '../../../lib/device'
import {
  CONTROL_MESSAGE_TYPES,
  DATA_MESSAGE_TYPES,
  EXTENDED_MESSAGE_TYPES,
} from '../../../lib/device/drpd/usb-pd/message'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import type { RackDeviceState } from '../RackRenderer'
import styles from './DrpdUsbPdLogInstrumentView.module.css'

const LOG_END_TIMESTAMP_US = (2n ** 63n) - 1n
const ROW_HEIGHT_PX = 14
const PAGE_SIZE = 200
const OVERSCAN_ROWS = 18
const COUNT_SYNC_INTERVAL_MS = 1200

type DisplayRow = {
  key: string
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

const formatMicroseconds = (value: bigint | null): string => {
  if (value === null) {
    return '--'
  }
  return `${value}`
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

const toDisplayRows = (
  pageRows: LoggedCapturedMessage[],
  previousEndTimestampUs: bigint | null,
): DisplayRow[] => {
  let previousEnd = previousEndTimestampUs
  return pageRows.map((row) => {
    const durationUs = row.endTimestampUs - row.startTimestampUs
    const deltaUs = previousEnd === null ? null : row.startTimestampUs - previousEnd
    previousEnd = row.endTimestampUs
    const senderReceiver = resolveSenderReceiver(row)
    const isValid = row.decodeResult === 0 && !row.parseError

    return {
      key: `${row.startTimestampUs.toString()}-${row.endTimestampUs.toString()}-${row.createdAtMs}`,
      startTimestampUs: row.startTimestampUs,
      endTimestampUs: row.endTimestampUs,
      timestamp: formatMicroseconds(row.startTimestampUs),
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
  deviceRecord: _deviceRecord,
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
}) => {
  void _deviceRecord

  const driver = deviceState?.drpdDriver
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const atBottomRef = useRef(true)
  const totalRowsRef = useRef(0)
  const loadingPagesRef = useRef(new Set<number>())
  const [totalRows, setTotalRows] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [pages, setPages] = useState<Map<number, DisplayRow[]>>(new Map())

  const firstVisibleRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - OVERSCAN_ROWS)
  const visibleRowCount = Math.ceil(viewportHeight / ROW_HEIGHT_PX) + OVERSCAN_ROWS * 2
  const lastVisibleRow = Math.min(totalRows - 1, firstVisibleRow + visibleRowCount)

  const visibleRows = useMemo(() => {
    const rows: Array<{ index: number; row: DisplayRow | null }> = []
    if (totalRows <= 0 || lastVisibleRow < firstVisibleRow) {
      return rows
    }
    for (let index = firstVisibleRow; index <= lastVisibleRow; index += 1) {
      const pageIndex = Math.floor(index / PAGE_SIZE)
      const rowInPageIndex = index % PAGE_SIZE
      rows.push({
        index,
        row: pages.get(pageIndex)?.[rowInPageIndex] ?? null,
      })
    }
    return rows
  }, [firstVisibleRow, lastVisibleRow, pages, totalRows])


  useEffect(() => {
    totalRowsRef.current = totalRows
  }, [totalRows])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || typeof ResizeObserver === 'undefined') {
      return undefined
    }

    const observer = new ResizeObserver((entries) => {
      const nextHeight = entries[0]?.contentRect.height ?? 0
      setViewportHeight(nextHeight)
    })

    observer.observe(viewport)
    setViewportHeight(viewport.clientHeight)

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
      if (detail?.kind !== 'message') {
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
          const previousEnd = previousPage?.[previousPage.length - 1]?.endTimestampUs ?? null
          next.set(targetPageIndex, toDisplayRows([addedRow], previousEnd))
          return next
        }

        if (targetPage.length === targetIndex) {
          const previousEnd = targetPage[targetPage.length - 1]?.endTimestampUs ?? null
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
    if (!driver || totalRows <= 0 || lastVisibleRow < firstVisibleRow) {
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
          const nextRows = toDisplayRows(pageRows, previousRow?.endTimestampUs ?? null)
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
  }, [driver, firstVisibleRow, lastVisibleRow, pages, totalRows])

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
      <div className={styles.wrapper} data-testid="drpd-usbpd-log">
        <div className={styles.headerRow}>
          <span>Timestamp</span>
          <span>Duration</span>
          <span>Δt</span>
          <span>ID</span>
          <span>Message type</span>
          <span>Sender</span>
          <span>Receiver</span>
          <span>SOP</span>
          <span>Valid</span>
        </div>
        <div
          ref={viewportRef}
          className={styles.viewport}
          onScroll={(event) => {
            const element = event.currentTarget
            setScrollTop(element.scrollTop)
            atBottomRef.current =
              element.scrollHeight - element.clientHeight - element.scrollTop <= ROW_HEIGHT_PX * 2
          }}
          data-testid="drpd-usbpd-log-viewport"
        >
          <div
            className={styles.canvas}
            style={{ height: `${Math.max(totalRows * ROW_HEIGHT_PX, 0)}px` }}
            data-testid="drpd-usbpd-log-canvas"
          >
            {visibleRows.map(({ index, row }) => (
              <div
                key={row?.key ?? `placeholder-${index}`}
                className={styles.dataRow}
                style={{ transform: `translateY(${index * ROW_HEIGHT_PX}px)` }}
              >
                <span className={styles.right}>{row?.timestamp ?? ''}</span>
                <span className={styles.right}>{row?.duration ?? ''}</span>
                <span className={styles.right}>{row?.delta ?? ''}</span>
                <span className={styles.center}>{row?.messageId ?? ''}</span>
                <span>{row?.messageType ?? ''}</span>
                <span>{row?.sender ?? ''}</span>
                <span>{row?.receiver ?? ''}</span>
                <span className={styles.center}>{row?.sopType ?? ''}</span>
                <span className={styles.center}>{row?.valid ?? ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </InstrumentBase>
  )
}
