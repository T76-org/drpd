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
import { RoleMenu } from '../overlays/deviceStatus/RoleMenu'
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
  onRemove,
  onUpdateDeviceConfig,
}: {
  instrument: RackInstrument
  displayName: string
  deviceRecord?: RackDeviceRecord
  deviceState?: RackDeviceState
  isEditMode: boolean
  onRemove?: (instrumentId: string) => void
  onUpdateDeviceConfig?: (
    deviceRecordId: string,
    updater: (current: Record<string, unknown> | undefined) => Record<string, unknown>,
  ) => Promise<void> | void
}) => {
  const driver = deviceState?.drpdDriver
  const [role, setRole] = useState<CCBusRole | null>(
    driver ? driver.getState().role ?? null : null
  )
  const [roleStatus, setRoleStatus] = useState<CCBusRoleStatus | null>(null)
  const [captureEnabled, setCaptureEnabled] = useState<OnOffState | null>(null)
  const [isRoleUpdating, setIsRoleUpdating] = useState(false)
  const [isCaptureUpdating, setIsCaptureUpdating] = useState(false)

  useEffect(() => {
    if (!driver) {
      setRole(null)
      setRoleStatus(null)
      setCaptureEnabled(null)
      return
    }

    const handleStateUpdated = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      if (
        detail?.changed &&
        !detail.changed.includes('role') &&
        !detail.changed.includes('captureEnabled')
      ) {
        return
      }
      const state = driver.getState()
      setRole(state.role ?? null)
      setCaptureEnabled(state.captureEnabled ?? null)
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
      } else if (detail?.current) {
        setCaptureEnabled(detail.current as OnOffState)
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
    if (!driver) {
      return
    }
    setIsRoleUpdating(true)
    try {
      await driver.ccBus.setRole(nextRole)
      setRole(nextRole)
      if (deviceRecord && onUpdateDeviceConfig) {
        await onUpdateDeviceConfig(deviceRecord.id, (current) => {
          const source = current && typeof current === 'object' ? current : {}
          return {
            ...source,
            role: nextRole,
            ...(nextRole === CCBusRole.SINK ? {} : { sinkRequest: undefined }),
          }
        })
      }
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
      await driver.setCaptureEnabled(nextState)
      setCaptureEnabled(nextState)
      if (deviceRecord && onUpdateDeviceConfig) {
        await onUpdateDeviceConfig(deviceRecord.id, (current) => {
          const source = current && typeof current === 'object' ? current : {}
          return {
            ...source,
            captureEnabled: nextState,
          }
        })
      }
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
              <RoleMenu
                role={role}
                disabled={!driver || isRoleUpdating}
                isUpdating={isRoleUpdating}
                formatRoleLabel={formatRoleLabel}
                onSelectRole={(nextRole) => {
                  void handleRoleUpdate(nextRole)
                }}
              />
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
