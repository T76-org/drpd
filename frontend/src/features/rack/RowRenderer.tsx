import { Fragment, type ReactNode } from 'react'
import type { Instrument } from '../../lib/instrument'
import type { RackDeviceRecord, RackInstrument, RackRow } from '../../lib/rack/types'
import {
  resolveInstrumentFlex,
  resolveInstrumentMinimumSize,
  resolveRowFlex,
} from './layout'
import type { RackDeviceState, RackInstrumentDragPayload } from './RackRenderer'
import { InstrumentBase } from './InstrumentBase'
import { DrpdCcLinesInstrumentView } from './instruments/DrpdCcLinesInstrumentView'
import { DrpdAccumulatorInstrumentView } from './instruments/DrpdAccumulatorInstrumentView'
import { DrpdDeviceStatusInstrumentView } from './instruments/DrpdDeviceStatusInstrumentView'
import { DrpdMessageDetailInstrumentView } from './instruments/DrpdMessageDetailInstrumentView'
import { DrpdSinkControlInstrumentView } from './instruments/DrpdSinkControlInstrumentView'
import { DrpdTimeStripInstrumentView } from './instruments/DrpdTimeStripInstrumentView'
import { DrpdTriggerInstrumentView } from './instruments/DrpdTriggerInstrumentView'
import { DrpdUsbPdLogInstrumentView } from './instruments/DrpdUsbPdLogInstrumentView'
import { DrpdVbusInstrumentView } from './instruments/DrpdVbusInstrumentView'
import styles from './RowRenderer.module.css'

/**
 * Render a row with arbitrary width instruments aligned to the bottom.
 */
