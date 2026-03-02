import { useEffect, useMemo, useRef, useState } from 'react'
import { DRPDDevice, VBusStatus, type AnalogMonitorChannels, type VBusInfo } from '../../../lib/device'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase, type InstrumentHeaderControl } from '../InstrumentBase'
import type { RackDeviceState } from '../RackRenderer'
import styles from './DrpdVbusInstrumentView.module.css'

const VBUS_AH_STORAGE_PREFIX = 'drpd:vbus:ah:'
const MICROSECONDS_PER_HOUR = 3_600_000_000
const OVP_MAX_V = 50
const OCP_MAX_A = 6

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
 * Format a protection threshold value with engineering units.
 *
 * @param value - Raw threshold value.
 * @param scale - Divisor used to convert raw value to display units.
 * @param unit - Unit suffix.
 * @returns Human-readable threshold token.
 */
const formatProtectionThreshold = (
  value: number | null | undefined,
  scale: number,
  unit: string,
): string => {
  if (value == null || !Number.isFinite(value)) {
    return '----'
  }
  return `${(value / scale).toFixed(2)}${unit}`
}

type ProtectionDisplayStatus = 'on' | 'off' | 'triggered'

/**
 * Convert VBUS status into protection display state.
 *
 * @param status - VBUS status from device state.
 * @returns Protection visual state token.
 */
