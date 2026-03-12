import type { RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import type { RackDeviceState } from '../RackRenderer'
import logStyles from './DrpdUsbPdLogInstrumentView.module.css'
import { DrpdUsbPdLogTimeStrip } from './DrpdUsbPdLogTimeStrip'

/**
 * Standalone DRPD timestrip instrument view.
 */
export const DrpdTimeStripInstrumentView = ({
  instrument,
  displayName,
  deviceState,
  isEditMode,
  onRemove,
}: {
  instrument: RackInstrument
  displayName: string
  deviceState?: RackDeviceState
  isEditMode: boolean
  onRemove?: (instrumentId: string) => void
}) => {
  return (
    <InstrumentBase
      instrument={instrument}
      displayName={displayName}
      isEditMode={isEditMode}
      contentClassName={logStyles.contentFill}
      onClose={
        onRemove
          ? () => {
              onRemove(instrument.id)
            }
          : undefined
      }
    >
      <DrpdUsbPdLogTimeStrip
        driver={deviceState?.drpdDriver}
        isEditMode={isEditMode}
      />
    </InstrumentBase>
  )
}
