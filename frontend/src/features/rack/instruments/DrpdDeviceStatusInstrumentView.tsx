import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import {
  AnalogMonitorCCChannelStatus,
  CCBusRole,
  CCBusRoleStatus,
  DRPDDevice,
  OnOffState,
  analogMonitorCCStatusFromVoltage,
  type AnalogMonitorChannels,
} from '../../../lib/device'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import type { RackDeviceState } from '../RackRenderer'
import styles from './DrpdDeviceStatusInstrumentView.module.css'

/**
 * Format a numeric value using fixed decimals.
 *
 * @param value - Numeric input value.
 * @param decimals - Decimal places to show.
 * @returns Formatted value or placeholder.
 */
const formatNumber = (value: number | null | undefined, decimals: number): string => {
  if (value == null || !Number.isFinite(value)) {
    return '--'
  }
  return value.toFixed(decimals)
}

/**
 * Resolve the CC channel status label and style for a voltage.
 *
 * @param voltage - CC channel voltage.
 * @returns Label and class name for the status.
 */
const getCCStatusBadge = (
  voltage: number | null | undefined,
): { label: string; className: string } => {
  if (voltage == null || !Number.isFinite(voltage)) {
    return { label: 'Unknown', className: styles.ccStatusUnknown }
  }
  const status = analogMonitorCCStatusFromVoltage(voltage)
  return mapCCStatusToBadge(status)
}

/**
 * Map a CC channel status into a badge label and class.
 *
 * @param status - CC channel status.
 * @returns Label and class name for the status.
 */
const mapCCStatusToBadge = (
  status: AnalogMonitorCCChannelStatus,
): { label: string; className: string } => {
  switch (status) {
    case AnalogMonitorCCChannelStatus.DISCONNECTED:
      return { label: 'Disconnected', className: styles.ccStatusDisconnected }
    case AnalogMonitorCCChannelStatus.SINK_TX_NG:
      return { label: 'Sink TX NG', className: styles.ccStatusNg }
    case AnalogMonitorCCChannelStatus.SINK_TX_OK:
      return { label: 'Sink TX OK', className: styles.ccStatusOk }
    case AnalogMonitorCCChannelStatus.V_CONN:
      return { label: 'Vconn', className: styles.ccStatusVconn }
    case AnalogMonitorCCChannelStatus.UNKNOWN:
    default:
      return { label: 'Unknown', className: styles.ccStatusUnknown }
  }
}

/**
 * Render a CC status badge for a voltage reading.
 *
 * @param voltage - CC channel voltage.
 * @returns Status badge element.
 */
