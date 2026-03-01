import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { DRPDDevice, type AnalogMonitorChannels } from '../../../lib/device'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import type { RackDeviceState } from '../RackRenderer'
import styles from './DrpdVbusInstrumentView.module.css'

const VBUS_AH_STORAGE_PREFIX = 'drpd:vbus:ah:'
const MICROSECONDS_PER_HOUR = 3_600_000_000

type VbusInstrumentConfig = {
  currentColor?: string
  powerColor?: string
  chargeColor?: string
}

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
 * Resolve a safe localStorage instance when available.
 *
 * @returns Storage instance or null.
 */
const getVbusStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null
  }
  const storage = window.localStorage
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    return null
  }
  return storage
}

/**
 * Load persisted Ah value from local storage.
 *
 * @param key - Storage key.
 * @returns Persisted Ah value, defaulting to zero.
 */
const loadPersistedAh = (key: string): number => {
  const storage = getVbusStorage()
  if (!storage) {
    return 0
  }
  const raw = storage.getItem(key)
  if (!raw) {
    return 0
  }
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
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
  const storageKey = useMemo(() => {
    const scopeId = deviceRecord?.id ?? `instrument:${instrument.id}`
    return `${VBUS_AH_STORAGE_PREFIX}${scopeId}`
  }, [deviceRecord?.id, instrument.id])
  const instrumentConfig = (instrument.config ?? {}) as VbusInstrumentConfig
  const [analogMonitor, setAnalogMonitor] = useState<AnalogMonitorChannels | null>(
    driver ? driver.getState().analogMonitor ?? null : null
  )
  const [accumulatedAh, setAccumulatedAh] = useState<number>(() => loadPersistedAh(storageKey))
  const lastSampleTimestampRef = useRef<bigint | null>(analogMonitor?.captureTimestampUs ?? null)
  const accumulatedAhRef = useRef<number>(accumulatedAh)

  const metricColors = {
    '--vbus-current-color': instrumentConfig.currentColor ?? 'var(--color-status-ok)',
    '--vbus-power-color': instrumentConfig.powerColor ?? 'var(--color-status-warning)',
    '--vbus-charge-color': instrumentConfig.chargeColor ?? 'var(--color-status-charge)',
  } as CSSProperties

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

  useEffect(() => {
    const persistedAh = loadPersistedAh(storageKey)
    accumulatedAhRef.current = persistedAh
    setAccumulatedAh(persistedAh)
    lastSampleTimestampRef.current = null
  }, [storageKey])

  useEffect(() => {
    accumulatedAhRef.current = accumulatedAh
    const storage = getVbusStorage()
    if (!storage) {
      return
    }
    storage.setItem(storageKey, accumulatedAh.toString())
  }, [accumulatedAh, storageKey])

  useEffect(() => {
    if (!analogMonitor) {
      return
    }
    const sampleTimestampUs = analogMonitor.captureTimestampUs
    const currentAmps = analogMonitor.ibus
    if (!Number.isFinite(currentAmps)) {
      lastSampleTimestampRef.current = sampleTimestampUs
      return
    }
    const previousTimestampUs = lastSampleTimestampRef.current
    lastSampleTimestampRef.current = sampleTimestampUs
    if (previousTimestampUs == null || sampleTimestampUs <= previousTimestampUs) {
      return
    }
    const deltaUs = Number(sampleTimestampUs - previousTimestampUs)
    if (!Number.isFinite(deltaUs) || deltaUs <= 0) {
      return
    }
    const deltaHours = deltaUs / MICROSECONDS_PER_HOUR
    const deltaAh = currentAmps * deltaHours
    if (!Number.isFinite(deltaAh)) {
      return
    }
    setAccumulatedAh((previousAh) => {
      const nextAh = previousAh + deltaAh
      accumulatedAhRef.current = nextAh
      return nextAh
    })
  }, [analogMonitor])

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
      <div className={styles.wrapper} style={metricColors}>
        <section className={`${styles.section} ${styles.vbusSection}`}>
          <div className={styles.metricBlock}>
            <div className={styles.vbusValue}>
              <span className={styles.vbusNumber}>{formatNumber(vbusVoltage, 2)}</span>
              <span className={styles.unit}>V</span>
            </div>
          </div>
          <div className={styles.metricBlock}>
            <div className={`${styles.vbusValue} ${styles.vbusCurrentLeftValue}`}>
              <span className={styles.vbusNumber}>{formatNumber(vbusCurrent, 2)}</span>
              <span className={styles.unit}>A</span>
            </div>
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
          <div className={styles.metricBlock}>
            <div className={`${styles.metricValue} ${styles.chargeValue}`}>
              <span className={styles.metricNumber}>
                {formatNumber(accumulatedAh, 2)}
              </span>
              <span className={styles.unit}>Ah</span>
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