const resolveProtectionDisplayStatus = (
  status: VBusInfo['status'] | null | undefined,
): ProtectionDisplayStatus => {
  if (status === VBusStatus.OVP || status === VBusStatus.OCP) {
    return 'triggered'
  }
  if (status === VBusStatus.ENABLED) {
    return 'on'
  }
  return 'off'
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
  const [analogMonitor, setAnalogMonitor] = useState<AnalogMonitorChannels | null>(
    driver ? driver.getState().analogMonitor ?? null : null
  )
  const [vbusInfo, setVbusInfo] = useState<VBusInfo | null>(
    driver ? driver.getState().vbusInfo ?? null : null
  )
  const [protectionEnabledInput, setProtectionEnabledInput] = useState<boolean>(
    () => (driver?.getState().vbusInfo?.status ?? VBusStatus.DISABLED) !== VBusStatus.DISABLED,
  )
  const [ovpThresholdInput, setOvpThresholdInput] = useState<string>(() => {
    const thresholdMv = driver?.getState().vbusInfo?.ovpThresholdMv
    if (thresholdMv == null || !Number.isFinite(thresholdMv)) {
      return ''
    }
    return (thresholdMv / 1000).toFixed(2)
  })
  const [ocpThresholdInput, setOcpThresholdInput] = useState<string>(() => {
    const thresholdMa = driver?.getState().vbusInfo?.ocpThresholdMa
    if (thresholdMa == null || !Number.isFinite(thresholdMa)) {
      return ''
    }
    return (thresholdMa / 1000).toFixed(2)
  })
  const [configureError, setConfigureError] = useState<string | null>(null)
  const [isApplyingConfig, setIsApplyingConfig] = useState(false)
  const [accumulatedAhState, setAccumulatedAhState] = useState<{
    storageKey: string
    value: number
  }>(() => ({
    storageKey,
    value: loadPersistedAh(storageKey)
  }))
  const accumulatedAh =
    accumulatedAhState.storageKey === storageKey
      ? accumulatedAhState.value
      : loadPersistedAh(storageKey)
  const lastSampleTimestampRef = useRef<bigint | null>(analogMonitor?.captureTimestampUs ?? null)

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
      if (
        detail?.changed &&
        !detail.changed.includes('analogMonitor') &&
        !detail.changed.includes('vbusInfo')
      ) {
        return
      }
      setAnalogMonitor(driver.getState().analogMonitor ?? null)
      setVbusInfo(driver.getState().vbusInfo ?? null)
    }

    driver.addEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)

    return () => {
      driver.removeEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
      setAnalogMonitor(null)
      setVbusInfo(null)
    }
  }, [driver])

  useEffect(() => {
    lastSampleTimestampRef.current = null
  }, [storageKey])

  useEffect(() => {
    setProtectionEnabledInput((vbusInfo?.status ?? VBusStatus.DISABLED) !== VBusStatus.DISABLED)
    setOvpThresholdInput(
      vbusInfo && Number.isFinite(vbusInfo.ovpThresholdMv)
        ? (vbusInfo.ovpThresholdMv / 1000).toFixed(2)
        : '',
    )
    setOcpThresholdInput(
      vbusInfo && Number.isFinite(vbusInfo.ocpThresholdMa)
        ? (vbusInfo.ocpThresholdMa / 1000).toFixed(2)
        : '',
    )
  }, [vbusInfo])

  useEffect(() => {
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
    setAccumulatedAhState((previousState) => {
      const baseAh =
        previousState.storageKey === storageKey
          ? previousState.value
          : loadPersistedAh(storageKey)
      const nextAh = baseAh + deltaAh
      return {
        storageKey,
        value: nextAh
      }
    })
  }, [analogMonitor, storageKey])

  const vbusVoltage = analogMonitor?.vbus
  const vbusCurrent = analogMonitor?.ibus
  const powerValue =
    vbusVoltage != null && vbusCurrent != null
      ? vbusVoltage * vbusCurrent
      : null
  const protectionState = resolveProtectionDisplayStatus(vbusInfo?.status)
  const ovpValueText = formatProtectionThreshold(vbusInfo?.ovpThresholdMv, 1000, 'V')
  const ocpValueText = formatProtectionThreshold(vbusInfo?.ocpThresholdMa, 1000, 'A')

  const headerControls = useMemo<InstrumentHeaderControl[]>(() => {
    const configureControl: InstrumentHeaderControl = {
      id: 'configure-vbus',
      label: 'CONFIGURE',
      disabled: !driver || isEditMode || isApplyingConfig,
      renderPopover: ({ closePopover }) => (
        <div className={styles.headerPopup}>
          <button
            type="button"
            className={`${styles.headerPopupButton} ${styles.headerPopupButtonDanger}`}
            onClick={() => {
              setAccumulatedAhState({ storageKey, value: 0 })
            }}
            disabled={isApplyingConfig}
          >
            Reset Charge Counter
          </button>
          <div className={styles.headerPopupField}>
            <label className={styles.headerPopupLabel} htmlFor={`${instrument.id}-protection-enabled`}>
              Protection
            </label>
            <select
              id={`${instrument.id}-protection-enabled`}
              className={styles.headerPopupInput}
              value={protectionEnabledInput ? 'on' : 'off'}
              onChange={(event) => {
                setProtectionEnabledInput(event.currentTarget.value === 'on')
                setConfigureError(null)
              }}
              disabled={isApplyingConfig}
            >
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </div>
          <div className={styles.headerPopupRow}>
            <div className={styles.headerPopupField}>
              <label className={styles.headerPopupLabel} htmlFor={`${instrument.id}-ovp`}>
                OVP (V)
              </label>
              <input
                id={`${instrument.id}-ovp`}
                className={styles.headerPopupInput}
                type="number"
                min={0}
                max={OVP_MAX_V}
                step={0.01}
                value={ovpThresholdInput}
                onChange={(event) => {
                  setOvpThresholdInput(event.currentTarget.value)
                  setConfigureError(null)
                }}
                disabled={isApplyingConfig}
              />
            </div>
            <div className={styles.headerPopupField}>
              <label className={styles.headerPopupLabel} htmlFor={`${instrument.id}-ocp`}>
                OCP (A)
              </label>
              <input
                id={`${instrument.id}-ocp`}
                className={styles.headerPopupInput}
                type="number"
                min={0}
                max={OCP_MAX_A}
                step={0.01}
                value={ocpThresholdInput}
                onChange={(event) => {
                  setOcpThresholdInput(event.currentTarget.value)
                  setConfigureError(null)
                }}
                disabled={isApplyingConfig}
              />
            </div>
          </div>
          <p className={styles.headerPopupHint}>
            OVP range: 0-{OVP_MAX_V}V · OCP range: 0-{OCP_MAX_A}A (Off applies max thresholds)
          </p>
          {configureError ? (
            <p className={styles.headerPopupError}>{configureError}</p>
          ) : null}
          <div className={styles.headerPopupActions}>
            <button
              type="button"
              className={styles.headerPopupButton}
              onClick={() => {
                setConfigureError(null)
                closePopover()
              }}
              disabled={isApplyingConfig}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.headerPopupButton}
              onClick={() => {
                if (!driver) {
                  return
                }
                const parsedOvpV = Number(ovpThresholdInput)
                const parsedOcpA = Number(ocpThresholdInput)
                if (!Number.isFinite(parsedOvpV) || parsedOvpV < 0 || parsedOvpV > OVP_MAX_V) {
                  setConfigureError(`OVP must be between 0 and ${OVP_MAX_V} V.`)
                  return
                }
                if (!Number.isFinite(parsedOcpA) || parsedOcpA < 0 || parsedOcpA > OCP_MAX_A) {
                  setConfigureError(`OCP must be between 0 and ${OCP_MAX_A} A.`)
                  return
                }

                setIsApplyingConfig(true)
                setConfigureError(null)
                const nextOvpV = protectionEnabledInput ? parsedOvpV : OVP_MAX_V
                const nextOcpA = protectionEnabledInput ? parsedOcpA : OCP_MAX_A
                void Promise.resolve()
                  .then(async () => {
                    if (
                      protectionEnabledInput &&
                      (vbusInfo?.status === VBusStatus.OVP || vbusInfo?.status === VBusStatus.OCP)
                    ) {
                      await driver.vbus.resetFault()
                    }
                    await driver.vbus.setOvpThresholdMv(Math.round(nextOvpV * 1000))
                    await driver.vbus.setOcpThresholdMa(Math.round(nextOcpA * 1000))
                    await driver.refreshState()
                    closePopover()
                  })
                  .catch((error) => {
                    const message = error instanceof Error ? error.message : String(error)
                    setConfigureError(message)
                  })
                  .finally(() => {
                    setIsApplyingConfig(false)
                  })
              }}
              disabled={isApplyingConfig}
            >
              {isApplyingConfig ? 'Applying...' : 'Apply'}
            </button>
          </div>
        </div>
      )
    }

    return [configureControl]
  }, [
    configureError,
    driver,
    instrument.id,
    isApplyingConfig,
    isEditMode,
    ocpThresholdInput,
    ovpThresholdInput,
    protectionEnabledInput,
    vbusInfo?.status,
    storageKey,
  ])

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
          <div className={styles.metricBlock}>
            <div
              className={`${styles.protectionValue} ${
                protectionState === 'on'
                  ? styles.protectionOn
                  : protectionState === 'triggered'
                    ? styles.protectionTriggered
                    : styles.protectionOff
              }`}
              data-testid="vbus-protection"
              data-protection-state={protectionState}
            >
              <div className={styles.protectionLine}>
                <span className={styles.protectionLabel}>OVP</span>
                <span className={styles.protectionThreshold}>{ovpValueText}</span>
              </div>
              <div className={styles.protectionLine}>
                <span className={styles.protectionLabel}>OCP</span>
                <span className={styles.protectionThreshold}>{ocpValueText}</span>
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
