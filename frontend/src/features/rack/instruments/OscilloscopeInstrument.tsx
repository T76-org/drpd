import type { RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import styles from '../InstrumentBase.module.css'

/**
 * Oscilloscope instrument UI that renders a size readout.
 */
export const OscilloscopeInstrument = ({
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
        <div>Plot area fits {Math.round(allocatedWidthPx)}px wide</div>
        <div>Trace stack fits {Math.round(allocatedHeightPx)}px tall</div>
        <div>
          Units: {allocatedWidthUnits}w × {allocatedHeightUnits}h
        </div>
      </div>
    </InstrumentBase>
  )
}
