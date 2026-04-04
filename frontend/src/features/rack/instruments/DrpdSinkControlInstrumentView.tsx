import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CCBusRole,
  DRPDDevice,
  type DRPDDeviceState as DrpdDeviceSnapshot,
  type SinkInfo,
  type SinkPdo,
  SinkPdoType,
  SinkState,
} from '../../../lib/device'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase, type InstrumentHeaderControl } from '../InstrumentBase'
import type { RackDeviceState } from '../RackRenderer'
import styles from './DrpdSinkControlInstrumentView.module.css'

type RequestStatus = 'idle' | 'sending' | 'success' | 'error'
type NonNullSinkPdo = Exclude<SinkPdo, null>

const PopoverLifecycle = ({
  onMount,
  onUnmount,
}: {
  onMount: () => void
  onUnmount: () => void
}) => {
  useEffect(() => {
    onMount()
    return onUnmount
  }, [onMount, onUnmount])
  return null
}

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
 * Build a human-readable PDO type label.
 *
 * @param pdo - PDO value.
 * @returns PDO type display label.
 */
const getPdoTypeLabel = (pdo: SinkPdo | null | undefined): string => {
  if (!pdo) {
    return 'None'
  }
  switch (pdo.type) {
    case SinkPdoType.FIXED:
      return 'Fixed'
    case SinkPdoType.VARIABLE:
      return 'Variable'
    case SinkPdoType.BATTERY:
      return 'Battery'
    case SinkPdoType.AUGMENTED:
      return 'Augmented'
    case SinkPdoType.SPR_PPS:
      return 'SPR PPS'
    case SinkPdoType.SPR_AVS:
      return 'SPR AVS'
    case SinkPdoType.EPR_AVS:
      return 'EPR AVS'
    default:
      return 'Unknown'
  }
}

/**
 * Return true when a PDO is power-limited (Battery/AVS).
 *
 * @param pdo - PDO value.
 * @returns True when current limit depends on voltage and max power.
 */
const isPowerLimitedPdo = (pdo: SinkPdo | null | undefined): boolean => (
  pdo?.type === SinkPdoType.BATTERY ||
  pdo?.type === SinkPdoType.SPR_AVS ||
  pdo?.type === SinkPdoType.EPR_AVS
)

/**
 * Build the secondary line shown in the PDO list.
 *
 * @param pdo - PDO value.
 * @returns Two-line list subtitle content.
 */
const getPdoListSecondaryLine = (pdo: NonNullSinkPdo): string => {
  switch (pdo.type) {
    case SinkPdoType.FIXED:
      return `${pdo.voltageV.toFixed(2)} V / ${pdo.maxCurrentA.toFixed(2)} A`
    case SinkPdoType.VARIABLE:
      return `${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)} V / ${pdo.maxCurrentA.toFixed(2)} A`
    case SinkPdoType.AUGMENTED:
      return `${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)} V / ${pdo.maxCurrentA.toFixed(2)} A`
    case SinkPdoType.SPR_PPS:
      return `${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)} V / ${pdo.maxCurrentA.toFixed(2)} A`
    case SinkPdoType.BATTERY:
    case SinkPdoType.SPR_AVS:
    case SinkPdoType.EPR_AVS:
      return `${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)} V / ${pdo.maxPowerW.toFixed(2)} W max`
    default:
      return '--'
  }
}

/**
 * Get whether voltage is user-editable for a PDO.
 *
 * @param pdo - PDO value.
 * @returns True when voltage can be edited.
 */
const isVoltageEditable = (pdo: SinkPdo | null | undefined): boolean => (
  pdo?.type === SinkPdoType.VARIABLE ||
  pdo?.type === SinkPdoType.AUGMENTED ||
  pdo?.type === SinkPdoType.SPR_PPS ||
  pdo?.type === SinkPdoType.BATTERY ||
  pdo?.type === SinkPdoType.SPR_AVS ||
  pdo?.type === SinkPdoType.EPR_AVS
)

/**
 * Compute voltage bounds for a PDO.
 *
 * @param pdo - PDO value.
 * @returns Voltage bounds and editability metadata.
 */
