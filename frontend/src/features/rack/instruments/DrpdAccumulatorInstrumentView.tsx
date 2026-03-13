import { useEffect, useMemo, useState } from 'react'
import { DRPDDevice, type AnalogMonitorChannels } from '../../../lib/device'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase, type InstrumentHeaderControl } from '../InstrumentBase'
import type { RackDeviceState } from '../RackRenderer'
import styles from './DrpdAccumulatorInstrumentView.module.css'

const formatMetric = (value: number | null | undefined, decimals: number): string => {
  if (value == null || !Number.isFinite(value)) {
    return '--'
  }
  return value.toFixed(decimals)
}

const formatElapsed = (elapsedUs: bigint | null | undefined): string => {
  if (elapsedUs == null) {
    return '--'
  }
  const totalSeconds = Number(elapsedUs / 1_000_000n)
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '--'
  }
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const hhmmss = [hours, minutes, seconds].map((part) => part.toString().padStart(2, '0')).join(':')
  return days > 0 ? `${days}d ${hhmmss}` : hhmmss
}

export const DrpdAccumulatorInstrumentView = ({
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
  const [isResetting, setIsResetting] = useState(false)

  useEffect(() => {
    if (!driver) {
      return
    }

    const handleStateUpdated = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      const changed = Array.isArray(detail?.changed) ? detail.changed as string[] : null
      if (changed && !changed.includes('analogMonitor')) {
        return
      }
      const state = driver.getState()
      setAnalogMonitor(state.analogMonitor ?? null)
    }

    driver.addEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
    return () => {
      driver.removeEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
    }
  }, [driver])

  const accumulatedChargeAh =
    analogMonitor && Number.isFinite(analogMonitor.accumulatedChargeMah)
      ? analogMonitor.accumulatedChargeMah / 1000
      : null
  const accumulatedEnergyWh =
    analogMonitor && Number.isFinite(analogMonitor.accumulatedEnergyMwh)
      ? analogMonitor.accumulatedEnergyMwh / 1000
      : null
  const elapsedText = formatElapsed(analogMonitor?.accumulationElapsedTimeUs)

  const headerControls = useMemo<InstrumentHeaderControl[]>(
    () => [
      {
        id: 'reset-charge-energy',
        label: 'RESET',
        disabled: !driver || isEditMode || isResetting,
        onClick: () => {
          if (!driver) {
            return
          }
          setIsResetting(true)
          void driver.analogMonitor
            .resetAccumulatedMeasurements()
            .finally(() => {
              setIsResetting(false)
            })
        }
      }
    ],
    [driver, isEditMode, isResetting],
  )

  return (
    <InstrumentBase
      instrument={instrument}
      displayName={displayName}
      isEditMode={isEditMode}
      headerControls={headerControls}
      onClose={
        onRemove
          ? () => {
              onRemove(instrument.id)
            }
          : undefined
      }
    >
      <div className={styles.wrapper}>
        <div className={styles.metricRow}>
          <span className={styles.label}>Charge</span>
          <span className={styles.value} data-testid="charge-energy-charge">
            <span className={styles.valueNumber}>{formatMetric(accumulatedChargeAh, 2)}</span>
            {' '}
            <span className={styles.valueUnit}>Ah</span>
          </span>
        </div>
        <div className={styles.metricRow}>
          <span className={styles.label}>Energy</span>
          <span className={styles.value} data-testid="charge-energy-energy">
            <span className={styles.valueNumber}>{formatMetric(accumulatedEnergyWh, 2)}</span>
            {' '}
            <span className={styles.valueUnit}>Wh</span>
          </span>
        </div>
        <div className={styles.metricRow}>
          <span className={styles.label}>Since Reset</span>
          <span className={styles.elapsed} data-testid="charge-energy-elapsed">
            {elapsedText}
          </span>
        </div>
      </div>
      {deviceRecord ? null : (
        <div className={styles.unassigned}>Device: Unassigned</div>
      )}
    </InstrumentBase>
  )
}
