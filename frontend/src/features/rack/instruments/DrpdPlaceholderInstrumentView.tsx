import type { RackInstrument, RackDeviceRecord } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import styles from '../InstrumentBase.module.css'
import type { RackDeviceState } from '../RackRenderer'

/**
 * Minimal placeholder UI for a Dr. PD compatible instrument.
 */
export const DrpdPlaceholderInstrumentView = ({
  instrument,
  displayName,
  deviceRecord,
  deviceState,
  isEditMode,
  onRemove,
  allocatedWidthPx,
  allocatedHeightPx,
  allocatedWidthUnits,
  allocatedHeightUnits
}: {
  instrument: RackInstrument
  displayName: string
  deviceRecord?: RackDeviceRecord
  deviceState?: RackDeviceState
  isEditMode: boolean
  onRemove?: (instrumentId: string) => void
  allocatedWidthPx: number
  allocatedHeightPx: number
  allocatedWidthUnits: number
  allocatedHeightUnits: number
}) => {
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
      <div className={styles.readout}>
        <div>
          Device:{' '}
          {deviceRecord ? deviceRecord.displayName : 'Unassigned'}
        </div>
        <div>
          Status:{' '}
          {deviceState ? deviceState.status : 'Unknown'}
        </div>
        <div>Width: {Math.round(allocatedWidthPx)}px</div>
        <div>Height: {Math.round(allocatedHeightPx)}px</div>
        <div>
          Units: {allocatedWidthUnits}w × {allocatedHeightUnits}h
        </div>
      </div>
    </InstrumentBase>
  )
}
