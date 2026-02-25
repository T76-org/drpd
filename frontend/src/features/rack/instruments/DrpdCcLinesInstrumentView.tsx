import { useSyncExternalStore } from 'react'
import type { JSX } from 'react'
import {
  AnalogMonitorCCChannelStatus,
  DRPDDevice,
  analogMonitorCCStatusFromVoltage,
} from '../../../lib/device'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import type { RackDeviceState } from '../RackRenderer'
import styles from './DrpdCcLinesInstrumentView.module.css'

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
      return { label: 'Off', className: styles.ccStatusDisconnected }
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
 * CC Lines instrument showing DUT/USDS CC telemetry and derived status badges.
 */
export const DrpdCcLinesInstrumentView = ({
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
  const analogMonitor = useSyncExternalStore(
    (onStoreChange) => {
      if (!driver) {
        return () => {}
      }

      const handleStateUpdated = (event: Event) => {
        const detail = event instanceof CustomEvent ? event.detail : undefined
        if (detail?.changed && !detail.changed.includes('analogMonitor')) {
          return
        }
        onStoreChange()
      }

      driver.addEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
      return () => {
        driver.removeEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
      }
    },
    () => (driver ? driver.getState().analogMonitor ?? null : null),
    () => null
  )

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
        <section className={styles.ccSection}>
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
      </div>
      {deviceRecord ? null : (
        <div className={styles.unassigned}>Device: Unassigned</div>
      )}
    </InstrumentBase>
  )
}
