import type { ReactNode } from 'react'
import type { RackInstrument } from '../../lib/rack/types'
import styles from './InstrumentBase.module.css'

/**
 * Base instrument frame used by all instrument UIs.
 */
export const InstrumentBase = ({
  instrument,
  displayName,
  isEditMode = false,
  onClose,
  contentClassName,
  children
}: {
  instrument: RackInstrument
  displayName: string
  isEditMode?: boolean
  onClose?: () => void
  contentClassName?: string
  children?: ReactNode
}) => {
  return (
    <div
      className={`${styles.instrument} ${isEditMode ? styles.editMode : ''}`}
      data-instrument-id={instrument.id}
      data-instrument-identifier={instrument.instrumentIdentifier}
    >
      <div className={styles.header}>
        <span className={styles.name}>{displayName}</span>
        <div className={styles.headerActions}>
          {instrument.resizable ? (
            <span className={styles.badge}>Resizable</span>
          ) : null}
          {isEditMode ? (
            <button
              type="button"
              className={styles.closeButton}
              aria-label="Remove instrument"
              onClick={(event) => {
                event.stopPropagation()
                onClose?.()
              }}
            >
              ×
            </button>
          ) : null}
        </div>
      </div>
      <div className={`${styles.content} ${contentClassName ?? ''}`}>
        {children ?? (
          <div className={styles.placeholder}>Instrument content</div>
        )}
      </div>
    </div>
  )
}
