import { Fragment } from 'react'
import type { DRPDDriverRuntime } from '../../lib/device'
import type { Instrument } from '../../lib/instrument'
import type { RackDefinition, RackDeviceRecord, RackInstrument } from '../../lib/rack/types'
import { resolveRowFlex } from './layout'
import { RowRenderer, type RackInstrumentResizePayload } from './RowRenderer'
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
  onInstrumentResize,
  onRowResize,
  onUpdateDeviceConfig,
  activeDeviceRecord
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
  onInstrumentResize?: (payload: RackInstrumentResizePayload) => void
  onRowResize?: (payload: RackRowResizePayload) => void
  onUpdateDeviceConfig?: (
    deviceRecordId: string,
    updater: (current: Record<string, unknown> | undefined) => Record<string, unknown>,
  ) => Promise<void> | void
  activeDeviceRecord?: RackDeviceRecord
}) => {
  const instrumentMap = new Map(
    instruments.map((instrument) => [instrument.identifier, instrument]),
  )
  const fullScreenInstrument = findFullScreenInstrument(rack)

  return (
    <div className={styles.rackWrapper}>
      <div className={styles.rackBounds}>
        <div
          className={styles.rackViewport}
          data-scroll-mode="fit"
        >
          <div className={styles.rackScroll}>
            <div
              className={styles.rackCanvas}
              data-rack-canvas="true"
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
                        instruments={instruments}
                        deviceStates={deviceStates}
                        activeDeviceRecord={activeDeviceRecord}
                        isEditMode={isEditMode}
                        onRemoveInstrument={onRemoveInstrument}
                        onInstrumentDragStart={onInstrumentDragStart}
                        onInstrumentDragOver={onInstrumentDragOver}
                        onInstrumentDrop={onInstrumentDrop}
                        onInstrumentDragEnd={onInstrumentDragEnd}
                        onInstrumentResize={onInstrumentResize}
                        onUpdateDeviceConfig={onUpdateDeviceConfig}
                      />
                      {rowIndex < rack.rows.length - 1 ? (
                        <RowResizeHandle
                          upperRowId={row.id}
                          lowerRowId={rack.rows[rowIndex + 1].id}
                          upperFlex={resolveRowFlex(row)}
                          lowerFlex={resolveRowFlex(rack.rows[rowIndex + 1])}
                          onRowResize={onRowResize}
                        />
                      ) : null}
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

const RowResizeHandle = ({
  upperRowId,
  lowerRowId,
  upperFlex,
  lowerFlex,
  onRowResize,
}: {
  upperRowId: string
  lowerRowId: string
  upperFlex: number
  lowerFlex: number
  onRowResize?: (payload: RackRowResizePayload) => void
}) => {
  return (
    <div
      className={styles.rowResizeHandle}
      role="separator"
      aria-orientation="horizontal"
      tabIndex={0}
      data-testid={`rack-row-resize-${upperRowId}-${lowerRowId}`}
      onPointerDown={(event) => {
        if (!onRowResize) {
          return
        }
        event.preventDefault()
        const startY = event.clientY
        const pointerId = event.pointerId
        const handle = event.currentTarget
        handle.setPointerCapture(pointerId)
        const upperElement = handle.previousElementSibling
        const lowerElement = handle.nextElementSibling
        const upperHeight = upperElement instanceof HTMLElement ? upperElement.getBoundingClientRect().height : 0
        const lowerHeight = lowerElement instanceof HTMLElement ? lowerElement.getBoundingClientRect().height : 0
        const handlePointerMove = (moveEvent: PointerEvent) => {
          onRowResize({
            upperRowId,
            lowerRowId,
            delta: moveEvent.clientY - startY,
            upperFlex,
            lowerFlex,
            upperSize: upperHeight,
            lowerSize: lowerHeight,
          })
        }
        const handlePointerUp = () => {
          handle.removeEventListener('pointermove', handlePointerMove)
          handle.removeEventListener('pointerup', handlePointerUp)
          handle.removeEventListener('pointercancel', handlePointerUp)
          if (handle.hasPointerCapture(pointerId)) {
            handle.releasePointerCapture(pointerId)
          }
        }
        handle.addEventListener('pointermove', handlePointerMove)
        handle.addEventListener('pointerup', handlePointerUp)
        handle.addEventListener('pointercancel', handlePointerUp)
      }}
    />
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
  ///< Underlying WebUSB device, if available.
  usbDevice?: USBDevice
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

export interface RackRowResizePayload {
  ///< Row above the dragged splitter.
  upperRowId: string
  ///< Row below the dragged splitter.
  lowerRowId: string
  ///< Incremental pointer movement.
  delta: number
  ///< Starting flex for the upper row.
  upperFlex: number
  ///< Starting flex for the lower row.
  lowerFlex: number
  ///< Starting rendered height for the upper row.
  upperSize: number
  ///< Starting rendered height for the lower row.
  lowerSize: number
}
