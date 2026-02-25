import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import {
  AnalogMonitorCCChannelStatus,
  DRPDDevice,
  analogMonitorCCStatusFromVoltage,
  type AnalogMonitorChannels,
} from '../../../lib/device'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import type { RackDeviceState } from '../RackRenderer'
import styles from './DrpdVbusInstrumentView.module.css'

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
 * VBUS instrument showing live analog measurements.
 */
export const DrpdVbusInstrumentView = ({
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

  useEffect(() => {
    if (!driver) {
      setAnalogMonitor(null)
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
        return
      }
      setAnalogMonitor(driver.getState().analogMonitor ?? null)
    }

    driver.addEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)

    return () => {
      driver.removeEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
    }
  }, [driver])

  const vbusVoltage = analogMonitor?.vbus
  const vbusCurrent = analogMonitor?.ibus
  const powerValue =
    vbusVoltage != null && vbusCurrent != null
      ? vbusVoltage * vbusCurrent
      : null

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
      </div>
      {deviceRecord ? null : (
        <div className={styles.unassigned}>Device: Unassigned</div>
      )}
    </InstrumentBase>
  )
}
