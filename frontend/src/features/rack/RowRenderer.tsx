import type { ReactNode } from 'react'
import type { Instrument } from '../../lib/instrument'
import type { RackDeviceRecord, RackInstrument, RackRow } from '../../lib/rack/types'
import {
  allocateRowInstrumentWidths,
  MAX_ROW_WIDTH_UNITS,
  type RowInstrumentWidthAllocation
} from './layout'
import type { RackDeviceState, RackInstrumentDragPayload } from './RackRenderer'
import { InstrumentBase } from './InstrumentBase'
import { DrpdCcLinesInstrumentView } from './instruments/DrpdCcLinesInstrumentView'
import { DrpdDeviceStatusInstrumentView } from './instruments/DrpdDeviceStatusInstrumentView'
import { DrpdMessageDetailInstrumentView } from './instruments/DrpdMessageDetailInstrumentView'
import { DrpdSinkControlInstrumentView } from './instruments/DrpdSinkControlInstrumentView'
import { DrpdUsbPdLogInstrumentView } from './instruments/DrpdUsbPdLogInstrumentView'
import { DrpdVbusInstrumentView } from './instruments/DrpdVbusInstrumentView'
import { DrpdPlaceholderInstrumentView } from './instruments/DrpdPlaceholderInstrumentView'
import styles from './RowRenderer.module.css'

/**
 * Render a row with arbitrary width instruments aligned to the bottom.
 */