const getVoltageConstraints = (
  pdo: SinkPdo | null | undefined,
): { editable: boolean; fixedV?: number; minV?: number; maxV?: number } => {
  if (!pdo) {
    return { editable: false }
  }
  if (pdo.type === SinkPdoType.FIXED) {
    return { editable: false, fixedV: pdo.voltageV }
  }
  return {
    editable: true,
    minV: pdo.minVoltageV,
    maxV: pdo.maxVoltageV,
  }
}

/**
 * Compute current limit range for a PDO at a requested voltage.
 *
 * For power-limited PDOs the maximum current is derived from `maxPowerW / voltageV`.
 *
 * @param pdo - PDO value.
 * @param requestedVoltageV - Requested voltage.
 * @returns Current bounds and optional validation error.
 */
const getCurrentConstraints = (
  pdo: SinkPdo | null | undefined,
  requestedVoltageV: number | null,
): { minA: number; maxA?: number; error?: string } => {
  if (!pdo) {
    return { minA: 0, error: 'Select a PDO before requesting power.' }
  }

  if (pdo.type === SinkPdoType.FIXED) {
    return { minA: 0, maxA: pdo.maxCurrentA }
  }

  if (
    pdo.type === SinkPdoType.VARIABLE ||
    pdo.type === SinkPdoType.AUGMENTED ||
    pdo.type === SinkPdoType.SPR_PPS
  ) {
    return { minA: 0, maxA: pdo.maxCurrentA }
  }

  if (isPowerLimitedPdo(pdo)) {
    if (requestedVoltageV == null || !Number.isFinite(requestedVoltageV)) {
      return { minA: 0, error: 'Enter a valid voltage to compute the current range.' }
    }
    if (requestedVoltageV <= 0) {
      return { minA: 0, error: 'Voltage must be greater than 0 V.' }
    }
    if ('maxPowerW' in pdo) {
      return {
        minA: 0,
        maxA: pdo.maxPowerW / requestedVoltageV,
      }
    }
    return { minA: 0, error: 'Unsupported augmented PDO current limit format.' }
  }

  return { minA: 0, error: 'Unsupported PDO type.' }
}

/**
 * Format the detailed sink state into a concise UI label.
 *
 * @param state - Sink state token from the device.
 * @returns Human-readable sink state label.
 */
