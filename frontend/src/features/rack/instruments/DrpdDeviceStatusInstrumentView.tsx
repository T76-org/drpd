import { useEffect, useState } from 'react'
import {
  CCBusRole,
  CCBusRoleStatus,
  DRPDDevice,
  OnOffState,
} from '../../../lib/device'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import type { RackDeviceState } from '../RackRenderer'
import styles from './DrpdDeviceStatusInstrumentView.module.css'

/**
 * Build a readable label for a CC bus role.
 *
 * @param role - CC bus role value.
 * @returns Human-readable role label.
 */
const formatRoleLabel = (role: CCBusRole | null): string => {
  if (!role) {
    return '--'
  }
  switch (role) {
    case CCBusRole.DISABLED:
      return 'Disabled'
    case CCBusRole.OBSERVER:
      return 'Observer'
    case CCBusRole.SOURCE:
      return 'Source'
    case CCBusRole.SINK:
      return 'Sink'
    default:
      return '--'
  }
}

/**
 * Build a readable label for the CC role status.
 *
 * @param status - CC bus role status.
 * @returns Human-readable status label.
 */
const formatRoleStatusLabel = (
  status: CCBusRoleStatus | null,
): string => {
  if (!status) {
    return '--'
  }
  switch (status) {
    case CCBusRoleStatus.UNATTACHED:
      return 'Unattached'
    case CCBusRoleStatus.SOURCE_FOUND:
      return 'Source Found'
    case CCBusRoleStatus.ATTACHED:
      return 'Attached'
    default:
      return '--'
  }
}

/**
 * Build a readable label for capture state.
 *
 * @param state - Capture enabled state.
 * @returns Human-readable capture label.
 */
const formatCaptureLabel = (state: OnOffState | null): string => {
  if (!state) {
    return '--'
  }
  return state === OnOffState.ON ? 'On' : 'Off'
}

/**
 * Device Status instrument showing role/capture controls and status.
 */
export const DrpdDeviceStatusInstrumentView = ({
  instrument,
  displayName,
  deviceRecord,
  deviceState,
  isEditMode,
  onRemove
}: {
  instrument: RackInstrument
  displayName: string
  deviceRecord?: RackDeviceRecord
  deviceState?: RackDeviceState
  isEditMode: boolean
  onRemove?: (instrumentId: string) => void
}) => {
  const driver = deviceState?.drpdDriver
  const [role, setRole] = useState<CCBusRole | null>(
    driver ? driver.getState().role ?? null : null
  )
  const [roleStatus, setRoleStatus] = useState<CCBusRoleStatus | null>(null)
  const [captureEnabled, setCaptureEnabled] = useState<OnOffState | null>(null)
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false)
  const [isRoleUpdating, setIsRoleUpdating] = useState(false)
  const [isCaptureUpdating, setIsCaptureUpdating] = useState(false)

  const closeRoleMenu = () => {
    setIsRoleMenuOpen(false)
  }

  useEffect(() => {
    if (!isRoleMenuOpen) {
      return undefined
    }

    const handleRoleMenuKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRoleMenu()
      }
    }

    window.addEventListener('keydown', handleRoleMenuKeydown)
    return () => {
      window.removeEventListener('keydown', handleRoleMenuKeydown)
    }
  }, [isRoleMenuOpen])

  useEffect(() => {
    if (!driver) {
      setRole(null)
      setRoleStatus(null)
      setCaptureEnabled(null)
      return
    }

    const handleStateUpdated = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      if (detail?.changed && !detail.changed.includes('role')) {
        return
      }
      setRole(driver.getState().role ?? null)
    }

    const handleCcBusStatusChanged = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      if (detail?.roleStatus) {
        setRoleStatus(detail.roleStatus as CCBusRoleStatus)
      } else {
        setRoleStatus(driver.getState().ccBusRoleStatus ?? null)
      }
    }

    const handleCaptureStatusChanged = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      if (detail?.captureEnabled) {
        setCaptureEnabled(detail.captureEnabled as OnOffState)
      } else {
        setCaptureEnabled(driver.getState().captureEnabled ?? null)
      }
    }

    setRole(driver.getState().role ?? null)
    setRoleStatus(driver.getState().ccBusRoleStatus ?? null)
    setCaptureEnabled(driver.getState().captureEnabled ?? null)
    driver.addEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
    driver.addEventListener(DRPDDevice.CCBUS_STATUS_CHANGED_EVENT, handleCcBusStatusChanged)
    driver.addEventListener(DRPDDevice.CAPTURE_STATUS_CHANGED_EVENT, handleCaptureStatusChanged)

    return () => {
      driver.removeEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
      driver.removeEventListener(DRPDDevice.CCBUS_STATUS_CHANGED_EVENT, handleCcBusStatusChanged)
      driver.removeEventListener(DRPDDevice.CAPTURE_STATUS_CHANGED_EVENT, handleCaptureStatusChanged)
    }
  }, [driver])

  const captureLabel = formatCaptureLabel(captureEnabled)
  const roleLabel = formatRoleLabel(role)
  const roleStatusLabel = formatRoleStatusLabel(roleStatus)
  const captureValueClass =
    captureEnabled === OnOffState.ON
      ? styles.modeValueOn
      : captureEnabled === OnOffState.OFF
        ? styles.modeValueOff
        : styles.modeValueNeutral

  const handleRoleUpdate = async (nextRole: CCBusRole) => {
    closeRoleMenu()
    if (!driver) {
      return
    }
    setIsRoleUpdating(true)
    try {
      await driver.ccBus.setRole(nextRole)
      setRole(nextRole)
    } finally {
      setIsRoleUpdating(false)
    }
  }

  const handleToggleCapture = async () => {
    if (!driver) {
      return
    }
    const nextState =
      captureEnabled === OnOffState.ON ? OnOffState.OFF : OnOffState.ON
    setIsCaptureUpdating(true)
    try {
      await driver.capture.setCaptureEnabled(nextState)
      setCaptureEnabled(nextState)
    } finally {
      setIsCaptureUpdating(false)
    }
  }

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
      <div className={styles.wrapper}>
        <section className={styles.modeSection}>
          <div className={styles.modeRow}>
            <span className={styles.modeLabel}>Role</span>
            <span className={styles.modeValue}>{roleLabel}</span>
            <div className={styles.modeAction}>
              <button
                type="button"
                className={styles.modeButton}
                onClick={() => setIsRoleMenuOpen((open) => !open)}
                disabled={!driver || isRoleUpdating}
              >
                Set
              </button>
              {isRoleMenuOpen ? (
                <div className={styles.modeMenu} role="menu">
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
                          void handleRoleUpdate(nextRole)
                        }}
                        disabled={isRoleUpdating}
                      >
                        {formatRoleLabel(nextRole)}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </div>
          <div className={styles.modeRow}>
            <span className={styles.modeLabel}>Capture</span>
            <span className={`${styles.modeValue} ${captureValueClass}`}>
              {captureLabel}
            </span>
            <div className={styles.modeAction}>
              <button
                type="button"
                className={styles.modeButton}
                onClick={() => {
                  void handleToggleCapture()
                }}
                disabled={!driver || isCaptureUpdating}
              >
                Toggle
              </button>
            </div>
          </div>
          <div className={styles.modeRow}>
            <span className={styles.modeLabel}>Status</span>
            <span className={styles.modeValue}>{roleStatusLabel}</span>
            <span className={styles.modeSpacer} />
          </div>
        </section>
      </div>
      {deviceRecord ? null : (
        <div className={styles.unassigned}>Device: Unassigned</div>
      )}
    </InstrumentBase>
  )
}