export const RowRenderer = ({
  row,
  rowIndex,
  rackWidthPx,
  unitHeightPx,
  maxRowWidthUnits = MAX_ROW_WIDTH_UNITS,
  instruments,
  rackDevices,
  deviceStates,
  isEditMode = false,
  onRemoveInstrument,
  onInstrumentDragStart,
  onInstrumentDragOver,
  onInstrumentDrop,
  onInstrumentDragEnd,
  onUpdateDeviceConfig
}: {
  row: RackRow
  rowIndex: number
  rackWidthPx: number
  unitHeightPx: number
  maxRowWidthUnits?: number
  instruments: Instrument[]
  rackDevices: RackDeviceRecord[]
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
  const instrumentMap = new Map(instruments.map((instrument) => [instrument.identifier, instrument]))
  const drpdVbusInstrument = instrumentMap.get('com.mta.drpd.vbus')
  if (drpdVbusInstrument && !instrumentMap.has('com.mta.drpd.device-status')) {
    // Legacy identifier support for saved rack documents created before the rename.
    instrumentMap.set('com.mta.drpd.device-status', drpdVbusInstrument)
  }
  const deviceMap = new Map(rackDevices.map((device) => [device.id, device]))
  const deviceStateMap = new Map(
    deviceStates.map((state) => [state.record.id, state]),
  )
  const maxUnits = Math.max(
    1,
    ...row.instruments.map((instrument) => {
      const definition = instrumentMap.get(instrument.instrumentIdentifier)
      return definition?.defaultUnits ?? 1
    }),
  )
  const rowMinHeightPx = maxUnits * unitHeightPx
  const hasVerticalFlexInstrument = row.instruments.some((instrument) => {
    const definition = instrumentMap.get(instrument.instrumentIdentifier)
    return definition?.defaultHeightMode === 'flex'
  })
  const widthAllocations = allocateRowInstrumentWidths(
    row,
    instrumentMap,
    maxRowWidthUnits,
  )
  const allocationMap = new Map(
    (widthAllocations ?? buildFallbackAllocations(row, maxRowWidthUnits)).map(
      (allocation) => [allocation.instrumentId, allocation],
    ),
  )
  const unitWidthPx = rackWidthPx / maxRowWidthUnits
  const rowStyle = hasVerticalFlexInstrument
    ? {
        minHeight: rowMinHeightPx,
        flex: '1 1 0' as const,
        alignItems: 'flex-start' as const
      }
    : {
        minHeight: rowMinHeightPx,
        height: rowMinHeightPx,
        flex: '0 0 auto' as const,
        alignItems: 'flex-end' as const
      }

  return (
    <div
      className={styles.row}
      style={rowStyle}
      data-testid={`rack-row-${row.id}`}
      data-row-height={rowMinHeightPx}
      onDragOver={(event) => {
        if (!isEditMode) {
          return
        }
        event.preventDefault()
        const insertIndex = getInsertIndexFromPointer(
          event.currentTarget,
          event.clientX,
        )
        onInstrumentDragOver?.({
          targetKind: 'row',
          rowId: row.id,
          rowIndex,
          insertIndex,
          clientX: event.clientX,
          clientY: event.clientY
        })
      }}
      onDrop={(event) => {
        if (!isEditMode) {
          return
        }
        event.preventDefault()
        const insertIndex = getInsertIndexFromPointer(
          event.currentTarget,
          event.clientX,
        )
        onInstrumentDrop?.({
          targetKind: 'row',
          rowId: row.id,
          rowIndex,
          insertIndex,
          clientX: event.clientX,
          clientY: event.clientY
        })
      }}
    >
      {row.instruments.map((instrument) => {
        const definition = instrumentMap.get(instrument.instrumentIdentifier)
        const deviceRecord = instrument.deviceRecordId
          ? deviceMap.get(instrument.deviceRecordId)
          : undefined
        const deviceState = instrument.deviceRecordId
          ? deviceStateMap.get(instrument.deviceRecordId)
          : undefined
        const allocation = allocationMap.get(instrument.id)
        const allocatedWidthUnits = allocation?.widthUnits ?? 1
        const allocatedHeightUnits = definition?.defaultUnits ?? 1
        const allocatedWidthPx = allocatedWidthUnits * unitWidthPx
        const allocatedHeightPx = allocatedHeightUnits * unitHeightPx
        const isVerticalFlex = definition?.defaultHeightMode === 'flex'

        return (
          <div
            key={instrument.id}
            className={styles.instrumentSlot}
            style={{
              width: allocatedWidthPx,
              height: isVerticalFlex ? '100%' : allocatedHeightPx
            }}
            data-testid={`rack-instrument-${instrument.id}`}
            data-rack-instrument-slot="true"
            data-width-units={allocatedWidthUnits}
            draggable={isEditMode}
            onDragStart={(event) => {
              if (!isEditMode) {
                return
              }
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', instrument.id)
              onInstrumentDragStart?.(instrument.id)
            }}
            onDragEnd={() => {
              if (!isEditMode) {
                return
              }
              onInstrumentDragEnd?.()
            }}
          >
            {renderInstrument({
              instrument,
              definition,
              deviceRecord,
              deviceState,
              isEditMode,
              onRemove: onRemoveInstrument,
              allocatedWidthPx,
              allocatedHeightPx,
              allocatedWidthUnits,
              allocatedHeightUnits,
              onUpdateDeviceConfig
            })}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Build equal-width fallback allocations when row data is invalid.
 *
 * @param row - Rack row.
 * @param maxRowWidthUnits - Maximum row width.
 * @returns Equal allocations across all instruments.
 */
const buildFallbackAllocations = (
  row: RackRow,
  maxRowWidthUnits: number,
): RowInstrumentWidthAllocation[] => {
  if (row.instruments.length === 0) {
    return []
  }
  const fallbackWidth = maxRowWidthUnits / row.instruments.length
  return row.instruments.map((instrument) => ({
    instrumentId: instrument.id,
    widthUnits: fallbackWidth
  }))
}

/**
 * Resolve insertion index in a row from the current pointer x-position.
 *
 * @param rowElement - Row element containing instrument slots.
 * @param clientX - Current pointer x-coordinate.
 * @returns Insertion index in row order.
 */
const getInsertIndexFromPointer = (
  rowElement: HTMLDivElement,
  clientX: number,
): number => {
  const slotElements = Array.from(
    rowElement.querySelectorAll<HTMLElement>('[data-rack-instrument-slot="true"]'),
  )
  if (slotElements.length === 0) {
    return 0
  }
  for (const [index, slotElement] of slotElements.entries()) {
    const rect = slotElement.getBoundingClientRect()
    const midpoint = rect.left + rect.width / 2
    if (clientX < midpoint) {
      return index
    }
  }
  return slotElements.length
}

/**
 * Render a concrete instrument implementation when available.
 */
const renderInstrument = ({
  instrument,
  definition,
  deviceRecord,
  deviceState,
  isEditMode,
  onRemove,
  allocatedWidthPx,
  allocatedHeightPx,
  allocatedWidthUnits,
  allocatedHeightUnits,
  onUpdateDeviceConfig
}: {
  instrument: RackInstrument
  definition?: Instrument
  deviceRecord?: RackDeviceRecord
  deviceState?: RackDeviceState
  isEditMode: boolean
  onRemove?: (instrumentId: string) => void
  allocatedWidthPx: number
  allocatedHeightPx: number
  allocatedWidthUnits: number
  allocatedHeightUnits: number
  onUpdateDeviceConfig?: (
    deviceRecordId: string,
    updater: (current: Record<string, unknown> | undefined) => Record<string, unknown>,
  ) => Promise<void> | void
}): ReactNode => {
  switch (instrument.instrumentIdentifier) {
    case 'com.mta.drpd.sink-control':
      return (
        <DrpdSinkControlInstrumentView
          instrument={instrument}
          displayName={definition?.displayName ?? 'Instrument'}
          deviceRecord={deviceRecord}
          deviceState={deviceState}
          isEditMode={isEditMode}
          onRemove={onRemove}
        />
      )
    case 'com.mta.drpd.usbpd-log':
      return (
        <DrpdUsbPdLogInstrumentView
          instrument={instrument}
          displayName={definition?.displayName ?? 'Instrument'}
          deviceRecord={deviceRecord}
          deviceState={deviceState}
          isEditMode={isEditMode}
          onRemove={onRemove}
          onUpdateDeviceConfig={onUpdateDeviceConfig}
        />
      )
    case 'com.mta.drpd.message-detail':
      return (
        <DrpdMessageDetailInstrumentView
          instrument={instrument}
          displayName={definition?.displayName ?? 'Instrument'}
          isEditMode={isEditMode}
          onRemove={onRemove}
        />
      )
    case 'com.mta.drpd.vbus':
    case 'com.mta.drpd.device-status':
      return (
        <DrpdVbusInstrumentView
          instrument={instrument}
          displayName={definition?.displayName ?? 'Instrument'}
          deviceRecord={deviceRecord}
          deviceState={deviceState}
          isEditMode={isEditMode}
          onRemove={onRemove}
        />
      )
    case 'com.mta.drpd.device-status-panel':
      return (
        <DrpdDeviceStatusInstrumentView
          instrument={instrument}
          displayName={definition?.displayName ?? 'Instrument'}
          deviceRecord={deviceRecord}
          deviceState={deviceState}
          isEditMode={isEditMode}
          onRemove={onRemove}
        />
      )
    case 'com.mta.drpd.cc-lines':
      return (
        <DrpdCcLinesInstrumentView
          instrument={instrument}
          displayName={definition?.displayName ?? 'Instrument'}
          deviceRecord={deviceRecord}
          deviceState={deviceState}
          isEditMode={isEditMode}
          onRemove={onRemove}
        />
      )
    case 'com.mta.drpd.placeholder':
      return (
        <DrpdPlaceholderInstrumentView
          instrument={instrument}
          displayName={definition?.displayName ?? 'Instrument'}
          deviceRecord={deviceRecord}
          deviceState={deviceState}
          isEditMode={isEditMode}
          onRemove={onRemove}
          allocatedWidthPx={allocatedWidthPx}
          allocatedHeightPx={allocatedHeightPx}
          allocatedWidthUnits={allocatedWidthUnits}
          allocatedHeightUnits={allocatedHeightUnits}
        />
      )
    default:
      return (
        <InstrumentBase
          instrument={{
            id: instrument.id,
            instrumentIdentifier: instrument.instrumentIdentifier,
            resizable: instrument.resizable,
            fullScreen: instrument.fullScreen
          }}
          displayName={definition?.displayName ?? 'Instrument'}
          isEditMode={isEditMode}
          onClose={
            onRemove
              ? () => {
                  onRemove(instrument.id)
                }
              : undefined
          }
        >
          <div className={styles.placeholderLabel}>
            {definition?.displayName ?? 'Instrument'}
          </div>
        </InstrumentBase>
      )
  }
}