const formatSinkStateLabel = (state: SinkInfo['status'] | null | undefined): string => {
  if (!state) {
    return '--'
  }

  switch (state) {
    case SinkState.DISCONNECTED:
      return 'Disconnected'
    case SinkState.PE_SNK_TRANSITION_SINK:
      return 'Awaiting PS_RDY'
    case SinkState.PE_SNK_READY:
      return 'Connected'
    case SinkState.PE_SNK_EPR_KEEPALIVE:
      return 'EPR Keepalive'
    case SinkState.ERROR:
      return 'Error'
    default:
      return state.replaceAll('_', ' ')
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
          currentRange: `${lowCurrentA.toFixed(2)}-${highCurrentA.toFixed(2)} A`,
        }
      }
    case SinkPdoType.SPR_AVS:
        {
          const lowCurrentA = pdo.maxPowerW / pdo.maxVoltageV
          const highCurrentA = pdo.maxPowerW / pdo.minVoltageV
          return {
            title: 'SPR AVS',
            voltageRange: `${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)} V`,
            currentRange: `${lowCurrentA.toFixed(2)}-${highCurrentA.toFixed(2)} A`,
          }
        }
    case SinkPdoType.EPR_AVS:
      {
        const lowCurrentA = pdo.maxPowerW / pdo.maxVoltageV
        const highCurrentA = pdo.maxPowerW / pdo.minVoltageV
        return {
          title: 'EPR AVS',
          voltageRange: `${pdo.minVoltageV.toFixed(2)}-${pdo.maxVoltageV.toFixed(2)} V`,
          currentRange: `${lowCurrentA.toFixed(2)}-${highCurrentA.toFixed(2)} A`,
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
): { voltageV: string; currentA: string } => {
  if (!pdo) {
    return { voltageV: '', currentA: '' }
  }
  switch (pdo.type) {
    case SinkPdoType.FIXED:
      return {
        voltageV: pdo.voltageV.toFixed(2),
        currentA: pdo.maxCurrentA.toFixed(2),
      }
    case SinkPdoType.VARIABLE:
    case SinkPdoType.AUGMENTED:
    case SinkPdoType.SPR_PPS:
      return {
        voltageV: pdo.minVoltageV.toFixed(2),
        currentA: pdo.maxCurrentA.toFixed(2),
      }
    case SinkPdoType.BATTERY:
    case SinkPdoType.SPR_AVS:
    case SinkPdoType.EPR_AVS:
      return {
        voltageV: pdo.minVoltageV.toFixed(2),
        currentA: (pdo.maxPowerW / pdo.minVoltageV).toFixed(2),
      }
    default:
      return { voltageV: '', currentA: '' }
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
 * @returns Validation result and converted units.
 */
const buildRequestArgs = ({
  pdo,
  voltageV,
  currentA,
}: {
  pdo: NonNullSinkPdo
  voltageV: string
  currentA: string
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
    const parsedCurrent = parseField(currentA)
    if (parsedVoltage == null || parsedCurrent == null) {
      return { error: 'Enter valid voltage and current values.' }
    }
    if (parsedVoltage < pdo.minVoltageV || parsedVoltage > pdo.maxVoltageV) {
      return {
        error: `Voltage must be between ${pdo.minVoltageV.toFixed(2)} and ${pdo.maxVoltageV.toFixed(2)} V.`,
      }
    }
    const currentConstraints = getCurrentConstraints(pdo, parsedVoltage)
    if (currentConstraints.error || currentConstraints.maxA == null) {
      return { error: currentConstraints.error ?? 'Current range is unavailable.' }
    }
    if (parsedCurrent < currentConstraints.minA || parsedCurrent > currentConstraints.maxA) {
      return {
        error: `Current must be between ${currentConstraints.minA.toFixed(2)} and ${currentConstraints.maxA.toFixed(2)} A.`,
      }
    }
    return {
      voltageMv: Math.round(parsedVoltage * 1000),
      currentMa: Math.round(parsedCurrent * 1000),
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
  onRemove,
  onUpdateDeviceConfig,
}: {
  instrument: RackInstrument
  displayName: string
  deviceRecord?: RackDeviceRecord
  deviceState?: RackDeviceState
  isEditMode: boolean
  onRemove?: (instrumentId: string) => void
  onUpdateDeviceConfig?: (
    deviceRecordId: string,
    updater: (current: Record<string, unknown> | undefined) => Record<string, unknown>,
  ) => Promise<void> | void
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
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('idle')
  const [requestErrorMessage, setRequestErrorMessage] = useState<string | null>(null)
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [isRefreshingSinkData, setIsRefreshingSinkData] = useState(false)

  const isRefreshingRef = useRef(false)

  const selectedPdo = sinkPdoList[selectedIndex] ?? null
  const negotiatedPdo = sinkInfo?.negotiatedPdo ?? null
  const negotiatedPdoIndex = findSinkPdoIndex(sinkPdoList, negotiatedPdo)
  const summaryPdo = negotiatedPdo ?? selectedPdo
  const summaryPdoIndex = negotiatedPdoIndex ?? (summaryPdo ? selectedIndex : null)
  const selectedPdoDetails = getSelectedPdoDetails(summaryPdo, summaryPdoIndex)
  const parsedVoltageForRange = parseField(
    selectedPdo?.type === SinkPdoType.FIXED ? selectedPdo.voltageV.toFixed(2) : voltageV,
  )
  const currentConstraints = getCurrentConstraints(selectedPdo, parsedVoltageForRange)
  const voltageConstraints = getVoltageConstraints(selectedPdo)
  const requestPreview = selectedPdo
    ? buildRequestArgs({ pdo: selectedPdo, voltageV, currentA })
    : { error: 'Select a PDO before requesting power.' }

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
  const loadSinkData = useCallback(async (): Promise<void> => {
    if (!driver || isRefreshingRef.current) {
      return
    }

    isRefreshingRef.current = true
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
      setRequestErrorMessage(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setRequestStatus('error')
      setRequestErrorMessage(message)
      console.warn('Failed to request PDO:', message)
    } finally {
      isRefreshingRef.current = false
      setIsRefreshingSinkData(false)
    }
  }, [driver])

  useEffect(() => {
    if (!driver) {
      return
    }
    const snapshot = driver.getState()
    if (snapshot.sinkInfo != null || snapshot.sinkPdoList != null) {
      return
    }
    void loadSinkData()
  }, [driver, loadSinkData])

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
    setRequestStatus('idle')
    setRequestErrorMessage(null)
  }, [selectedPdo])

  const handleRequest = async (onSuccess?: () => void) => {
    if (!driver || !selectedPdo) {
      return
    }
    const parsed = buildRequestArgs({ pdo: selectedPdo, voltageV, currentA })
    if (parsed.error || parsed.voltageMv == null || parsed.currentMa == null) {
      setRequestStatus('error')
      setRequestErrorMessage(parsed.error ?? 'Invalid request parameters.')
      console.warn('Invalid request parameters:', parsed.error)
      return
    }

    setRequestStatus('sending')
    setRequestErrorMessage(null)
    try {
      await driver.sink.requestPdo(selectedIndex, parsed.voltageMv, parsed.currentMa)
      if (deviceRecord && onUpdateDeviceConfig) {
        await onUpdateDeviceConfig(deviceRecord.id, (current) => {
          const source = current && typeof current === 'object' ? current : {}
          return {
            ...source,
            sinkRequest: {
              index: selectedIndex,
              voltageMv: parsed.voltageMv,
              currentMa: parsed.currentMa,
            },
          }
        })
      }
      await driver.refreshState()
      await loadSinkData()
      setRequestStatus('success')
      onSuccess?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setRequestStatus('error')
      setRequestErrorMessage(message)
      console.warn('Failed to request PDO:', message)
    }
  }

  const canSubmit =
    !!driver &&
    selectedPdo != null &&
    role === CCBusRole.SINK &&
    requestStatus !== 'sending' &&
    !requestPreview.error
  const validationMessage = requestPreview.error ?? null
  const currentRangeLabel = currentConstraints.maxA == null
    ? '--'
    : `0.00-${currentConstraints.maxA.toFixed(2)} A`
  const voltageHint = !selectedPdo
    ? '--'
    : voltageConstraints.editable
      ? `${voltageConstraints.minV?.toFixed(2)}-${voltageConstraints.maxV?.toFixed(2)} V`
      : ''
  const sinkStateLabel = formatSinkStateLabel(sinkInfo?.status)
  const vsetLabel = `${formatNumber(sinkInfo ? sinkInfo.negotiatedVoltageMv / 1000 : null)} V`
  const isetLabel = `${formatNumber(sinkInfo ? sinkInfo.negotiatedCurrentMa / 1000 : null)} A`

  const prepareAdvancedPopover = () => {
    if (negotiatedPdoIndex != null) {
      setSelectedIndex(negotiatedPdoIndex)
    }
    setRequestErrorMessage(null)
    setRequestStatus('idle')

    if (!driver || isRefreshingSinkData || sinkPdoList.length > 0) {
      return
    }
    void loadSinkData()
  }

  const headerControls: InstrumentHeaderControl[] = [
    {
      id: 'set-pdo',
      label: 'Set PDO',
      disabled: !driver || isEditMode,
      onClick: () => {
        prepareAdvancedPopover()
      },
      renderPopover: ({ closePopover }) => (
        <div
          id={`${instrument.id}-advanced-tune`}
          className={styles.advancedPanel}
          role="dialog"
          aria-label="Sink request tuning"
        >
          <PopoverLifecycle
            onMount={() => setIsAdvancedOpen(true)}
            onUnmount={() => setIsAdvancedOpen(false)}
          />
          <div className={styles.advancedLayout}>
            <div className={styles.pdoListPane}>
              {isRefreshingSinkData && sinkPdoList.length === 0 ? (
                <div className={styles.message}>Loading sink PDO list from device...</div>
              ) : null}
              <div
                className={styles.pdoList}
                role="listbox"
                aria-label="Available PDOs"
                data-testid="pdo-list"
              >
                {sinkPdoList.length === 0 ? (
                  <div className={styles.emptyList}>No PDOs available</div>
                ) : (
                  sinkPdoList.map((pdo, index) => (
                    <button
                      key={`pdo-${index}`}
                      type="button"
                      role="option"
                      aria-selected={selectedIndex === index}
                      className={`${styles.pdoListItem} ${selectedIndex === index ? styles.pdoListItemSelected : ''}`}
                      onClick={() => {
                        setSelectedIndex(index)
                        setRequestErrorMessage(null)
                        setRequestStatus('idle')
                      }}
                    >
                      <span className={styles.pdoListItemTitle}>
                        #{index + 1} {getPdoTypeLabel(pdo)}
                      </span>
                      <span className={styles.pdoListItemDetail}>
                        {pdo ? getPdoListSecondaryLine(pdo) : '--'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className={styles.requestPane}>
              <div className={styles.requestBody}>
                <label className={styles.fieldLabel} htmlFor={`${instrument.id}-voltage`}>
                  Voltage
                </label>
                <input
                  id={`${instrument.id}-voltage`}
                  className={styles.control}
                  value={selectedPdo?.type === SinkPdoType.FIXED ? selectedPdo.voltageV.toFixed(2) : voltageV}
                  onChange={(event) => {
                    setVoltageV(event.target.value)
                    setRequestErrorMessage(null)
                    setRequestStatus('idle')
                  }}
                  readOnly={!isVoltageEditable(selectedPdo)}
                  aria-readonly={!isVoltageEditable(selectedPdo)}
                  disabled={!selectedPdo}
                />

                <div className={styles.fieldMeta} />
                <div className={styles.fieldHint}>{voltageHint}</div>

                <label className={styles.fieldLabel} htmlFor={`${instrument.id}-current`}>
                  Current
                </label>
                <input
                  id={`${instrument.id}-current`}
                  className={styles.control}
                  value={currentA}
                  onChange={(event) => {
                    setCurrentA(event.target.value)
                    setRequestErrorMessage(null)
                    setRequestStatus('idle')
                  }}
                  disabled={!selectedPdo}
                />

                <div className={styles.fieldMeta} />
                <div className={styles.fieldHint}>
                  {currentRangeLabel}
                </div>
              </div>

              <div
                className={`${styles.message} ${
                  validationMessage || requestErrorMessage ? styles.messageError : ''
                }`}
                aria-live="polite"
              >
                {validationMessage ?? requestErrorMessage ?? ''}
              </div>

              <div className={styles.requestActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    closePopover()
                    setRequestErrorMessage(null)
                    setRequestStatus('idle')
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.requestButton}
                  onClick={() => {
                    void handleRequest(closePopover)
                  }}
                  disabled={!canSubmit}
                >
                  {requestStatus === 'sending' ? 'Setting...' : 'Set PDO'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ]

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
        <section className={`${styles.panel} ${styles.leftPanel}`}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>State</span>
            <span className={styles.rowValue}>
              {sinkStateLabel}
              {sinkInfo?.error ? ' (Error)' : ''}
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>VSET</span>
            <span className={`${styles.rowValue} ${styles.metricValue} ${styles.voltageValue}`}>
              {vsetLabel}
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>ISET</span>
            <span className={`${styles.rowValue} ${styles.metricValue} ${styles.currentValue}`}>
              {isetLabel}
            </span>
          </div>
        </section>

        <section className={`${styles.panel} ${styles.rightPanel}`}>
          <div className={`${styles.row} ${styles.rowWithAction}`}>
            <span className={styles.rowLabel}>PDO TYPE</span>
            <span className={`${styles.rowValue} ${styles.pdoTitle}`}>
              {selectedPdoDetails.title}
            </span>
            <span className={styles.rowState} />
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>VRANGE</span>
            <span className={`${styles.rowValue} ${styles.pdoDetail} ${styles.voltageValue}`}>
              {selectedPdoDetails.voltageRange}
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>IRANGE</span>
            <span className={`${styles.rowValue} ${styles.pdoDetail} ${styles.currentValue}`}>
              {selectedPdoDetails.currentRange}
            </span>
          </div>

        </section>
      </div>
      {deviceRecord ? null : <div className={styles.unassigned}>Device: Unassigned</div>}
    </InstrumentBase>
  )
}
