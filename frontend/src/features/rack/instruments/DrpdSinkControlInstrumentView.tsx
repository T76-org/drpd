import { useEffect, useState } from 'react'
import {
  CCBusRole,
  DRPDDevice,
  type DRPDDeviceState as DrpdDeviceSnapshot,
  type SinkInfo,
  type SinkPdo,
  SinkPdoType,
} from '../../../lib/device'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase } from '../InstrumentBase'
import type { RackDeviceState } from '../RackRenderer'
import styles from './DrpdSinkControlInstrumentView.module.css'

type RequestStatus = 'idle' | 'sending' | 'success' | 'error'

/**
 * Format a number using fixed precision.
 *
 * @param value - Numeric value.
 * @param digits - Decimal places.
 * @returns Formatted string or fallback.
 */
const formatNumber = (value: number | null | undefined, digits = 2): string => {
  if (value == null || !Number.isFinite(value)) {
    return '--'
  }
  return value.toFixed(digits)
}

/**
 * Build a readable label for a PDO entry.
 *
 * @param pdo - PDO value.
 * @returns Short PDO summary.
 */
const formatPdoSummary = (pdo: SinkPdo): string => {
  if (!pdo) {
    return 'None'
  }
  switch (pdo.type) {
    case SinkPdoType.FIXED:
      return `Fixed ${pdo.voltageV.toFixed(2)}V / ${pdo.maxCurrentA.toFixed(2)}A`
    case SinkPdoType.VARIABLE:
      return `Variable ${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)}V / ${pdo.maxCurrentA.toFixed(2)}A`
    case SinkPdoType.BATTERY:
      return `Battery ${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)}V / ${pdo.maxPowerW.toFixed(2)}W`
    case SinkPdoType.AUGMENTED:
      return `Augmented ${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)}V / ${pdo.maxCurrentA.toFixed(2)}A`
    case SinkPdoType.SPR_PPS:
      return `SPR PPS ${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)}V / ${pdo.maxCurrentA.toFixed(2)}A`
    case SinkPdoType.SPR_AVS:
    case SinkPdoType.EPR_AVS:
      return `${pdo.type.replace('_', ' ')} ${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)}V / ${pdo.maxPowerW.toFixed(2)}W`
    default:
      return 'Unknown'
  }
}

/**
 * Compare two sink PDO values for structural equality.
 *
 * @param left - First PDO.
 * @param right - Second PDO.
 * @returns True when both PDOs represent the same capability.
 */
const areSinkPdosEqual = (
  left: SinkPdo | null | undefined,
  right: SinkPdo | null | undefined,
): boolean => {
  if (left == null && right == null) {
    return true
  }
  if (left == null || right == null || left.type !== right.type) {
    return false
  }

  switch (left.type) {
    case SinkPdoType.FIXED:
      return right.type === SinkPdoType.FIXED &&
        left.voltageV === right.voltageV &&
        left.maxCurrentA === right.maxCurrentA
    case SinkPdoType.VARIABLE:
      return right.type === SinkPdoType.VARIABLE &&
        left.minVoltageV === right.minVoltageV &&
        left.maxVoltageV === right.maxVoltageV &&
        left.maxCurrentA === right.maxCurrentA
    case SinkPdoType.BATTERY:
      return right.type === SinkPdoType.BATTERY &&
        left.minVoltageV === right.minVoltageV &&
        left.maxVoltageV === right.maxVoltageV &&
        left.maxPowerW === right.maxPowerW
    case SinkPdoType.AUGMENTED:
      return right.type === SinkPdoType.AUGMENTED &&
        left.minVoltageV === right.minVoltageV &&
        left.maxVoltageV === right.maxVoltageV &&
        left.maxCurrentA === right.maxCurrentA
    case SinkPdoType.SPR_PPS:
      return right.type === SinkPdoType.SPR_PPS &&
        left.minVoltageV === right.minVoltageV &&
        left.maxVoltageV === right.maxVoltageV &&
        left.maxCurrentA === right.maxCurrentA
    case SinkPdoType.SPR_AVS:
    case SinkPdoType.EPR_AVS:
      return (right.type === SinkPdoType.SPR_AVS || right.type === SinkPdoType.EPR_AVS) &&
        left.type === right.type &&
        left.minVoltageV === right.minVoltageV &&
        left.maxVoltageV === right.maxVoltageV &&
        left.maxPowerW === right.maxPowerW
    default:
      return false
  }
}

