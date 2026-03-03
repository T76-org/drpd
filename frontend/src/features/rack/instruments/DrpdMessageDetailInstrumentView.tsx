import type { RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'

/**
 * Message detail instrument shell.
 */
export const DrpdMessageDetailInstrumentView = ({
  instrument,
  displayName,
  isEditMode,
  onRemove
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
      onClose={
        onRemove
          ? () => {
              onRemove(instrument.id)
            }
          : undefined
      }
    >
      <div />
    </InstrumentBase>
  )
}
