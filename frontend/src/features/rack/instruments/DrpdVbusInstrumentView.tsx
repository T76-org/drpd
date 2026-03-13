import { useEffect, useMemo, useRef, useState } from 'react'
import { DRPDDevice, VBusStatus, type AnalogMonitorChannels, type VBusInfo } from '../../../lib/device'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase, type InstrumentHeaderControl } from '../InstrumentBase'
import type { RackDeviceState } from '../RackRenderer'
import styles from './DrpdVbusInstrumentView.module.css'

const OVP_MAX_V = 50
const OCP_MAX_A = 6
const DISPLAY_UPDATE_RATE_STORAGE_PREFIX = 'drpd:vbus:display-rate:'
const DEFAULT_DISPLAY_UPDATE_RATE_HZ = 3
const MIN_DISPLAY_UPDATE_RATE_HZ = 1
const MAX_DISPLAY_UPDATE_RATE_HZ = 30

interface AveragedDisplayMeasurements {
  vbusVoltage: number | null
  vbusCurrent: number | null
}

interface PendingAverageAccumulator {
  voltageSum: number
  currentSum: number
  sampleCount: number
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

const getDisplayRateStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null
  }
  return window.localStorage ?? null
}

const loadDisplayUpdateRateHz = (storageKey: string): number => {
  const storage = getDisplayRateStorage()
  if (!storage) {
    return DEFAULT_DISPLAY_UPDATE_RATE_HZ
  }
  const raw = storage.getItem(storageKey)
  const parsed = raw == null ? NaN : Number(raw)
  if (
    Number.isFinite(parsed) &&
    parsed >= MIN_DISPLAY_UPDATE_RATE_HZ &&
    parsed <= MAX_DISPLAY_UPDATE_RATE_HZ
  ) {
    return parsed
  }
  return DEFAULT_DISPLAY_UPDATE_RATE_HZ
}

const buildDisplayMeasurements = (
  analogMonitor: AnalogMonitorChannels | null,
): AveragedDisplayMeasurements => ({
  vbusVoltage:
    analogMonitor && Number.isFinite(analogMonitor.vbus) ? analogMonitor.vbus : null,
  vbusCurrent:
    analogMonitor && Number.isFinite(analogMonitor.ibus) ? analogMonitor.ibus : null,
})

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

