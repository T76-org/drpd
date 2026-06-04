import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CCBusRole, DRPDDriverRuntime } from '../../../../lib/device'
import { Dialog, DialogButton } from '../../../../ui/overlays'
import styles from './CalibrationDialogs.module.css'

export type CalibrationKind = 'voltage' | 'current'

export interface CalibrationDialogTarget {
  recordId: string
  deviceName: string
  kind: CalibrationKind
  previousRole?: CCBusRole | null
}

interface CalibrationSafetyDialogProps {
  target: CalibrationDialogTarget | null
  suppressWarning: boolean
  onSuppressWarningChange: (value: boolean) => void
  onCancel: () => void
  onConfirm: () => void
}

interface CalibrationManagementDialogProps {
  target: CalibrationDialogTarget | null
  driver?: DRPDDriverRuntime
  onOpenChange: (open: boolean) => void
  onCalibrated: () => Promise<void>
}

interface CalibrationStartErrorDialogProps {
  message: string | null
  onClose: () => void
}

interface CalibrationRow {
  id: number
  nominal: number
  recordedDelta: number
  commandValue: number
}

interface PendingCalibration {
  row: CalibrationRow
  liveValue: number
  message: string
}

const VOLTAGE_POINT_COUNT = 61
const CURRENT_POINT_COUNT = 13
const CURRENT_INTERVAL_A = 0.5
const CURRENT_INTERVAL_MA = 500
const RELATIVE_WARNING_THRESHOLD = 0.10
const ZERO_VOLTAGE_WARNING_THRESHOLD = 0.10
const ZERO_CURRENT_WARNING_THRESHOLD = 0.05
const RESET_SETTLE_DELAY_MS = 500

export const CalibrationSafetyDialog = ({
  target,
  suppressWarning,
  onSuppressWarningChange,
  onCancel,
  onConfirm,
}: CalibrationSafetyDialogProps) => (
  <Dialog
    open={target != null}
    onOpenChange={(open) => {
      if (!open) {
        onCancel()
      }
    }}
    title="Calibration warning"
    description={`Changing calibration data for ${target?.deviceName ?? 'this device'} can affect measurements.`}
    dismissible={false}
    footer={
      <div className={styles.safetyFooter}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={suppressWarning}
            onChange={(event) => onSuppressWarningChange(event.currentTarget.checked)}
          />
          <span>Do not ask again</span>
        </label>
        <div className={styles.buttonGroup}>
          <DialogButton onClick={onCancel}>No</DialogButton>
          <DialogButton variant="danger" onClick={onConfirm}>Yes</DialogButton>
        </div>
      </div>
    }
  >
    <p className={styles.intro}>
      Changing the calibration data can affect Dr. PD&apos;s ability to accurately measure
      voltage, current, and power and may result in damage to your devices. Are you sure you
      want to continue?
    </p>
  </Dialog>
)

export const CalibrationStartErrorDialog = ({
  message,
  onClose,
}: CalibrationStartErrorDialogProps) => (
  <Dialog
    open={message != null}
    onOpenChange={(open) => {
      if (!open) {
        onClose()
      }
    }}
    title="Cannot start calibration"
    description="Calibration setup required"
    footer={<DialogButton onClick={onClose}>Close</DialogButton>}
  >
    <p className={styles.intro}>{message}</p>
  </Dialog>
)

