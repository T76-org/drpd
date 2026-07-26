import { useEffect, useMemo, useState } from 'react'
import type { DRPDDriverRuntime } from '../../../../lib/device'
import { DRPDBMCDecoderConfiguration } from '../../../../lib/device/drpd/system'
import {
  Dialog,
  DialogButton,
  DialogForm,
  DialogFormRow,
  DialogInput,
} from '../../../../ui/overlays'
import styles from './CalibrationDialogs.module.css'

export interface BMCDecoderConfigurationTarget {
  recordId: string
  deviceName: string
}

interface SafetyProps {
  target: BMCDecoderConfigurationTarget | null
  suppressWarning: boolean
  onSuppressWarningChange: (value: boolean) => void
  onCancel: () => void
  onConfirm: () => void
}

export const BMCDecoderConfigurationSafetyDialog = ({
  target,
  suppressWarning,
  onSuppressWarningChange,
  onCancel,
  onConfirm,
}: SafetyProps) => (
  <Dialog
    open={target != null}
    onOpenChange={(open) => { if (!open) onCancel() }}
    title="Warning"
    dismissible={false}
    footer={
      <div className={styles.safetyFooter}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={suppressWarning}
            onChange={(event) => onSuppressWarningChange(event.currentTarget.checked)}
          />
          <span>Do not show this again</span>
        </label>
        <div className={styles.buttonGroup}>
          <DialogButton onClick={onCancel}>Cancel</DialogButton>
          <DialogButton variant="danger" onClick={onConfirm}>Continue</DialogButton>
        </div>
      </div>
    }
  >
    <p className={styles.intro}>
      Changing internal settings can prevent Dr. PD from decoding USB-PD traffic and may render
      it inoperable until defaults are restored. Continue only if you understand the physical-layer
      impact.
    </p>
  </Dialog>
)

interface ConfigurationProps {
  target: BMCDecoderConfigurationTarget | null
  driver?: DRPDDriverRuntime
  onOpenChange: (open: boolean) => void
}

const voltageValid = (value: number): boolean => {
  const steps = (value - DRPDBMCDecoderConfiguration.VREF_MIN_VOLTS) /
    DRPDBMCDecoderConfiguration.VREF_STEP_VOLTS
  return Number.isFinite(value) && value >= DRPDBMCDecoderConfiguration.VREF_MIN_VOLTS &&
    value <= DRPDBMCDecoderConfiguration.VREF_MAX_VOLTS &&
    Math.abs(steps - Math.round(steps)) <= 1e-9
}

const frequencyValid = (value: number): boolean =>
  Number.isInteger(value) && value >= DRPDBMCDecoderConfiguration.PWM_MIN_HZ &&
  value <= DRPDBMCDecoderConfiguration.PWM_MAX_HZ &&
  value % DRPDBMCDecoderConfiguration.PWM_STEP_HZ === 0

