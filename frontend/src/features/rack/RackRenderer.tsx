import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import type { DRPDDriverRuntime } from '../../lib/device'
import type { Instrument } from '../../lib/instrument'
import type { RackDefinition, RackDeviceRecord, RackInstrument } from '../../lib/rack/types'
import { MAX_ROW_WIDTH_UNITS } from './layout'
import { RowRenderer } from './RowRenderer'
import { InstrumentBase } from './InstrumentBase'
import styles from './RackRenderer.module.css'

const UNIT_HEIGHT_PX = 100
const RACK_ASPECT_RATIO = 16 / 10
const MIN_DISPLAY_UNITS = 6
const RETINA_BOOST_BREAKPOINTS = [
  { minDpr: 3.5, boost: 1.3 },
  { minDpr: 2.5, boost: 1.2 },
  { minDpr: 1.75, boost: 1.1 }
]

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
  const displayUnits = getDisplayUnits(rack, instrumentMap)
  const rackHeightPx = displayUnits * UNIT_HEIGHT_PX
  const rackWidthPx = rackHeightPx * RACK_ASPECT_RATIO
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  const [viewportHeightPx, setViewportHeightPx] = useState(rackHeightPx)
  const [isScaleVisible, setIsScaleVisible] = useState(false)
  const revealTimeoutRef = useRef<number | null>(null)
  const visibleRackHeightPx =
    scale > 0 ? Math.min(rackHeightPx, viewportHeightPx / scale) : rackHeightPx

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || typeof ResizeObserver === 'undefined') {
      setScale(1)
      setIsScaleVisible(true)
      return
    }

    /**
     * Compute the scale factor needed to fit the rack canvas.
     */
    const updateScale = () => {
      const { width, height } = viewport.getBoundingClientRect()
      if (width === 0 || height === 0) {
        setScale(1)
        setViewportHeightPx(rackHeightPx)
        setIsScaleVisible(true)
        return
      }
      const widthScale = width / rackWidthPx
      const retinaBoost = getRetinaBoost(window.devicePixelRatio ?? 1)
      const nextScale = widthScale * retinaBoost
      if (!Number.isFinite(nextScale) || nextScale <= 0) {
        return
      }
      const scaledHeightPx = rackHeightPx * nextScale
      const nextViewportHeightPx = Math.min(scaledHeightPx, height)

      setScale((current) => {
        if (Math.abs(current - nextScale) < 0.0001) {
          return current
        }
        return nextScale
      })
      setViewportHeightPx((current) => {
        if (Math.abs(current - nextViewportHeightPx) < 0.5) {
          return current
        }
        return nextViewportHeightPx
      })
      setIsScaleVisible(false)
      if (revealTimeoutRef.current !== null) {
        window.clearTimeout(revealTimeoutRef.current)
      }
      revealTimeoutRef.current = window.setTimeout(() => {
        setIsScaleVisible(true)
      }, 90)
    }

    updateScale()
    const observer = new ResizeObserver(() => updateScale())
    observer.observe(viewport)

    return () => {
      observer.disconnect()
      if (revealTimeoutRef.current !== null) {
        window.clearTimeout(revealTimeoutRef.current)
      }
    }
  }, [rackHeightPx, rackWidthPx])

  const fullScreenInstrument = findFullScreenInstrument(rack)

  return (
    <div className={styles.rackWrapper}>
      <div className={styles.rackBounds} ref={viewportRef}>
        <div className={styles.rackViewport} style={{ height: viewportHeightPx }}>
          <div
            className={styles.rackScroll}
            style={{
              width: rackWidthPx * scale,
              height: rackHeightPx * scale,
              visibility: isScaleVisible ? 'visible' : 'hidden'
            }}
          >
            <div
              className={styles.rackCanvas}
              style={{
                width: rackWidthPx,
                height: rackHeightPx,
                transform: `scale(${scale})`
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
                  style={{ height: visibleRackHeightPx }}
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
                        unitHeightPx={UNIT_HEIGHT_PX}
                        maxRowWidthUnits={MAX_ROW_WIDTH_UNITS}
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
 * Determine how many rack units should be visible for scaling.
 * @param rack - Rack definition.
 * @param instrumentMap - Map of instrument definitions by identifier.
 * @returns Units used to size the rack canvas.
 */
const getDisplayUnits = (
  rack: RackDefinition,
  instrumentMap: Map<string, Instrument>,
): number => {
  if (rack.rows.length === 0) {
    return Math.min(rack.totalUnits, MIN_DISPLAY_UNITS)
  }
  const contentUnits = getRackContentUnits(rack, instrumentMap)
  return Math.min(rack.totalUnits, Math.max(contentUnits, MIN_DISPLAY_UNITS))
}

/**
 * Compute the total rack units occupied by instruments.
 * @param rack - Rack definition.
 * @param instrumentMap - Map of instrument definitions by identifier.
 * @returns Total content height in units.
 */
const getRackContentUnits = (
  rack: RackDefinition,
  instrumentMap: Map<string, Instrument>,
): number => {
  return rack.rows.reduce((total, row) => {
    const rowUnits = getRowUnits(row, instrumentMap)
    return total + rowUnits
  }, 0)
}

/**
 * Compute the maximum units needed for a row.
 * @param row - Rack row.
 * @param instrumentMap - Map of instrument definitions by identifier.
 * @returns Height of the row in units.
 */
const getRowUnits = (
  row: RackDefinition['rows'][number],
  instrumentMap: Map<string, Instrument>,
): number => {
  if (row.instruments.length === 0) {
    return 0
  }
  return row.instruments.reduce((maxUnits, instrument) => {
    const definition = instrumentMap.get(instrument.instrumentIdentifier)
    const units = definition?.defaultUnits ?? 1
    return Math.max(maxUnits, units)
  }, 1)
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

/**
 * Determine the scale boost to apply on high-DPI displays.
 * @param devicePixelRatio - Current device pixel ratio.
 * @returns Scale multiplier for readability.
 */
const getRetinaBoost = (devicePixelRatio: number): number => {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) {
    return 1
  }
  const match = RETINA_BOOST_BREAKPOINTS.find(
    (entry) => devicePixelRatio >= entry.minDpr,
  )
  return match?.boost ?? 1
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
