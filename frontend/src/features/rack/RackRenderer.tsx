import { Fragment } from 'react'
import type { DRPDDriverRuntime } from '../../lib/device'
import type { Instrument } from '../../lib/instrument'
import type { RackDefinition, RackDeviceRecord, RackInstrument } from '../../lib/rack/types'
import { MAX_ROW_WIDTH_UNITS } from './layout'
import { getRackCanvasSize, RACK_UNIT_HEIGHT_PX } from './rackCanvasSize'
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
  const { rackHeightPx, rackWidthPx } = getRackCanvasSize(rack, instruments)

  const fullScreenInstrument = findFullScreenInstrument(rack)

  return (
    <div className={styles.rackWrapper}>
      <div className={styles.rackBounds}>
        <div className={styles.rackViewport}>
          <div
            className={styles.rackScroll}
            style={{
              width: rackWidthPx,
              height: rackHeightPx
            }}
          >
            <div
              className={styles.rackCanvas}
              style={{
                width: rackWidthPx,
                height: rackHeightPx
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
                  style={{ height: rackHeightPx }}
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
                        unitHeightPx={RACK_UNIT_HEIGHT_PX}
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
