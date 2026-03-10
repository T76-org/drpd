import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import type { DRPDDriverRuntime } from '../../lib/device'
import type { Instrument } from '../../lib/instrument'
import type { RackDefinition, RackDeviceRecord, RackInstrument } from '../../lib/rack/types'
import { getRackCanvasSize } from './rackCanvasSize'
import { useRackSizingConfig } from './rackSizing'
import { RowRenderer } from './RowRenderer'
import { InstrumentBase } from './InstrumentBase'
import styles from './RackRenderer.module.css'

/**
 * Render a single rack definition as a column of rows.
 */
export const RackRenderer = ({
  rack,
  instruments,
  deviceStates,
  isEditMode = false,
  onRemoveInstrument,
  onInstrumentDragStart,
  onInstrumentDragOver,
  onInstrumentDrop,
  onInstrumentDragEnd,
  onUpdateDeviceConfig
}: {
  rack: RackDefinition
  instruments: Instrument[]
  deviceStates: RackDeviceState[]
  isEditMode?: boolean
  onRemoveInstrument?: (instrumentId: string) => void
  onInstrumentDragStart?: (instrumentId: string) => void
  onInstrumentDragOver?: (payload: RackInstrumentDragPayload) => void
  onInstrumentDrop?: (payload: RackInstrumentDragPayload) => void
  onInstrumentDragEnd?: () => void
  onUpdateDeviceConfig?: (
    deviceRecordId: string,
    updater: (current: Record<string, unknown> | undefined) => Record<string, unknown>,
  ) => Promise<void> | void
}) => {
  const instrumentMap = new Map(
    instruments.map((instrument) => [instrument.identifier, instrument]),
  )
  const rackSizing = useRackSizingConfig()
  const { rackHeightPx, rackWidthPx } = getRackCanvasSize(rack, instruments, rackSizing)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [viewportHeightPx, setViewportHeightPx] = useState(0)

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }
    const updateViewportHeight = () => {
      setViewportHeightPx(viewport.clientHeight)
    }
    updateViewportHeight()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const [entry] = entries
      if (entry?.contentRect?.height) {
        setViewportHeightPx(entry.contentRect.height)
        return
      }
      updateViewportHeight()
    })
    observer.observe(viewport)
    return () => {
      observer.disconnect()
    }
  }, [])

  const fullScreenInstrument = findFullScreenInstrument(rack)
  const shouldAllowVerticalScroll =
    viewportHeightPx > 0 && viewportHeightPx < rackHeightPx
  const renderedRackHeightPx =
    viewportHeightPx > 0 ? Math.min(rackHeightPx, viewportHeightPx) : rackHeightPx

  return (
    <div className={styles.rackWrapper}>
      <div className={styles.rackBounds}>
        <div
          ref={viewportRef}
          className={styles.rackViewport}
          data-scroll-mode={shouldAllowVerticalScroll ? 'scroll' : 'fit'}
        >
          <div
            className={styles.rackScroll}
            style={{
              width: rackWidthPx,
              minHeight: renderedRackHeightPx,
              height: renderedRackHeightPx,
            }}
          >
            <div>
              <div
                className={styles.rackCanvas}
                style={{
                  width: rackWidthPx,
                  minHeight: renderedRackHeightPx,
                  height: renderedRackHeightPx,
                  overflowY: shouldAllowVerticalScroll ? 'auto' : 'hidden',
                }}
                data-rack-width={Math.round(rackWidthPx)}
                data-rack-height={rackHeightPx}
              >
                {fullScreenInstrument ? (
                  <div className={styles.fullScreenOverlay} data-testid="rack-fullscreen">
                    <div className={styles.fullScreenFrame}>
                      <InstrumentBase
                        instrument={fullScreenInstrument}
                        displayName={
                          instrumentMap.get(fullScreenInstrument.instrumentIdentifier)
                            ?.displayName ?? 'Instrument'
                        }
                      >
                        <div className={styles.fullScreenContent}>
                          Full-screen:{' '}
                          {instrumentMap.get(fullScreenInstrument.instrumentIdentifier)
                            ?.displayName ?? 'Instrument'}
                        </div>
                      </InstrumentBase>
                    </div>
                  </div>
                ) : null}
                {!fullScreenInstrument ? (
                  <div
                    className={styles.rows}
                    style={{ height: renderedRackHeightPx }}
                    data-testid="rack-rows"
                  >
                    {isEditMode ? (
                      <RowInsertionZone
                        rowIndex={0}
                        label="Drop to insert row"
                        onInstrumentDragOver={onInstrumentDragOver}
                        onInstrumentDrop={onInstrumentDrop}
                      />
                    ) : null}
                    {rack.rows.map((row, rowIndex) => (
                      <Fragment key={row.id}>
                        <RowRenderer
                          row={row}
                          rowIndex={rowIndex}
                          rackWidthPx={rackWidthPx}
                          unitHeightPx={rackSizing.unitHeightPx}
                          maxRowWidthUnits={rackSizing.maxRowWidthUnits}
                          instruments={instruments}
                          deviceStates={deviceStates}
                          rackDevices={rack.devices ?? []}
                          isEditMode={isEditMode}
                          onRemoveInstrument={onRemoveInstrument}
                          onInstrumentDragStart={onInstrumentDragStart}
                          onInstrumentDragOver={onInstrumentDragOver}
                          onInstrumentDrop={onInstrumentDrop}
                          onInstrumentDragEnd={onInstrumentDragEnd}
                          onUpdateDeviceConfig={onUpdateDeviceConfig}
                        />
                        {isEditMode ? (
                          <RowInsertionZone
                            rowIndex={rowIndex + 1}
                            label="Drop to insert row"
                            onInstrumentDragOver={onInstrumentDragOver}
                            onInstrumentDrop={onInstrumentDrop}
                          />
                        ) : null}
                      </Fragment>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Drop zone between rows for creating a new row.
 */
const RowInsertionZone = ({
  rowIndex,
  label,
  onInstrumentDragOver,
  onInstrumentDrop
}: {
  rowIndex: number
  label: string
  onInstrumentDragOver?: (payload: RackInstrumentDragPayload) => void
  onInstrumentDrop?: (payload: RackInstrumentDragPayload) => void
}) => {
  return (
    <div
      className={styles.rowInsertionZone}
      data-testid={`rack-row-insert-${rowIndex}`}
      onDragOver={(event) => {
        event.preventDefault()
        onInstrumentDragOver?.({
          targetKind: 'new-row',
          rowIndex,
          clientX: event.clientX,
          clientY: event.clientY
        })
      }}
      onDrop={(event) => {
        event.preventDefault()
        onInstrumentDrop?.({
          targetKind: 'new-row',
          rowIndex,
          clientX: event.clientX,
          clientY: event.clientY
        })
      }}
    >
      {label}
    </div>
  )
}

/**
 * Find the first instrument marked as full-screen in the rack definition.
 */
const findFullScreenInstrument = (
  rack: RackDefinition,
): RackInstrument | null => {
  for (const row of rack.rows) {
    for (const instrument of row.instruments) {
      if (instrument.fullScreen) {
        return instrument
      }
    }
  }
  return null
}

export interface RackDeviceState {
  ///< Rack device record for this runtime state.
  record: RackDeviceRecord
  ///< Connection status.
  status: 'connected' | 'disconnected' | 'available' | 'missing' | 'error'
  ///< Optional connection error text.
  error?: string
  ///< Active DRPD driver instance, if available.
  drpdDriver?: DRPDDriverRuntime
  ///< Active transport-like runtime, if available.
  transport?: { close(): Promise<void> }
}

/**
 * Drag payload for instrument layout edits.
 */
export interface RackInstrumentDragPayload {
  ///< Target kind for this drag event.
  targetKind: 'row' | 'new-row'
  ///< Target row id for row insertion behavior.
  rowId?: string
  ///< Target row index for drop behavior.
  rowIndex: number
  ///< In-row insertion index for row drops.
  insertIndex?: number
  ///< Pointer X coordinate.
  clientX: number
  ///< Pointer Y coordinate.
  clientY: number
}
