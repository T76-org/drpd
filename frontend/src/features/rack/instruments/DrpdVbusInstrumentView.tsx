import { useEffect, useState } from 'react'
import { DRPDDevice, type AnalogMonitorChannels } from '../../../lib/device'
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
      setAnalogMonitor(null)
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

      </div>
      {deviceRecord ? null : (
        <div className={styles.unassigned}>Device: Unassigned</div>
      )}
    </InstrumentBase>
  )
}