export const BMCDecoderConfigurationDialog = ({
  target,
  driver,
  onOpenChange,
}: ConfigurationProps) => {
  const [voltage, setVoltage] = useState('')
  const [frequency, setFrequency] = useState('')
  const [initialVoltage, setInitialVoltage] = useState<number | null>(null)
  const [initialFrequency, setInitialFrequency] = useState<number | null>(null)
  const [voltageResetPending, setVoltageResetPending] = useState(false)
  const [frequencyResetPending, setFrequencyResetPending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!target || !driver) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void Promise.all([
      driver.system.configuration.bmcDecoder.getCCVrefVoltage(),
      driver.system.configuration.bmcDecoder.getCCVrefPwmFrequencyHz(),
    ]).then(([loadedVoltage, loadedFrequency]) => {
      if (cancelled) return
      setInitialVoltage(loadedVoltage)
      setInitialFrequency(loadedFrequency)
      setVoltage(loadedVoltage.toFixed(2))
      setFrequency(String(loadedFrequency))
      setVoltageResetPending(false)
      setFrequencyResetPending(false)
    }).catch((loadError) => {
      if (!cancelled) setError(`Unable to load settings: ${loadError instanceof Error ? loadError.message : String(loadError)}`)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [driver, target])

  const parsedVoltage = Number(voltage)
  const parsedFrequency = Number(frequency)
  const valid = voltageValid(parsedVoltage) && frequencyValid(parsedFrequency)
  const changed = initialVoltage != null && initialFrequency != null &&
    (voltageResetPending || frequencyResetPending ||
      parsedVoltage !== initialVoltage || parsedFrequency !== initialFrequency)
  const validationMessage = useMemo(() => {
    if (voltage && !voltageValid(parsedVoltage)) return 'Voltage must be 0.20–2.50 V in 0.05 V increments.'
    if (frequency && !frequencyValid(parsedFrequency)) return 'Frequency must be 10000–500000 Hz in 1000 Hz increments.'
    return null
  }, [frequency, parsedFrequency, parsedVoltage, voltage])

  const apply = async () => {
    if (!driver || !valid || !changed) return
    setApplying(true)
    setError(null)
    try {
      if (voltageResetPending) {
        await driver.system.configuration.bmcDecoder.resetCCVrefVoltage()
      } else if (parsedVoltage !== initialVoltage) {
        await driver.system.configuration.bmcDecoder.setCCVrefVoltage(parsedVoltage)
      }
      if (frequencyResetPending) {
        await driver.system.configuration.bmcDecoder.resetCCVrefPwmFrequencyHz()
      } else if (parsedFrequency !== initialFrequency) {
        await driver.system.configuration.bmcDecoder.setCCVrefPwmFrequencyHz(parsedFrequency)
      }
      const [confirmedVoltage, confirmedFrequency] = await Promise.all([
        driver.system.configuration.bmcDecoder.getCCVrefVoltage(),
        driver.system.configuration.bmcDecoder.getCCVrefPwmFrequencyHz(),
      ])
      setInitialVoltage(confirmedVoltage)
      setInitialFrequency(confirmedFrequency)
      setVoltage(confirmedVoltage.toFixed(2))
      setFrequency(String(confirmedFrequency))
      setVoltageResetPending(false)
      setFrequencyResetPending(false)
      onOpenChange(false)
    } catch (applyError) {
      setError(`Unable to apply settings: ${applyError instanceof Error ? applyError.message : String(applyError)}`)
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog
      open={target != null}
      onOpenChange={onOpenChange}
      title="Internal Settings"
      dismissible={!applying}
      dialogStyle={{ width: 'min(430px, calc(100vw - var(--space-32)))' }}
      footer={<div className={styles.buttonGroup}>
        <DialogButton onClick={() => onOpenChange(false)} disabled={applying}>Cancel</DialogButton>
        <DialogButton variant="primary" onClick={() => { void apply() }} disabled={loading || applying || !valid || !changed}>
          {applying ? 'Applying…' : 'OK'}
        </DialogButton>
      </div>}
    >
      <div role="tablist" aria-label="Configuration sections" className={styles.configurationTabs}>
        <button type="button" role="tab" aria-selected="true" className={styles.configurationTab}>BMC Decoder</button>
      </div>
      <div role="tabpanel" aria-label="BMC Decoder" className={styles.configurationPanel}>
        {loading ? <p>Loading settings…</p> : null}
        <DialogForm>
          <DialogFormRow
            className={styles.configurationFormRow}
            label="CC reference voltage (V)"
            htmlFor="bmc-decoder-vref"
            helpText="Range: 0.20 - 2.50"
          >
            <div className={styles.configurationControl}>
              <DialogInput id="bmc-decoder-vref" type="number" min={0.2} max={2.5} step={0.05} value={voltage} onChange={(event) => { setVoltageResetPending(false); setVoltage(event.currentTarget.value) }} disabled={loading || applying} />
              <DialogButton onClick={() => { setVoltageResetPending(true); setVoltage(DRPDBMCDecoderConfiguration.VREF_DEFAULT_VOLTS.toFixed(2)) }} disabled={loading || applying}>Reset</DialogButton>
            </div>
          </DialogFormRow>
          <DialogFormRow
            className={styles.configurationFormRow}
            label="VREF PWM frequency (Hz)"
            htmlFor="bmc-decoder-pwm-frequency"
            helpText="Range: 10000 - 500000"
          >
            <div className={styles.configurationControl}>
              <DialogInput id="bmc-decoder-pwm-frequency" type="number" min={10000} max={500000} step={1000} value={frequency} onChange={(event) => { setFrequencyResetPending(false); setFrequency(event.currentTarget.value) }} disabled={loading || applying} />
              <DialogButton onClick={() => { setFrequencyResetPending(true); setFrequency(String(DRPDBMCDecoderConfiguration.PWM_DEFAULT_HZ)) }} disabled={loading || applying}>Reset</DialogButton>
            </div>
          </DialogFormRow>
        </DialogForm>
        {validationMessage ? <p role="alert" className={styles.error}>{validationMessage}</p> : null}
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      </div>
    </Dialog>
  )
}