const renderCCStatusBadge = (
  voltage: number | null | undefined,
): JSX.Element => {
  const badge = getCCStatusBadge(voltage)
  return (
    <span className={`${styles.ccStatus} ${badge.className}`}>
      {badge.label}
    </span>
  )
}

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
 * Device status instrument showing live analog measurements.
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
  const [analogMonitor, setAnalogMonitor] = useState<AnalogMonitorChannels | null>(
    driver ? driver.getState().analogMonitor ?? null : null
  )
  const [role, setRole] = useState<CCBusRole | null>(
    driver ? driver.getState().role ?? null : null
  )
  const [roleStatus, setRoleStatus] = useState<CCBusRoleStatus | null>(null)
  const [captureEnabled, setCaptureEnabled] = useState<OnOffState | null>(null)
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false)
  const [isRoleUpdating, setIsRoleUpdating] = useState(false)
  const [isCaptureUpdating, setIsCaptureUpdating] = useState(false)

  /**
   * Close the role selection menu.
   */
  const closeRoleMenu = () => {
    setIsRoleMenuOpen(false)
  }

  useEffect(() => {
    if (!isRoleMenuOpen) {
      return undefined
    }

    /**
     * Close the role menu when Escape is pressed.
     *
     * @param event - Keyboard event.
     */
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
      setAnalogMonitor(null)
      setRole(null)
      setRoleStatus(null)
      setCaptureEnabled(null)
      return
    }

    /**
     * Handle driver state updates for analog monitor changes.
     *
     * @param event - State update event.
     */
    const handleStateUpdated = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      if (detail?.changed && !detail.changed.includes('analogMonitor')) {
        if (!detail.changed.includes('role')) {
          return
        }
      }
      if (!detail?.changed || detail.changed.includes('analogMonitor')) {
        setAnalogMonitor(driver.getState().analogMonitor ?? null)
      }
      if (!detail?.changed || detail.changed.includes('role')) {
        setRole(driver.getState().role ?? null)
      }
    }

    /**
     * Handle CC bus status updates from the driver.
     *
     * @param event - CC bus status event.
     */
    const handleCcBusStatusChanged = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      if (detail?.roleStatus) {
        setRoleStatus(detail.roleStatus as CCBusRoleStatus)
      } else {
        setRoleStatus(driver.getState().ccBusRoleStatus ?? null)
      }
    }

    /**
     * Handle capture enable updates from the driver.
     *
     * @param event - Capture status event.
     */
    const handleCaptureStatusChanged = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      if (detail?.captureEnabled) {
        setCaptureEnabled(detail.captureEnabled as OnOffState)
      } else {
        setCaptureEnabled(driver.getState().captureEnabled ?? null)
      }
    }

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

  const vbusVoltage = analogMonitor?.vbus
  const vbusCurrent = analogMonitor?.ibus
  const powerValue =
    vbusVoltage != null && vbusCurrent != null
      ? vbusVoltage * vbusCurrent
      : null
  const captureLabel = formatCaptureLabel(captureEnabled)
  const roleLabel = formatRoleLabel(role)
  const roleStatusLabel = formatRoleStatusLabel(roleStatus)
  const captureValueClass =
    captureEnabled === OnOffState.ON
      ? styles.modeValueOn
      : captureEnabled === OnOffState.OFF
        ? styles.modeValueOff
        : styles.modeValueNeutral

  /**
   * Apply a new CC bus role to the device.
   *
   * @param nextRole - Role to apply.
   */
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

  /**
   * Toggle capture on the device.
   */
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
        <section className={`${styles.section} ${styles.vbusSection}`}>
          <div className={styles.vbusValue}>
            <span className={styles.vbusNumber}>{formatNumber(vbusVoltage, 2)}</span>
            <span className={styles.unit}>V</span>
          </div>
        </section>

        <section className={`${styles.section} ${styles.powerSection}`}>
          <div className={styles.metricBlock}>
            <div className={`${styles.metricValue} ${styles.currentValue}`}>
              <span className={styles.metricNumber}>
                {formatNumber(vbusCurrent, 2)}
              </span>
              <span className={styles.unit}>A</span>
            </div>
          </div>
          <div className={styles.metricBlock}>
            <div className={`${styles.metricValue} ${styles.powerValue}`}>
              <span className={styles.metricNumber}>
                {formatNumber(powerValue, 2)}
              </span>
              <span className={styles.unit}>W</span>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.ccSection}`}>
          <div className={styles.ccGroup}>
            <div className={styles.ccTitle}>DUT</div>
            <div className={styles.ccLines}>
              <div className={styles.ccRow}>
                <span className={styles.ccLabel}>CC1</span>
                <span className={styles.ccValue}>
                  {formatNumber(analogMonitor?.dutCc1, 2)} V
                </span>
                {renderCCStatusBadge(analogMonitor?.dutCc1)}
              </div>
              <div className={styles.ccRow}>
                <span className={styles.ccLabel}>CC2</span>
                <span className={styles.ccValue}>
                  {formatNumber(analogMonitor?.dutCc2, 2)} V
                </span>
                {renderCCStatusBadge(analogMonitor?.dutCc2)}
              </div>
            </div>
          </div>
          <div className={styles.ccGroup}>
            <div className={styles.ccTitle}>US/DS</div>
            <div className={styles.ccLines}>
              <div className={styles.ccRow}>
                <span className={styles.ccLabel}>CC1</span>
                <span className={styles.ccValue}>
                  {formatNumber(analogMonitor?.usdsCc1, 2)} V
                </span>
                {renderCCStatusBadge(analogMonitor?.usdsCc1)}
              </div>
              <div className={styles.ccRow}>
                <span className={styles.ccLabel}>CC2</span>
                <span className={styles.ccValue}>
                  {formatNumber(analogMonitor?.usdsCc2, 2)} V
                </span>
                {renderCCStatusBadge(analogMonitor?.usdsCc2)}
              </div>
            </div>
          </div>
        </section>
        <section className={`${styles.section} ${styles.modeSection}`}>
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
