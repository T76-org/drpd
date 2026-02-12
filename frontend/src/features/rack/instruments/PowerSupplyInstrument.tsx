import type { RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import styles from '../InstrumentBase.module.css'

/**
 * Power supply instrument UI that renders a size readout.
 */
export const PowerSupplyInstrument = ({
  instrument,
  displayName,
  allocatedWidthPx,
  allocatedHeightPx,
  allocatedWidthUnits,
  allocatedHeightUnits
}: {
  instrument: RackInstrument
  displayName: string
  allocatedWidthPx: number
  allocatedHeightPx: number
  allocatedWidthUnits: number
  allocatedHeightUnits: number
}) => {
  return (
    <InstrumentBase instrument={instrument} displayName={displayName}>
      <div className={styles.readout}>
        <div>Width: {Math.round(allocatedWidthPx)}px</div>
        <div>Height: {Math.round(allocatedHeightPx)}px</div>
        <div>
          Units: {allocatedWidthUnits}w × {allocatedHeightUnits}h
        </div>
      </div>
    </InstrumentBase>
  )
}