const PopoverLifecycle = ({
  onMount,
  onUnmount
}: {
  onMount: () => void
  onUnmount: () => void
}) => {
  const onMountRef = useRef(onMount)
  const onUnmountRef = useRef(onUnmount)

  useEffect(() => {
    onMountRef.current = onMount
  }, [onMount])

  useEffect(() => {
    onUnmountRef.current = onUnmount
  }, [onUnmount])

  useEffect(() => {
    onMountRef.current()
    return () => {
      onUnmountRef.current()
    }
  }, [])

  return null
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
  const displayRateStorageKey = useMemo(
    () => `${DISPLAY_UPDATE_RATE_STORAGE_PREFIX}${instrument.id}`,
    [instrument.id],
  )
  const [analogMonitor, setAnalogMonitor] = useState<AnalogMonitorChannels | null>(
    driver ? driver.getState().analogMonitor ?? null : null
  )
  const [displayMeasurements, setDisplayMeasurements] = useState<AveragedDisplayMeasurements>(() =>
    buildDisplayMeasurements(driver ? driver.getState().analogMonitor ?? null : null),
  )
  const [displayUpdateRateHz, setDisplayUpdateRateHz] = useState<number>(() =>
    loadDisplayUpdateRateHz(displayRateStorageKey),
  )
  const [vbusInfo, setVbusInfo] = useState<VBusInfo | null>(
    driver ? driver.getState().vbusInfo ?? null : null
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
  const [displayUpdateRateInput, setDisplayUpdateRateInput] = useState<string>(() =>
    loadDisplayUpdateRateHz(displayRateStorageKey).toString(),
  )
  const [configureError, setConfigureError] = useState<string | null>(null)
  const [isApplyingConfig, setIsApplyingConfig] = useState(false)
  const [isResettingProtection, setIsResettingProtection] = useState(false)
  const pendingAverageRef = useRef<PendingAverageAccumulator>({
    voltageSum: 0,
    currentSum: 0,
    sampleCount: 0,
  })

  useEffect(() => {
    const initialAnalogMonitor = driver ? driver.getState().analogMonitor ?? null : null
    setAnalogMonitor(initialAnalogMonitor)
    setDisplayMeasurements(buildDisplayMeasurements(initialAnalogMonitor))
  }, [driver])

  useEffect(() => {
    setDisplayUpdateRateHz(loadDisplayUpdateRateHz(displayRateStorageKey))
    setDisplayUpdateRateInput(loadDisplayUpdateRateHz(displayRateStorageKey).toString())
  }, [displayRateStorageKey])

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
      const changed = Array.isArray(detail?.changed) ? detail.changed as string[] : null
      if (changed && !changed.includes('analogMonitor') && !changed.includes('vbusInfo')) {
        return
      }
      const state = driver.getState()
      if (!changed || changed.includes('analogMonitor')) {
        setAnalogMonitor(state.analogMonitor ?? null)
      }
      if (!changed || changed.includes('vbusInfo')) {
        setVbusInfo(state.vbusInfo ?? null)
      }
    }

    driver.addEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)

    return () => {
      driver.removeEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
    }
  }, [driver])

  useEffect(() => {
    if (!analogMonitor) {
      pendingAverageRef.current = {
        voltageSum: 0,
        currentSum: 0,
        sampleCount: 0,
      }
      setDisplayMeasurements({ vbusVoltage: null, vbusCurrent: null })
      return
    }
    if (!Number.isFinite(analogMonitor.vbus) || !Number.isFinite(analogMonitor.ibus)) {
      return
    }
    pendingAverageRef.current = {
      voltageSum: pendingAverageRef.current.voltageSum + analogMonitor.vbus,
      currentSum: pendingAverageRef.current.currentSum + analogMonitor.ibus,
      sampleCount: pendingAverageRef.current.sampleCount + 1,
    }
  }, [analogMonitor])

  useEffect(() => {
    const periodMs = 1000 / displayUpdateRateHz
    const timerId = window.setInterval(() => {
      const pending = pendingAverageRef.current
      if (pending.sampleCount <= 0) {
        return
      }
      setDisplayMeasurements({
        vbusVoltage: pending.voltageSum / pending.sampleCount,
        vbusCurrent: pending.currentSum / pending.sampleCount,
      })
      pendingAverageRef.current = {
        voltageSum: 0,
        currentSum: 0,
        sampleCount: 0,
      }
    }, periodMs)
    return () => {
      window.clearInterval(timerId)
    }
  }, [displayUpdateRateHz])

  useEffect(() => {
    const storage = getDisplayRateStorage()
    if (!storage) {
      return
    }
    storage.setItem(displayRateStorageKey, displayUpdateRateHz.toString())
  }, [displayRateStorageKey, displayUpdateRateHz])

  const vbusVoltage = displayMeasurements.vbusVoltage
  const vbusCurrent = displayMeasurements.vbusCurrent
  const powerValue =
    vbusVoltage != null && vbusCurrent != null
      ? vbusVoltage * vbusCurrent
      : null
  const protectionState = resolveProtectionDisplayStatus(vbusInfo?.status)
  const ovpValueText = formatProtectionThreshold(vbusInfo?.ovpThresholdMv, 1000, 'V')
  const ocpValueText = formatProtectionThreshold(vbusInfo?.ocpThresholdMa, 1000, 'A')
  const isProtectionTriggered =
    vbusInfo?.status === VBusStatus.OVP || vbusInfo?.status === VBusStatus.OCP
  const protectionStatusText = isProtectionTriggered ? 'Triggered' : 'OK'

  const headerControls = useMemo<InstrumentHeaderControl[]>(() => {
    const resetControl: InstrumentHeaderControl = {
      id: 'reset-vbus',
      label: 'RESET',
      disabled: !driver || isEditMode || isResettingProtection,
      renderPopover: ({ closePopover }) => (
        <div className={`${styles.headerPopup} ${styles.headerResetPopup}`}>
          <button
            type="button"
            className={styles.headerPopupButton}
            onClick={() => {
              if (!driver || !isProtectionTriggered) {
                return
              }
              setIsResettingProtection(true)
              setConfigureError(null)
              void driver.vbus
                .resetFault()
                .then(async () => {
                  await driver.refreshState()
                  closePopover()
                })
                .catch((error) => {
                  const message = error instanceof Error ? error.message : String(error)
                  setConfigureError(message)
                })
                .finally(() => {
                  setIsResettingProtection(false)
                })
            }}
            disabled={!isProtectionTriggered || isResettingProtection}
          >
            {isResettingProtection ? 'Resetting Protection...' : 'Reset Protection'}
          </button>
        </div>
      )
    }

    const configureControl: InstrumentHeaderControl = {
      id: 'configure-vbus',
      label: 'CONFIGURE',
      disabled: !driver || isEditMode || isApplyingConfig,
      renderPopover: ({ closePopover }) => (
        <div className={styles.headerPopup}>
          <PopoverLifecycle
            onMount={() => {
              setConfigureError(null)
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
              setDisplayUpdateRateInput(displayUpdateRateHz.toString())
            }}
            onUnmount={() => {
              // No cleanup needed
            }}
          />
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
            OVP range: 0-{OVP_MAX_V}V · OCP range: 0-{OCP_MAX_A}A
          </p>
          <div className={styles.headerPopupField}>
            <label className={styles.headerPopupLabel} htmlFor={`${instrument.id}-display-rate`}>
              Display Rate (Hz)
            </label>
            <input
              id={`${instrument.id}-display-rate`}
              className={styles.headerPopupInput}
              type="number"
              min={MIN_DISPLAY_UPDATE_RATE_HZ}
              max={MAX_DISPLAY_UPDATE_RATE_HZ}
              step={1}
              value={displayUpdateRateInput}
              onChange={(event) => {
                setDisplayUpdateRateInput(event.currentTarget.value)
                setConfigureError(null)
              }}
              disabled={isApplyingConfig}
            />
          </div>
          <p className={styles.headerPopupHint}>
            Display update rate range: {MIN_DISPLAY_UPDATE_RATE_HZ}-{MAX_DISPLAY_UPDATE_RATE_HZ} Hz
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
                const parsedDisplayUpdateRateHz = Number(displayUpdateRateInput)
                if (!Number.isFinite(parsedOvpV) || parsedOvpV < 0 || parsedOvpV > OVP_MAX_V) {
                  setConfigureError(`OVP must be between 0 and ${OVP_MAX_V} V.`)
                  return
                }
                if (!Number.isFinite(parsedOcpA) || parsedOcpA < 0 || parsedOcpA > OCP_MAX_A) {
                  setConfigureError(`OCP must be between 0 and ${OCP_MAX_A} A.`)
                  return
                }
                if (
                  !Number.isFinite(parsedDisplayUpdateRateHz) ||
                  parsedDisplayUpdateRateHz < MIN_DISPLAY_UPDATE_RATE_HZ ||
                  parsedDisplayUpdateRateHz > MAX_DISPLAY_UPDATE_RATE_HZ
                ) {
                  setConfigureError(
                    `Display rate must be between ${MIN_DISPLAY_UPDATE_RATE_HZ} and ${MAX_DISPLAY_UPDATE_RATE_HZ} Hz.`,
                  )
                  return
                }

                setIsApplyingConfig(true)
                setConfigureError(null)
                void Promise.resolve()
                  .then(async () => {
                    setDisplayUpdateRateHz(parsedDisplayUpdateRateHz)
                    if (vbusInfo?.status === VBusStatus.OVP || vbusInfo?.status === VBusStatus.OCP) {
                      await driver.vbus.resetFault()
                    }
                    await driver.vbus.setOvpThresholdMv(Math.round(parsedOvpV * 1000))
                    await driver.vbus.setOcpThresholdMa(Math.round(parsedOcpA * 1000))
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

    return [resetControl, configureControl]
  }, [
    configureError,
    driver,
    instrument.id,
    isApplyingConfig,
    isProtectionTriggered,
    isEditMode,
    ocpThresholdInput,
    ovpThresholdInput,
    displayUpdateRateHz,
    displayUpdateRateInput,
    isResettingProtection,
    vbusInfo,
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
            <div
              className={styles.protectionValue}
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
              <div className={styles.protectionLine}>
                <span className={styles.protectionLabel}>STATUS</span>
                <span
                  className={`${styles.protectionThreshold} ${
                    isProtectionTriggered ? styles.protectionStatusTriggered : styles.protectionStatusOk
                  }`}
                >
                  {protectionStatusText}
                </span>
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
