import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { RackInstrument } from '../../lib/rack/types'
import { useRackSizingConfig } from './rackSizing'
import styles from './InstrumentBase.module.css'

const HEADER_CONTROL_POPOVER_Z_INDEX = 10000

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
  headerAccessory,
  contentClassName,
  children
}: {
  instrument: RackInstrument
  displayName: string
  isEditMode?: boolean
  onClose?: () => void
  headerControls?: InstrumentHeaderControl[]
  headerAccessory?: ReactNode
  contentClassName?: string
  children?: ReactNode
}) => {
  const [openControlId, setOpenControlId] = useState<string | null>(null)
  const [popoverInlineStyle, setPopoverInlineStyle] = useState<CSSProperties | undefined>(
    undefined,
  )
  const controlsRef = useRef<HTMLDivElement | null>(null)
  const controlButtonRefMap = useRef(new Map<string, HTMLButtonElement>())
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const rackSizing = useRackSizingConfig()

  const closePopover = useCallback(() => {
    setOpenControlId(null)
    setPopoverInlineStyle(undefined)
  }, [])

  const updatePopoverLayout = useCallback(() => {
    if (openControlId === null) {
      return
    }
    const button = controlButtonRefMap.current.get(openControlId)
    const popover = popoverRef.current
    if (!button || !popover) {
      return
    }

    const viewportInsetPx = rackSizing.popoverViewportInsetPx
    const popoverGapPx = rackSizing.popoverGapPx
    const buttonRect = button.getBoundingClientRect()
    const popoverRect = popover.getBoundingClientRect()

    const width = popoverRect.width
    const height = popoverRect.height

    let left = buttonRect.left
    left = Math.max(
      viewportInsetPx,
      Math.min(left, window.innerWidth - width - viewportInsetPx),
    )

    const belowTop = buttonRect.bottom + popoverGapPx
    const belowSpace = window.innerHeight - belowTop - viewportInsetPx
    const aboveSpace = buttonRect.top - popoverGapPx - viewportInsetPx
    const shouldOpenAbove = belowSpace < height && aboveSpace > belowSpace
    const maxHeight = Math.max(120, Math.floor(shouldOpenAbove ? aboveSpace : belowSpace))

    let top = belowTop
    if (shouldOpenAbove) {
      top = Math.max(
        viewportInsetPx,
        buttonRect.top - popoverGapPx - Math.min(height, maxHeight),
      )
    } else {
      top = Math.min(top, window.innerHeight - viewportInsetPx - Math.min(height, maxHeight))
    }

    setPopoverInlineStyle({
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      maxHeight: `${Math.round(maxHeight)}px`,
    })
  }, [openControlId, rackSizing.popoverGapPx, rackSizing.popoverViewportInsetPx])

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
      const popoverElement = popoverRef.current
      if (popoverElement && popoverElement.contains(target)) {
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

  useEffect(() => {
    if (openControlId === null) {
      return undefined
    }
    const runLayout = () => {
      updatePopoverLayout()
    }
    runLayout()
    window.addEventListener('resize', runLayout)
    window.addEventListener('scroll', runLayout, true)
    return () => {
      window.removeEventListener('resize', runLayout)
      window.removeEventListener('scroll', runLayout, true)
    }
  }, [openControlId, updatePopoverLayout])

  return (
    <div
      className={`${styles.instrument} ${isEditMode ? styles.editMode : ''}`}
      data-instrument-id={instrument.id}
      data-instrument-identifier={instrument.instrumentIdentifier}
    >
      <div className={styles.header}>
        <span className={styles.name}>{displayName}</span>
        <div className={styles.headerActions} ref={controlsRef}>
          {headerAccessory ? (
            <div className={styles.headerAccessory}>{headerAccessory}</div>
          ) : null}
          {(headerControls ?? []).map((control) => {
            const hasPopover = typeof control.renderPopover === 'function'
            const isOpen = openControlId === control.id
            return (
              <div key={control.id} className={styles.headerControl}>
                <button
                  type="button"
                  className={styles.headerControlButton}
                  ref={(element) => {
                    if (element) {
                      controlButtonRefMap.current.set(control.id, element)
                    } else {
                      controlButtonRefMap.current.delete(control.id)
                    }
                  }}
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
                  typeof document !== 'undefined'
                    ? createPortal(
                        <div
                          className={styles.headerControlPopover}
                          role="dialog"
                          ref={popoverRef}
                          style={{
                            ...popoverInlineStyle,
                            zIndex: HEADER_CONTROL_POPOVER_Z_INDEX,
                          }}
                        >
                          {control.renderPopover?.({ closePopover })}
                        </div>,
                        document.body,
                      )
                    : null
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
