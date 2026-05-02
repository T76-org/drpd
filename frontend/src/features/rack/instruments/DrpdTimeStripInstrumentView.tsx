import type { RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import logStyles from './DrpdUsbPdLogInstrumentView.module.css'

/**
 * Standalone DRPD timestrip instrument shell.
 */
export const DrpdTimeStripInstrumentView = ({
  instrument,
  displayName,
  isEditMode,
  onRemove,
}: {
  instrument: RackInstrument
  displayName: string
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
    />
  )
}