/**
 * Find the index of a PDO in the advertised sink PDO list.
 *
 * @param pdoList - Advertised PDOs.
 * @param target - Target PDO value.
 * @returns 0-based index or null when not found.
 */
const findSinkPdoIndex = (
  pdoList: SinkPdo[],
  target: SinkPdo | null | undefined,
): number | null => {
  if (target == null) {
    return null
  }
  const index = pdoList.findIndex((pdo) => areSinkPdosEqual(pdo, target))
  return index >= 0 ? index : null
}

/**
 * Build compact title and detail rows for the selected PDO.
 *
 * @param pdo - Selected PDO value.
 * @param index - Selected PDO index.
 * @returns Title and two detail lines for the header layout.
 */
const getSelectedPdoDetails = (
  pdo: SinkPdo | null | undefined,
  index: number | null,
): { title: string; voltageRange: string; currentRange: string } => {
  if (!pdo) {
    return {
      title: 'None',
      voltageRange: '--',
      currentRange: '--',
    }
  }

  const prefix = index == null ? pdo.type : `#${index + 1} ${pdo.type}`
  switch (pdo.type) {
    case SinkPdoType.FIXED:
      return {
        title: 'Fixed',
        voltageRange: `${pdo.voltageV.toFixed(2)} V`,
        currentRange: `0.00-${pdo.maxCurrentA.toFixed(2)} A`,
      }
    case SinkPdoType.VARIABLE:
      return {
        title: 'Variable',
        voltageRange: `${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)} V`,
        currentRange: `0.00-${pdo.maxCurrentA.toFixed(2)} A`,
      }
    case SinkPdoType.AUGMENTED:
      return {
        title: 'Augmented',
        voltageRange: `${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)} V`,
        currentRange: `0.00-${pdo.maxCurrentA.toFixed(2)} A`,
      }
    case SinkPdoType.SPR_PPS:
      return {
        title: 'SPR PPS',
        voltageRange: `${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)} V`,
        currentRange: `0.00-${pdo.maxCurrentA.toFixed(2)} A`,
      }
    case SinkPdoType.BATTERY:
      {
        const lowCurrentA = pdo.maxPowerW / pdo.maxVoltageV
        const highCurrentA = pdo.maxPowerW / pdo.minVoltageV
        return {
          title: 'Battery',
          voltageRange: `${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)} V`,
          currentRange: `${lowCurrentA.toFixed(2)}-${highCurrentA.toFixed(2)} A (power-limited)`,
        }
      }
    case SinkPdoType.SPR_AVS:
        {
          const lowCurrentA = pdo.maxPowerW / pdo.maxVoltageV
          const highCurrentA = pdo.maxPowerW / pdo.minVoltageV
          return {
            title: 'SPR AVS',
            voltageRange: `${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)} V`,
            currentRange: `${lowCurrentA.toFixed(2)}-${highCurrentA.toFixed(2)} A (power-limited)`,
          }
        }
    case SinkPdoType.EPR_AVS:
      {
        const lowCurrentA = pdo.maxPowerW / pdo.maxVoltageV
        const highCurrentA = pdo.maxPowerW / pdo.minVoltageV
        return {
          title: 'EPR AVS',
          voltageRange: `${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)} V`,
          currentRange: `${lowCurrentA.toFixed(2)}-${highCurrentA.toFixed(2)} A (power-limited)`,
        }
      }
    default:
      return {
        title: prefix,
        voltageRange: '--',
        currentRange: '--',
      }
  }
}

/**
 * Build default form values for a selected PDO.
 *
 * @param pdo - Selected PDO.
 * @returns Initial form values.
 */
const buildDefaultForm = (
  pdo: SinkPdo | null | undefined,
): { voltageV: string; currentA: string; powerW: string } => {
  if (!pdo) {
    return { voltageV: '', currentA: '', powerW: '' }
  }
  switch (pdo.type) {
    case SinkPdoType.FIXED:
      return {
        voltageV: pdo.voltageV.toFixed(2),
        currentA: pdo.maxCurrentA.toFixed(2),
        powerW: '',
      }
    case SinkPdoType.VARIABLE:
    case SinkPdoType.AUGMENTED:
    case SinkPdoType.SPR_PPS:
      return {
        voltageV: pdo.minVoltageV.toFixed(2),
        currentA: pdo.maxCurrentA.toFixed(2),
        powerW: '',
      }
    case SinkPdoType.BATTERY:
    case SinkPdoType.SPR_AVS:
    case SinkPdoType.EPR_AVS:
      return {
        voltageV: pdo.minVoltageV.toFixed(2),
        currentA: '',
        powerW: pdo.maxPowerW.toFixed(2),
      }
    default:
      return { voltageV: '', currentA: '', powerW: '' }
  }
}