export const CalibrationManagementDialog = ({
  target,
  driver,
  onOpenChange,
  onCalibrated,
}: CalibrationManagementDialogProps) => {
  const [table, setTable] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [applyingRowId, setApplyingRowId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingCalibration, setPendingCalibration] = useState<PendingCalibration | null>(null)

  const rows = useMemo(() => buildCalibrationRows(target?.kind ?? 'voltage', table), [table, target?.kind])

  const loadTable = useCallback(async () => {
    if (!target || !driver) {
      setTable([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const nextTable = target.kind === 'voltage'
        ? await driver.analogMonitor.getVBusCalibrationTable()
        : await driver.analogMonitor.getVBusCurrentCalibrationTable()
      setTable(nextTable)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [driver, target])

  useEffect(() => {
    if (!target) {
      setTable([])
      setError(null)
      setPendingCalibration(null)
      setApplyingRowId(null)
      return
    }
    void loadTable()
  }, [loadTable, target])

  const applyCalibration = useCallback(async (row: CalibrationRow): Promise<void> => {
    if (!target || !driver) {
      return
    }
    setApplyingRowId(row.id)
    setError(null)
    try {
      if (target.kind === 'voltage') {
        await driver.analogMonitor.setVBusCalibrationTablePoint(row.commandValue, 0)
        await sleep(RESET_SETTLE_DELAY_MS)
        await driver.analogMonitor.calibrateVBusBucket(row.commandValue)
      } else {
        await driver.analogMonitor.setVBusCurrentCalibrationTablePoint(
          row.commandValue,
          row.commandValue / 1000,
        )
        await sleep(RESET_SETTLE_DELAY_MS)
        await driver.analogMonitor.calibrateVBusCurrentBucket(row.commandValue)
      }
      await loadTable()
      await onCalibrated()
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : String(applyError))
    } finally {
      setApplyingRowId(null)
    }
  }, [driver, loadTable, onCalibrated, target])

  const requestCalibration = useCallback(async (row: CalibrationRow) => {
    if (!target || !driver) {
      return
    }
    setApplyingRowId(row.id)
    setError(null)
    try {
      const liveValue = target.kind === 'voltage'
        ? await driver.analogMonitor.getVBusVoltage()
        : Math.abs(await driver.analogMonitor.getRawVBusCurrent())
      const warning = buildDistanceWarning(target.kind, row.nominal, liveValue)
      if (warning) {
        setPendingCalibration({ row, liveValue, message: warning })
        return
      }
      await applyCalibration(row)
    } catch (calibrationError) {
      setError(calibrationError instanceof Error ? calibrationError.message : String(calibrationError))
    } finally {
      setApplyingRowId(null)
    }
  }, [applyCalibration, driver, target])

  const title = target?.kind === 'current' ? 'Calibrate current' : 'Calibrate voltage'
  const description = target
    ? `${target.deviceName} ${target.kind} calibration`
    : undefined

  return (
    <>
      <Dialog
        open={target != null}
        onOpenChange={onOpenChange}
        title={title}
        description={description}
        dialogStyle={{ width: 'min(720px, calc(100vw - var(--space-32)))' }}
        footer={<DialogButton onClick={() => onOpenChange(false)}>Close</DialogButton>}
      >
        <p className={styles.intro}>{getCalibrationIntro(target?.kind ?? 'voltage')}</p>
        {loading ? <p className={styles.status}>Loading calibration table...</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nominal</th>
                <th>Recorded delta</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatNominal(target?.kind ?? 'voltage', row.nominal)}</td>
                  <td>{formatDelta(target?.kind ?? 'voltage', row.recordedDelta)}</td>
                  <td>
                    <DialogButton
                      className={styles.rowButton}
                      disabled={loading || applyingRowId != null}
                      onClick={() => {
                        void requestCalibration(row)
                      }}
                    >
                      {applyingRowId === row.id ? 'Working' : 'Calibrate'}
                    </DialogButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Dialog>
      <Dialog
        open={pendingCalibration != null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingCalibration(null)
          }
        }}
        title="Confirm calibration point"
        description="Live measurement is far from nominal."
        dismissible={false}
        footer={
          <>
            <DialogButton onClick={() => setPendingCalibration(null)}>Cancel</DialogButton>
            <DialogButton
              variant="danger"
              onClick={() => {
                const pending = pendingCalibration
                setPendingCalibration(null)
                if (pending) {
                  void applyCalibration(pending.row)
                }
              }}
            >
              Continue
            </DialogButton>
          </>
        }
      >
        <p className={styles.intro}>{pendingCalibration?.message}</p>
      </Dialog>
    </>
  )
}

const buildCalibrationRows = (kind: CalibrationKind, table: number[]): CalibrationRow[] => {
  if (kind === 'voltage') {
    return Array.from({ length: VOLTAGE_POINT_COUNT }, (_, index) => ({
      id: index,
      nominal: index,
      recordedDelta: table[index] ?? 0,
      commandValue: index,
    }))
  }
  return Array.from({ length: CURRENT_POINT_COUNT }, (_, index) => {
    const nominal = index * CURRENT_INTERVAL_A
    const raw = table[index] ?? nominal
    return {
      id: index,
      nominal,
      recordedDelta: raw - nominal,
      commandValue: index * CURRENT_INTERVAL_MA,
    }
  })
}

const sleep = async (durationMs: number): Promise<void> =>
  await new Promise((resolve) => {
    window.setTimeout(resolve, durationMs)
  })

const getCalibrationIntro = (kind: CalibrationKind): string => {
  if (kind === 'voltage') {
    return 'Apply the listed nominal voltage to VBUS, then calibrate the matching row. Stored deltas are additive corrections in volts.'
  }
  return 'Draw the listed nominal current from VBUS, then calibrate the matching row. Stored deltas show raw current offset from nominal current.'
}

const formatNominal = (kind: CalibrationKind, value: number): string =>
  kind === 'voltage' ? `${value.toFixed(0)} V` : `${value.toFixed(1)} A`

const formatDelta = (kind: CalibrationKind, value: number): string => {
  const unit = kind === 'voltage' ? 'V' : 'A'
  const text = value >= 0 ? `+${value.toFixed(3)}` : value.toFixed(3)
  return `${text} ${unit}`
}

const buildDistanceWarning = (
  kind: CalibrationKind,
  nominal: number,
  liveValue: number,
): string | null => {
  const label = kind === 'voltage' ? 'voltage' : 'current'
  const unit = kind === 'voltage' ? 'V' : 'A'
  const zeroThreshold = kind === 'voltage'
    ? ZERO_VOLTAGE_WARNING_THRESHOLD
    : ZERO_CURRENT_WARNING_THRESHOLD
  const tooFar = nominal === 0
    ? Math.abs(liveValue) > zeroThreshold
    : Math.abs(liveValue - nominal) / nominal > RELATIVE_WARNING_THRESHOLD
  if (!tooFar) {
    return null
  }
  return `Measured ${label} is ${liveValue.toFixed(3)} ${unit}, but selected nominal value is ${nominal.toFixed(kind === 'voltage' ? 0 : 1)} ${unit}. Continue changing this calibration point?`
}
