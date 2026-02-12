import { useEffect, useMemo, useState } from 'react'
import {
  CCBusRole,
  DRPDDevice,
  type SinkInfo,
  type SinkPdo,
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
    case 'FIXED':
      return `FIXED ${pdo.voltageV.toFixed(2)}V / ${pdo.maxCurrentA.toFixed(2)}A`
    case 'VARIABLE':
      return `VARIABLE ${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)}V / ${pdo.maxCurrentA.toFixed(2)}A`
    case 'BATTERY':
      return `BATTERY ${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)}V / ${pdo.maxPowerW.toFixed(2)}W`
    case 'AUGMENTED':
      return `AUGMENTED ${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)}V / ${pdo.maxCurrentA.toFixed(2)}A`
    default:
      return 'Unknown'
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
    case 'FIXED':
      return {
        voltageV: pdo.voltageV.toFixed(2),
        currentA: pdo.maxCurrentA.toFixed(2),
        powerW: '',
      }
    case 'VARIABLE':
    case 'AUGMENTED':
      return {
        voltageV: pdo.minVoltageV.toFixed(2),
        currentA: pdo.maxCurrentA.toFixed(2),
        powerW: '',
      }
    case 'BATTERY':
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
  if (pdo.type === 'FIXED') {
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

  if (pdo.type === 'VARIABLE' || pdo.type === 'AUGMENTED') {
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

  if (pdo.type === 'BATTERY') {
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
  const [role, setRole] = useState<string | null>(
    driver ? driver.getState().role ?? null : null,
  )
  const [selectedIndex, setSelectedIndex] = useState<number>(0)
  const [voltageV, setVoltageV] = useState('')
  const [currentA, setCurrentA] = useState('')
  const [powerW, setPowerW] = useState('')
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('idle')
  const [requestMessage, setRequestMessage] = useState('')

  const selectedPdo = sinkPdoList[selectedIndex] ?? null
  const selectedSummary = useMemo(() => formatPdoSummary(selectedPdo), [selectedPdo])
  const negotiatedPowerW = useMemo(() => {
    if (!sinkInfo) {
      return null
    }
    return (sinkInfo.negotiatedVoltageMv / 1000) * (sinkInfo.negotiatedCurrentMa / 1000)
  }, [sinkInfo])

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
      const changed = detail?.changed as string[] | undefined
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
        <section className={styles.currentSection}>
          <div className={styles.sectionLabel}>Current PDO</div>
          <div className={styles.primaryValue}>{formatPdoSummary(sinkInfo?.negotiatedPdo ?? null)}</div>
          <div className={styles.statusRow}>
            <span>State: {sinkInfo?.status ?? '--'}</span>
            <span>Error: {sinkInfo?.error ? 'Yes' : 'No'}</span>
          </div>
          <div className={styles.statusRow}>
            <span>{formatNumber(sinkInfo ? sinkInfo.negotiatedVoltageMv / 1000 : null)} V</span>
            <span>{formatNumber(sinkInfo ? sinkInfo.negotiatedCurrentMa / 1000 : null)} A</span>
            <span>{formatNumber(negotiatedPowerW)} W</span>
          </div>
        </section>

        <section className={styles.controlSection}>
          <label className={styles.fieldLabel} htmlFor={`${instrument.id}-pdo-select`}>
            Available PDOs
          </label>
          <select
            id={`${instrument.id}-pdo-select`}
            className={styles.control}
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

          <div className={styles.requestPanel}>
            <div className={styles.requestTitle}>Request Parameters</div>
            <div className={styles.requestBody}>
              {selectedPdo?.type === 'FIXED' ? (
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

              {selectedPdo?.type === 'VARIABLE' || selectedPdo?.type === 'AUGMENTED' ? (
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

              {selectedPdo?.type === 'BATTERY' ? (
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
          </div>

          <div className={styles.footer}>
            <span className={styles.footerNote}>Selected: {selectedSummary}</span>
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
            {requestMessage || (role !== CCBusRole.SINK ? 'Role is not SINK.' : 'Ready.')}
          </div>
        </section>
      </div>
      {deviceRecord ? null : <div className={styles.unassigned}>Device: Unassigned</div>}
    </InstrumentBase>
  )
}
