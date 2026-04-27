import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useRackSizingConfig } from '../../rackSizing'
import styles from '../../instruments/DrpdMessageDetailInstrumentView.module.css'

export const FieldHelpButton = ({
  label,
  explanation,
}: {
  label: string
  explanation: string
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLSpanElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const popupId = useId()
  const [popupStyle, setPopupStyle] = useState<CSSProperties | null>(null)
  const rackSizing = useRackSizingConfig()

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current || !popupRef.current || typeof window === 'undefined') {
      return
    }

    const margin = rackSizing.popoverViewportInsetPx
    const updatePosition = () => {
      const buttonRect = buttonRef.current?.getBoundingClientRect()
      const popupRect = popupRef.current?.getBoundingClientRect()
      if (!buttonRect || !popupRect) {
        return
      }

      const maxLeft = Math.max(margin, window.innerWidth - popupRect.width - margin)
      const maxTop = Math.max(margin, window.innerHeight - popupRect.height - margin)
      const left = Math.min(Math.max(buttonRect.left, margin), maxLeft)
      const top = Math.min(Math.max(buttonRect.bottom, margin), maxTop)

      setPopupStyle({
        left: `${left}px`,
        top: `${top}px`,
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen, rackSizing.popoverViewportInsetPx])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        !containerRef.current?.contains(target) &&
        !popupRef.current?.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <span className={styles.fieldHelp} ref={containerRef}>
      <button
        type="button"
        ref={buttonRef}
        className={styles.fieldHelpButton}
        aria-label={`Show description for ${label}`}
        aria-expanded={isOpen}
        aria-controls={isOpen ? popupId : undefined}
        onClick={() => {
          setIsOpen((current) => !current)
        }}
      >
        <span className={styles.fieldHelpButtonIcon} aria-hidden="true">
          ?
        </span>
      </button>
      {isOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className={styles.fieldHelpPopup}
              id={popupId}
              ref={popupRef}
              role="dialog"
              aria-label={`${label} description`}
              style={popupStyle ?? { visibility: 'hidden' }}
            >
              <p className={styles.fieldHelpPopupText}>{explanation}</p>
            </div>,
            document.body,
          )
        : null}
    </span>
  )
}