/**
 * Parse and validate a numeric field.
 *
 * @param value - Input string.
 * @returns Parsed finite number or null.
 */
const parseField = (value: string): number | null => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }
  return parsed
}

/**
 * Validate sink request input and compute SCPI argument values.
 *
 * @param pdo - Selected PDO.
 * @param voltageV - Requested voltage.
 * @param currentA - Requested current.
 * @param powerW - Requested battery power.
 * @returns Validation result and converted units.
 */
const buildRequestArgs = ({
  pdo,
  voltageV,
  currentA,
  powerW,
}: {
  pdo: SinkPdo
  voltageV: string
  currentA: string
  powerW: string
}): { voltageMv?: number; currentMa?: number; error?: string } => {
  if (!pdo) {
    return { error: 'Select a PDO before requesting power.' }
  }
  if (pdo.type === SinkPdoType.FIXED) {
    const parsedCurrent = parseField(currentA)
    if (parsedCurrent == null) {
      return { error: 'Enter a valid current.' }
    }
    if (parsedCurrent < 0 || parsedCurrent > pdo.maxCurrentA) {
      return { error: `Current must be between 0 and ${pdo.maxCurrentA.toFixed(2)} A.` }
    }
    return {
      voltageMv: Math.round(pdo.voltageV * 1000),
      currentMa: Math.round(parsedCurrent * 1000),
    }
  }

  if (
    pdo.type === SinkPdoType.VARIABLE ||
    pdo.type === SinkPdoType.AUGMENTED ||
    pdo.type === SinkPdoType.SPR_PPS
  ) {
    const parsedVoltage = parseField(voltageV)
    const parsedCurrent = parseField(currentA)
    if (parsedVoltage == null || parsedCurrent == null) {
      return { error: 'Enter valid voltage and current values.' }
    }
    if (parsedVoltage < pdo.minVoltageV || parsedVoltage > pdo.maxVoltageV) {
      return {
        error: `Voltage must be between ${pdo.minVoltageV.toFixed(2)} and ${pdo.maxVoltageV.toFixed(2)} V.`,
      }
    }
    if (parsedCurrent < 0 || parsedCurrent > pdo.maxCurrentA) {
      return { error: `Current must be between 0 and ${pdo.maxCurrentA.toFixed(2)} A.` }
    }
    return {
      voltageMv: Math.round(parsedVoltage * 1000),
      currentMa: Math.round(parsedCurrent * 1000),
    }
  }

  if (
    pdo.type === SinkPdoType.BATTERY ||
    pdo.type === SinkPdoType.SPR_AVS ||
    pdo.type === SinkPdoType.EPR_AVS
  ) {
    const parsedVoltage = parseField(voltageV)
    const parsedPower = parseField(powerW)
    if (parsedVoltage == null || parsedPower == null) {
      return { error: 'Enter valid voltage and power values.' }
    }
    if (parsedVoltage < pdo.minVoltageV || parsedVoltage > pdo.maxVoltageV) {
      return {
        error: `Voltage must be between ${pdo.minVoltageV.toFixed(2)} and ${pdo.maxVoltageV.toFixed(2)} V.`,
      }
    }
    if (parsedPower <= 0 || parsedPower > pdo.maxPowerW) {
      return { error: `Power must be between 0 and ${pdo.maxPowerW.toFixed(2)} W.` }
    }
    if (parsedVoltage <= 0) {
      return { error: 'Voltage must be greater than 0 V for power conversion.' }
    }
    const derivedCurrentA = parsedPower / parsedVoltage
    if (!Number.isFinite(derivedCurrentA) || derivedCurrentA <= 0) {
      return { error: 'Derived current is invalid.' }
    }
    return {
      voltageMv: Math.round(parsedVoltage * 1000),
      currentMa: Math.round(derivedCurrentA * 1000),
    }
  }

  return { error: 'Unsupported PDO type.' }
}