export const RowRenderer = ({
  row,
  rowIndex,
  instruments,
  activeDeviceRecord,
  deviceStates,
  isEditMode = false,
  onRemoveInstrument,
  onInstrumentDragStart,
  onInstrumentDragOver,
  onInstrumentDrop,
  onInstrumentDragEnd,
  onInstrumentResize,
  onUpdateDeviceConfig
}: {
  row: RackRow
  rowIndex: number
  instruments: Instrument[]
  activeDeviceRecord?: RackDeviceRecord
  deviceStates: RackDeviceState[]
  isEditMode?: boolean
  onRemoveInstrument?: (instrumentId: string) => void
  onInstrumentDragStart?: (instrumentId: string) => void
  onInstrumentDragOver?: (payload: RackInstrumentDragPayload) => void
  onInstrumentDrop?: (payload: RackInstrumentDragPayload) => void
  onInstrumentDragEnd?: () => void
  onInstrumentResize?: (payload: RackInstrumentResizePayload) => void
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
  const deviceStateMap = new Map(
    deviceStates.map((state) => [state.record.id, state]),
  )
  const rowFlex = resolveRowFlex(row)

  return (
    <div
      className={styles.row}
      style={{
        flex: `${rowFlex} 1 0`,
        alignItems: 'stretch',
      }}
      data-testid={`rack-row-${row.id}`}
      data-row-flex={rowFlex}
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
      {row.instruments.map((instrument, index) => {
        const definition = instrumentMap.get(instrument.instrumentIdentifier)
        const supportsActiveDevice = activeDeviceRecord
          ? definition?.supportedDeviceIdentifiers.includes(activeDeviceRecord.identifier) ?? false
          : false
        const deviceRecord = supportsActiveDevice ? activeDeviceRecord : undefined
        const deviceState =
          supportsActiveDevice && activeDeviceRecord
            ? deviceStateMap.get(activeDeviceRecord.id)
            : undefined
        const flex = resolveInstrumentFlex(instrument, instrumentMap)
        const { minWidth, minHeight } = resolveInstrumentMinimumSize(instrument, instrumentMap)

        return (
          <Fragment key={instrument.id}>
            {index > 0 ? (
              <InstrumentResizeHandle
                rowId={row.id}
                leftInstrumentId={row.instruments[index - 1].id}
                rightInstrumentId={instrument.id}
                leftFlex={resolveInstrumentFlex(row.instruments[index - 1], instrumentMap)}
                rightFlex={flex}
                onInstrumentResize={onInstrumentResize}
              />
            ) : null}
            <div
              className={styles.instrumentSlot}
              style={{
                flex: `${flex} 1 0`,
                minWidth,
                minHeight,
                height: '100%',
              }}
              data-testid={`rack-instrument-${instrument.id}`}
              data-rack-instrument-slot="true"
              data-flex={flex}
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
                onUpdateDeviceConfig
              })}
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}

const InstrumentResizeHandle = ({
  rowId,
  leftInstrumentId,
  rightInstrumentId,
  leftFlex,
  rightFlex,
  onInstrumentResize,
}: {
  rowId: string
  leftInstrumentId: string
  rightInstrumentId: string
  leftFlex: number
  rightFlex: number
  onInstrumentResize?: (payload: RackInstrumentResizePayload) => void
}) => {
  return (
    <div
      className={styles.instrumentResizeHandle}
      role="separator"
      aria-orientation="vertical"
      tabIndex={0}
      data-testid={`rack-instrument-resize-${leftInstrumentId}-${rightInstrumentId}`}
      onPointerDown={(event) => {
        if (!onInstrumentResize) {
          return
        }
        event.preventDefault()
        const startX = event.clientX
        const pointerId = event.pointerId
        event.currentTarget.setPointerCapture(pointerId)
        const handle = event.currentTarget
        const leftElement = handle.previousElementSibling
        const rightElement = handle.nextElementSibling
        const leftWidth = leftElement instanceof HTMLElement ? leftElement.getBoundingClientRect().width : 0
        const rightWidth = rightElement instanceof HTMLElement ? rightElement.getBoundingClientRect().width : 0
        const handlePointerMove = (moveEvent: PointerEvent) => {
          onInstrumentResize({
            rowId,
            leftInstrumentId,
            rightInstrumentId,
            delta: moveEvent.clientX - startX,
            leftFlex,
            rightFlex,
            leftSize: leftWidth,
            rightSize: rightWidth,
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

export interface RackInstrumentResizePayload {
  rowId: string
  leftInstrumentId: string
  rightInstrumentId: string
  delta: number
  leftFlex: number
  rightFlex: number
  leftSize: number
  rightSize: number
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
  onUpdateDeviceConfig
}: {
  instrument: RackInstrument
  definition?: Instrument
  deviceRecord?: RackDeviceRecord
  deviceState?: RackDeviceState
  isEditMode: boolean
  onRemove?: (instrumentId: string) => void
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
          onUpdateDeviceConfig={onUpdateDeviceConfig}
        />
      )
    case 'com.mta.drpd.trigger':
      return (
        <DrpdTriggerInstrumentView
          instrument={instrument}
          displayName={definition?.displayName ?? 'Instrument'}
          deviceRecord={deviceRecord}
          deviceState={deviceState}
          isEditMode={isEditMode}
          onRemove={onRemove}
          onUpdateDeviceConfig={onUpdateDeviceConfig}
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
    case 'com.mta.drpd.timestrip':
      return (
        <DrpdTimeStripInstrumentView
          instrument={instrument}
          displayName={definition?.displayName ?? 'Instrument'}
          deviceState={deviceState}
          isEditMode={isEditMode}
          onRemove={onRemove}
        />
      )
    case 'com.mta.drpd.message-detail':
      return (
        <DrpdMessageDetailInstrumentView
          instrument={instrument}
          displayName={definition?.displayName ?? 'Instrument'}
          deviceState={deviceState}
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
          onUpdateDeviceConfig={onUpdateDeviceConfig}
        />
      )
    case 'com.mta.drpd.charge-energy':
      return (
        <DrpdAccumulatorInstrumentView
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
