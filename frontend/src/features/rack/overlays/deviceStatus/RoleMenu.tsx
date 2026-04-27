import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { CCBusRole } from '../../../../lib/device'
import { useRackSizingConfig } from '../../rackSizing'
import styles from '../../instruments/DrpdDeviceStatusInstrumentView.module.css'

const ROLE_MENU_Z_INDEX = 10000

export const RoleMenu = ({
  role,
  disabled,
  isUpdating,
  formatRoleLabel,
  onSelectRole,
}: {
  role: CCBusRole | null
  disabled: boolean
  isUpdating: boolean
  formatRoleLabel: (role: CCBusRole | null) => string
  onSelectRole: (role: CCBusRole) => void
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [inlineStyle, setInlineStyle] = useState<CSSProperties | undefined>(undefined)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const rackSizing = useRackSizingConfig()

  const closeMenu = () => {
    setIsOpen(false)
    setInlineStyle(undefined)
  }

  const updateLayout = useCallback(() => {
    if (!isOpen) {
      return
    }

    const button = buttonRef.current
    const menu = menuRef.current
    if (!button || !menu) {
      return
    }

    const viewportInsetPx = rackSizing.popoverViewportInsetPx
    const menuGapPx = rackSizing.popoverGapPx
    const buttonRect = button.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()
    const width = menuRect.width
    const height = menuRect.height

    let left = buttonRect.right - width
    left = Math.max(
      viewportInsetPx,
      Math.min(left, window.innerWidth - width - viewportInsetPx),
    )

    const belowTop = buttonRect.bottom + menuGapPx
    const belowSpace = window.innerHeight - belowTop - viewportInsetPx
    const aboveSpace = buttonRect.top - menuGapPx - viewportInsetPx
    const shouldOpenAbove = belowSpace < height && aboveSpace > belowSpace
    const maxHeight = Math.max(120, Math.floor(shouldOpenAbove ? aboveSpace : belowSpace))

    let top = belowTop
    if (shouldOpenAbove) {
      top = Math.max(
        viewportInsetPx,
        buttonRect.top - menuGapPx - Math.min(height, maxHeight),
      )
    } else {
      top = Math.min(top, window.innerHeight - viewportInsetPx - Math.min(height, maxHeight))
    }

    setInlineStyle({
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      maxHeight: `${Math.round(maxHeight)}px`,
      zIndex: ROLE_MENU_Z_INDEX,
    })
  }, [isOpen, rackSizing.popoverGapPx, rackSizing.popoverViewportInsetPx])

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      if (buttonRef.current?.contains(target)) {
        return
      }
      if (menuRef.current?.contains(target)) {
        return
      }
      closeMenu()
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu()
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeydown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeydown)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }
    const runLayout = () => {
      updateLayout()
    }
    runLayout()
    window.addEventListener('resize', runLayout)
    window.addEventListener('scroll', runLayout, true)
    return () => {
      window.removeEventListener('resize', runLayout)
      window.removeEventListener('scroll', runLayout, true)
    }
  }, [isOpen, updateLayout])

  return (
    <>
      <button
        type="button"
        className={styles.modeButton}
        ref={buttonRef}
        onClick={() => setIsOpen((open) => !open)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        Set
      </button>
      {isOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className={styles.modeMenu}
              role="menu"
              ref={menuRef}
              style={inlineStyle}
            >
              {Object.values(CCBusRole).map((nextRole) => {
                const isSelected = nextRole === role
                return (
                  <button
                    key={nextRole}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isSelected}
                    className={`${styles.modeMenuItem} ${
                      isSelected ? styles.modeMenuItemActive : ''
                    }`}
                    onClick={() => {
                      closeMenu()
                      onSelectRole(nextRole)
                    }}
                    disabled={isUpdating}
                  >
                    {formatRoleLabel(nextRole)}
                  </button>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
