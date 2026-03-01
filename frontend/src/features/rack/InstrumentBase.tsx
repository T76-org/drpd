import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { RackInstrument } from '../../lib/rack/types'
import styles from './InstrumentBase.module.css'

export interface InstrumentHeaderPopoverRenderContext {
  closePopover: () => void
}

export interface InstrumentHeaderControl {
  id: string
  label: string
  disabled?: boolean
  onClick?: () => void
  renderPopover?: (context: InstrumentHeaderPopoverRenderContext) => ReactNode
}

/**
 * Base instrument frame used by all instrument UIs.
 */
export const InstrumentBase = ({
  instrument,
  displayName,
  isEditMode = false,
  onClose,
  headerControls,
  contentClassName,
  children
}: {
  instrument: RackInstrument
  displayName: string
  isEditMode?: boolean
  onClose?: () => void
  headerControls?: InstrumentHeaderControl[]
  contentClassName?: string
  children?: ReactNode
}) => {
  const [openControlId, setOpenControlId] = useState<string | null>(null)
  const controlsRef = useRef<HTMLDivElement | null>(null)

  const closePopover = useCallback(() => {
    setOpenControlId(null)
  }, [])

  useEffect(() => {
    const controlsElement = controlsRef.current
    if (!controlsElement || openControlId === null) {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      if (controlsElement.contains(target)) {
        return
      }
      closePopover()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closePopover()
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closePopover, openControlId])

  return (
    <div
      className={`${styles.instrument} ${isEditMode ? styles.editMode : ''}`}
      data-instrument-id={instrument.id}
      data-instrument-identifier={instrument.instrumentIdentifier}
    >
      <div className={styles.header}>
        <span className={styles.name}>{displayName}</span>
        <div className={styles.headerActions} ref={controlsRef}>
          {(headerControls ?? []).map((control) => {
            const hasPopover = typeof control.renderPopover === 'function'
            const isOpen = openControlId === control.id
            return (
              <div key={control.id} className={styles.headerControl}>
                <button
                  type="button"
                  className={styles.headerControlButton}
                  disabled={control.disabled}
                  aria-haspopup={hasPopover ? 'dialog' : undefined}
                  aria-expanded={hasPopover ? isOpen : undefined}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (hasPopover) {
                      setOpenControlId((previous) =>
                        previous === control.id ? null : control.id,
                      )
                      return
                    }
                    control.onClick?.()
                    closePopover()
                  }}
                >
                  {control.label}
                </button>
                {hasPopover && isOpen ? (
                  <div className={styles.headerControlPopover} role="dialog">
                    {control.renderPopover?.({ closePopover })}
                  </div>
                ) : null}
              </div>
            )
          })}
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