/**
 * Render sink visibility and control UI for Dr.PD.
 */
export const DrpdSinkControlInstrumentView = ({
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
  const [sinkInfo, setSinkInfo] = useState<SinkInfo | null>(
    driver ? driver.getState().sinkInfo ?? null : null,
  )
  const [sinkPdoList, setSinkPdoList] = useState<SinkPdo[]>(
    driver ? driver.getState().sinkPdoList ?? [] : [],
  )
  const [role, setRole] = useState<CCBusRole | null>(
    driver ? driver.getState().role ?? null : null,
  )
  const [selectedIndex, setSelectedIndex] = useState<number>(0)
  const [voltageV, setVoltageV] = useState('')
  const [currentA, setCurrentA] = useState('')
  const [powerW, setPowerW] = useState('')
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('idle')
  const [requestMessage, setRequestMessage] = useState('')
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [isRefreshingSinkData, setIsRefreshingSinkData] = useState(false)

  const selectedPdo = sinkPdoList[selectedIndex] ?? null
  const negotiatedPdo = sinkInfo?.negotiatedPdo ?? null
  const negotiatedPdoIndex = findSinkPdoIndex(sinkPdoList, negotiatedPdo)
  const summaryPdo = negotiatedPdo ?? selectedPdo
  const summaryPdoIndex = negotiatedPdoIndex ?? (summaryPdo ? selectedIndex : null)
  const selectedPdoDetails = getSelectedPdoDetails(summaryPdo, summaryPdoIndex)

  useEffect(() => {
    if (!driver) {
      setSinkInfo(null)
      setSinkPdoList([])
      setRole(null)
      return
    }

    /**
     * Sync local sink state from the driver.
     */
    const syncFromDriver = () => {
      const snapshot = driver.getState()
      setSinkInfo(snapshot.sinkInfo ?? null)
      setSinkPdoList(snapshot.sinkPdoList ?? [])
      setRole(snapshot.role ?? null)
    }

    /**
     * Handle sink-related device state updates.
     *
     * @param event - Device event.
     */
    const handleStateUpdate = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      const changed = detail?.changed as Array<keyof DrpdDeviceSnapshot> | undefined
      if (!changed) {
        syncFromDriver()
        return
      }
      if (
        changed.includes('sinkInfo') ||
        changed.includes('sinkPdoList') ||
        changed.includes('role')
      ) {
        syncFromDriver()
      }
    }

    syncFromDriver()
    driver.addEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdate)

    return () => {
      driver.removeEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdate)
    }
  }, [driver])

  /**
   * Load sink role/info/PDOs directly from the device runtime.
   */
  const loadSinkData = async (): Promise<void> => {
    if (!driver || isRefreshingSinkData) {
      return
    }

    setIsRefreshingSinkData(true)
    try {
      const currentRole = await driver.ccBus.getRole()
      setRole(currentRole)
      if (currentRole !== CCBusRole.SINK) {
        setSinkInfo(null)
        setSinkPdoList([])
        return
      }

      const [info, pdoCount] = await Promise.all([
        driver.sink.getSinkInfo(),
        driver.sink.getAvailablePdoCount(),
      ])
      const pdoList = await Promise.all(
        Array.from({ length: pdoCount }, (_, index) => driver.sink.getPdoAtIndex(index)),
      )
      setSinkInfo(info)
      setSinkPdoList(pdoList)
      setRequestStatus((status) => (status === 'error' ? 'idle' : status))
      setRequestMessage('')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setRequestStatus('error')
      setRequestMessage(message)
    } finally {
      setIsRefreshingSinkData(false)
    }
  }

  useEffect(() => {
    if (!driver) {
      return
    }
    const snapshot = driver.getState()
    if (snapshot.sinkInfo != null || snapshot.sinkPdoList != null) {
      return
    }
    void loadSinkData()
  }, [driver])

  useEffect(() => {
    if (sinkPdoList.length === 0) {
      setSelectedIndex(0)
      return
    }
    if (selectedIndex > sinkPdoList.length - 1) {
      setSelectedIndex(0)
    }
  }, [selectedIndex, sinkPdoList])

  useEffect(() => {
    if (isAdvancedOpen) {
      return
    }
    if (negotiatedPdoIndex != null && negotiatedPdoIndex !== selectedIndex) {
      setSelectedIndex(negotiatedPdoIndex)
    }
  }, [isAdvancedOpen, negotiatedPdoIndex, selectedIndex])

  useEffect(() => {
    const defaults = buildDefaultForm(selectedPdo)
    setVoltageV(defaults.voltageV)
    setCurrentA(defaults.currentA)
    setPowerW(defaults.powerW)
    setRequestStatus('idle')
    setRequestMessage('')
  }, [selectedPdo])

  /**
   * Send a sink PDO request using current form values.
   */
  const handleRequest = async () => {
    if (!driver || !selectedPdo) {
      return
    }
    const parsed = buildRequestArgs({ pdo: selectedPdo, voltageV, currentA, powerW })
    if (parsed.error || parsed.voltageMv == null || parsed.currentMa == null) {
      setRequestStatus('error')
      setRequestMessage(parsed.error ?? 'Invalid request input.')
      return
    }

    setRequestStatus('sending')
    setRequestMessage('Sending request...')
    try {
      await driver.sink.requestPdo(selectedIndex, parsed.voltageMv, parsed.currentMa)
      await driver.refreshState()
      await loadSinkData()
      setRequestStatus('success')
      setRequestMessage('Request sent.')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setRequestStatus('error')
      setRequestMessage(message)
    }
  }

  const canSubmit =
    !!driver &&
    selectedPdo != null &&
    role === CCBusRole.SINK &&
    requestStatus !== 'sending'
  const sinkStateLabel = sinkInfo?.status ?? '--'
  const vsetLabel = `${formatNumber(sinkInfo ? sinkInfo.negotiatedVoltageMv / 1000 : null)} V`
  const isetLabel = `${formatNumber(sinkInfo ? sinkInfo.negotiatedCurrentMa / 1000 : null)} A`
  const requestStateMessage =
    requestMessage || (role !== CCBusRole.SINK ? 'Role is not SINK.' : 'Ready.')

  /**
   * Open/close the advanced change dialog and load sink data when needed.
   */
  const handleToggleAdvanced = () => {
    if (isAdvancedOpen) {
      setIsAdvancedOpen(false)
      return
    }

    if (negotiatedPdoIndex != null) {
      setSelectedIndex(negotiatedPdoIndex)
    }
    setIsAdvancedOpen(true)

    if (!driver || isRefreshingSinkData || sinkPdoList.length > 0) {
      return
    }
    void loadSinkData()
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
        <section className={`${styles.panel} ${styles.leftPanel}`}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>State</span>
            <span className={styles.rowValue}>
              {sinkStateLabel.charAt(0).toUpperCase() + sinkStateLabel.slice(1).toLowerCase()}
              {sinkInfo?.error ? ' (Error)' : ''}
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>VSET</span>
            <span className={`${styles.rowValue} ${styles.metricValue}`}>{vsetLabel}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>ISET</span>
            <span className={`${styles.rowValue} ${styles.metricValue}`}>{isetLabel}</span>
          </div>
        </section>

        <section className={`${styles.panel} ${styles.rightPanel}`}>
          <div className={`${styles.row} ${styles.rowWithAction}`}>
            <span className={styles.rowLabel}>PDO TYPE</span>
            <span className={`${styles.rowValue} ${styles.pdoTitle}`}>
              {selectedPdoDetails.title}
            </span>
            <span className={`${styles.rowState} ${styles.pdoTitle}`}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleToggleAdvanced}
                disabled={!driver}
                aria-expanded={isAdvancedOpen}
                aria-controls={`${instrument.id}-advanced-tune`}
              >
                {isRefreshingSinkData && sinkPdoList.length === 0 ? 'Loading...' : 'Change'}
              </button>
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>VRANGE</span>
            <span className={`${styles.rowValue} ${styles.pdoDetail}`}>
              {selectedPdoDetails.voltageRange}
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>IRANGE</span>
            <span className={`${styles.rowValue} ${styles.pdoDetail}`}>
              {selectedPdoDetails.currentRange}
            </span>
          </div>

          <div
            className={`${styles.srOnly} ${
              requestStatus === 'error'
                ? styles.messageError
                : requestStatus === 'success'
                  ? styles.messageSuccess
                  : ''
            }`}
            aria-live="polite"
          >
            {requestStateMessage}
          </div>

          {isAdvancedOpen ? (
            <div
              id={`${instrument.id}-advanced-tune`}
              className={styles.advancedPanel}
              role="dialog"
              aria-label="Sink request tuning"
            >
              <div className={styles.advancedHeader}>
                <span className={styles.advancedTitle}>Request Parameters</span>
                <div className={styles.advancedHeaderActions}>
                  <button
                    type="button"
                    className={styles.requestButton}
                    onClick={() => {
                      void handleRequest()
                    }}
                    disabled={!canSubmit}
                  >
                    {requestStatus === 'sending' ? 'Requesting...' : 'Request PDO'}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      setIsAdvancedOpen(false)
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>

              <label className={styles.fieldLabel} htmlFor={`${instrument.id}-pdo-select`}>
                Available PDOs
              </label>
              <select
                id={`${instrument.id}-pdo-select`}
                className={`${styles.control} ${styles.selectControl}`}
                value={String(selectedIndex)}
                onChange={(event) => {
                  setSelectedIndex(Number(event.target.value))
                }}
                disabled={sinkPdoList.length === 0}
              >
                {sinkPdoList.length === 0 ? (
                  <option value="0">No PDOs available</option>
                ) : (
                  sinkPdoList.map((pdo, index) => (
                    <option key={`pdo-${index}`} value={String(index)}>
                      #{index + 1} {formatPdoSummary(pdo)}
                    </option>
                  ))
                )}
              </select>

              {isRefreshingSinkData && sinkPdoList.length === 0 ? (
                <div className={styles.message}>Loading sink PDO list from device...</div>
              ) : null}

              <div className={styles.requestBody}>
                {selectedPdo?.type === SinkPdoType.FIXED ? (
                  <>
                    <label className={styles.fieldLabel} htmlFor={`${instrument.id}-voltage`}>
                      Voltage (V)
                    </label>
                    <input
                      id={`${instrument.id}-voltage`}
                      className={styles.control}
                      value={selectedPdo.voltageV.toFixed(2)}
                      readOnly
                    />

                    <label className={styles.fieldLabel} htmlFor={`${instrument.id}-current`}>
                      Current (A)
                    </label>
                    <input
                      id={`${instrument.id}-current`}
                      className={styles.control}
                      value={currentA}
                      onChange={(event) => setCurrentA(event.target.value)}
                    />
                  </>
                ) : null}

                {selectedPdo?.type === SinkPdoType.VARIABLE ||
                selectedPdo?.type === SinkPdoType.AUGMENTED ||
                selectedPdo?.type === SinkPdoType.SPR_PPS ? (
                  <>
                    <label className={styles.fieldLabel} htmlFor={`${instrument.id}-voltage`}>
                      Voltage (V)
                    </label>
                    <input
                      id={`${instrument.id}-voltage`}
                      className={styles.control}
                      value={voltageV}
                      onChange={(event) => setVoltageV(event.target.value)}
                    />

                    <label className={styles.fieldLabel} htmlFor={`${instrument.id}-current`}>
                      Current (A)
                    </label>
                    <input
                      id={`${instrument.id}-current`}
                      className={styles.control}
                      value={currentA}
                      onChange={(event) => setCurrentA(event.target.value)}
                    />
                  </>
                ) : null}

                {selectedPdo?.type === SinkPdoType.BATTERY ||
                selectedPdo?.type === SinkPdoType.SPR_AVS ||
                selectedPdo?.type === SinkPdoType.EPR_AVS ? (
                  <>
                    <label className={styles.fieldLabel} htmlFor={`${instrument.id}-voltage`}>
                      Voltage (V)
                    </label>
                    <input
                      id={`${instrument.id}-voltage`}
                      className={styles.control}
                      value={voltageV}
                      onChange={(event) => setVoltageV(event.target.value)}
                    />

                    <label className={styles.fieldLabel} htmlFor={`${instrument.id}-power`}>
                      Power (W)
                    </label>
                    <input
                      id={`${instrument.id}-power`}
                      className={styles.control}
                      value={powerW}
                      onChange={(event) => setPowerW(event.target.value)}
                    />
                  </>
                ) : null}
              </div>

              <div
                className={`${styles.message} ${
                  requestStatus === 'error'
                    ? styles.messageError
                    : requestStatus === 'success'
                      ? styles.messageSuccess
                      : ''
                }`}
              >
                {requestStateMessage}
              </div>
            </div>
          ) : null}
        </section>
      </div>
      {deviceRecord ? null : <div className={styles.unassigned}>Device: Unassigned</div>}
    </InstrumentBase>
  )
}
