import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DRPDDevice,
  OnOffState,
  TriggerEventType,
  TriggerStatus,
  TriggerSyncMode,
  type TriggerInfo,
} from '../../../lib/device'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import { InstrumentBase, type InstrumentHeaderControl } from '../InstrumentBase'
import type { RackDeviceState } from '../RackRenderer'
import styles from './DrpdTriggerInstrumentView.module.css'

const TRIGGER_EVENT_OPTIONS = [
  TriggerEventType.OFF,
  TriggerEventType.PREAMBLE_START,
  TriggerEventType.SOP_START,
  TriggerEventType.HEADER_START,
  TriggerEventType.DATA_START,
  TriggerEventType.MESSAGE_COMPLETE,
  TriggerEventType.HARD_RESET_RECEIVED,
  TriggerEventType.INVALID_KCODE,
  TriggerEventType.CRC_ERROR,
  TriggerEventType.TIMEOUT_ERROR,
  TriggerEventType.RUNT_PULSE_ERROR,
  TriggerEventType.ANY_ERROR,
] as const

const TRIGGER_SYNC_MODE_OPTIONS = [
  TriggerSyncMode.OFF,
  TriggerSyncMode.PULSE_HIGH,
  TriggerSyncMode.PULSE_LOW,
  TriggerSyncMode.TOGGLE,
] as const

/**
 * Run mount/unmount hooks for popover lifecycle without resetting on rerender.
 *
 * @param props - Lifecycle callbacks.
 * @returns Null render node.
 */
const PopoverLifecycle = ({
  onMount,
  onUnmount,
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
 * Format a trigger state token into a concise label.
 *
 * @param value - Trigger status token.
 * @returns Display label.
 */
const formatTriggerStatus = (value: TriggerInfo['status'] | null | undefined): string => {
  switch (value) {
    case TriggerStatus.IDLE:
      return 'Idle'
    case TriggerStatus.ARMED:
      return 'Armed'
    case TriggerStatus.TRIGGERED:
      return 'Triggered'
    default:
      return '--'
  }
}

/**
 * Format a trigger event token into a concise label.
 *
 * @param value - Trigger event token.
 * @returns Display label.
 */
const formatTriggerEventType = (value: TriggerInfo['type'] | null | undefined): string => {
  if (!value) {
    return '--'
  }
  switch (value) {
    case TriggerEventType.OFF:
      return 'Off'
    case TriggerEventType.PREAMBLE_START:
      return 'Preamble Start'
    case TriggerEventType.SOP_START:
      return 'SOP Start'
    case TriggerEventType.HEADER_START:
      return 'Header Start'
    case TriggerEventType.DATA_START:
      return 'Data Start'
    case TriggerEventType.MESSAGE_COMPLETE:
      return 'Message Complete'
    case TriggerEventType.HARD_RESET_RECEIVED:
      return 'Hard Reset'
    case TriggerEventType.INVALID_KCODE:
      return 'Invalid K-Code'
    case TriggerEventType.CRC_ERROR:
      return 'CRC Error'
    case TriggerEventType.TIMEOUT_ERROR:
      return 'Timeout Error'
    case TriggerEventType.RUNT_PULSE_ERROR:
      return 'Runt Pulse'
    case TriggerEventType.ANY_ERROR:
      return 'Any Error'
    default:
      return '--'
  }
}

/**
 * Format a sync mode token into a concise label.
 *
 * @param value - Sync mode token.
 * @returns Display label.
 */
const formatTriggerSyncMode = (value: TriggerInfo['syncMode'] | null | undefined): string => {
  switch (value) {
    case TriggerSyncMode.OFF:
      return 'Off'
    case TriggerSyncMode.PULSE_HIGH:
      return 'Pulse High'
    case TriggerSyncMode.PULSE_LOW:
      return 'Pulse Low'
    case TriggerSyncMode.TOGGLE:
      return 'Toggle'
    default:
      return '--'
  }
}

/**
 * Format an ON/OFF token into a display label.
 *
 * @param value - On/off token.
 * @returns Display label.
 */
const formatOnOff = (value: OnOffState | null | undefined): string => {
  switch (value) {
    case OnOffState.ON:
      return 'On'
    case OnOffState.OFF:
      return 'Off'
    default:
      return '--'
  }
}

/**
 * Format a numeric value or emit a placeholder.
 *
 * @param value - Numeric input.
 * @param suffix - Optional suffix.
 * @returns Display text.
 */
const formatNumber = (value: number | null | undefined, suffix = ''): string => {
  if (value == null || !Number.isFinite(value)) {
    return '--'
  }
  return `${value}${suffix}`
}

/**
 * Sync trigger instrument showing status, setup, and header controls.
 */
export const DrpdTriggerInstrumentView = ({
  instrument,
  displayName,
  deviceRecord,
  deviceState,
  isEditMode,
  onRemove,
}: {
  instrument: RackInstrument
  displayName: string
  deviceRecord?: RackDeviceRecord
  deviceState?: RackDeviceState
  isEditMode: boolean
  onRemove?: (instrumentId: string) => void
}) => {
  void deviceRecord
  const driver = deviceState?.drpdDriver
  const [triggerInfo, setTriggerInfo] = useState<TriggerInfo | null>(
    driver ? driver.getState().triggerInfo ?? null : null,
  )
  const [eventTypeInput, setEventTypeInput] = useState<TriggerEventType>(TriggerEventType.OFF)
  const [eventThresholdInput, setEventThresholdInput] = useState<string>('1')
  const [autoRepeatInput, setAutoRepeatInput] = useState<OnOffState>(OnOffState.OFF)
  const [syncModeInput, setSyncModeInput] = useState<TriggerSyncMode>(TriggerSyncMode.OFF)
  const [syncPulseWidthUsInput, setSyncPulseWidthUsInput] = useState<string>('1')
  const [configureError, setConfigureError] = useState<string | null>(null)
  const [isApplyingConfig, setIsApplyingConfig] = useState(false)
  const [isResettingTrigger, setIsResettingTrigger] = useState(false)

  /**
   * Seed popup form state from the latest trigger snapshot.
   */
  const syncFormFromTriggerInfo = () => {
    setEventTypeInput(triggerInfo?.type ?? TriggerEventType.OFF)
    setEventThresholdInput(String(triggerInfo?.eventThreshold ?? 1))
    setAutoRepeatInput(triggerInfo?.autorepeat ?? OnOffState.OFF)
    setSyncModeInput(triggerInfo?.syncMode ?? TriggerSyncMode.OFF)
    setSyncPulseWidthUsInput(String(triggerInfo?.syncPulseWidthUs ?? 1))
  }

  useEffect(() => {
    if (!driver) {
      setTriggerInfo(null)
      return
    }

    /**
     * Handle live driver updates for trigger changes.
     *
     * @param event - Device state event.
     */
    const handleStateUpdated = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      const changed = Array.isArray(detail?.changed) ? (detail.changed as string[]) : null
      if (changed && !changed.includes('triggerInfo')) {
        return
      }
      setTriggerInfo(driver.getState().triggerInfo ?? null)
    }

    setTriggerInfo(driver.getState().triggerInfo ?? null)
    driver.addEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
    return () => {
      driver.removeEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
    }
  }, [driver])

  const headerControls = useMemo<InstrumentHeaderControl[]>(() => {
    const configureControl: InstrumentHeaderControl = {
      id: 'configure-trigger',
      label: 'Configure',
      disabled: !driver || isEditMode || isApplyingConfig,
      renderPopover: ({ closePopover }) => (
        <div className={styles.headerPopup}>
          <PopoverLifecycle
            onMount={() => {
              syncFormFromTriggerInfo()
              setConfigureError(null)
            }}
            onUnmount={() => {
              // No cleanup needed.
            }}
          />
          <div className={styles.headerPopupField}>
            <label className={styles.headerPopupLabel} htmlFor={`${instrument.id}-trigger-event`}>
              Event type
            </label>
            <select
              id={`${instrument.id}-trigger-event`}
              className={styles.headerPopupSelect}
              value={eventTypeInput}
              onChange={(event) => {
                setEventTypeInput(event.currentTarget.value as TriggerEventType)
                setConfigureError(null)
              }}
              disabled={isApplyingConfig}
            >
              {TRIGGER_EVENT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {formatTriggerEventType(option)}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.headerPopupFieldRow}>
            <div className={styles.headerPopupField}>
              <label className={styles.headerPopupLabel} htmlFor={`${instrument.id}-trigger-threshold`}>
                Threshold
              </label>
              <input
                id={`${instrument.id}-trigger-threshold`}
                className={styles.headerPopupInput}
                type="number"
                min={1}
                step={1}
                value={eventThresholdInput}
                onChange={(event) => {
                  setEventThresholdInput(event.currentTarget.value)
                  setConfigureError(null)
                }}
                disabled={isApplyingConfig}
              />
            </div>
            <div className={styles.headerPopupField}>
              <label className={styles.headerPopupLabel} htmlFor={`${instrument.id}-trigger-autorepeat`}>
                Auto-repeat
              </label>
              <select
                id={`${instrument.id}-trigger-autorepeat`}
                className={styles.headerPopupSelect}
                value={autoRepeatInput}
                onChange={(event) => {
                  setAutoRepeatInput(event.currentTarget.value as OnOffState)
                  setConfigureError(null)
                }}
                disabled={isApplyingConfig}
              >
                <option value={OnOffState.OFF}>Off</option>
                <option value={OnOffState.ON}>On</option>
              </select>
            </div>
          </div>
          <div className={styles.headerPopupFieldRow}>
            <div className={styles.headerPopupField}>
              <label className={styles.headerPopupLabel} htmlFor={`${instrument.id}-trigger-sync-mode`}>
                Sync mode
              </label>
              <select
                id={`${instrument.id}-trigger-sync-mode`}
                className={styles.headerPopupSelect}
                value={syncModeInput}
                onChange={(event) => {
                  setSyncModeInput(event.currentTarget.value as TriggerSyncMode)
                  setConfigureError(null)
                }}
                disabled={isApplyingConfig}
              >
                {TRIGGER_SYNC_MODE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {formatTriggerSyncMode(option)}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.headerPopupField}>
              <label className={styles.headerPopupLabel} htmlFor={`${instrument.id}-trigger-pulse-width`}>
                Pulse width (us)
              </label>
              <input
                id={`${instrument.id}-trigger-pulse-width`}
                className={styles.headerPopupInput}
                type="number"
                min={1}
                step={1}
                value={syncPulseWidthUsInput}
                onChange={(event) => {
                  setSyncPulseWidthUsInput(event.currentTarget.value)
                  setConfigureError(null)
                }}
                disabled={isApplyingConfig}
              />
            </div>
          </div>
          <p className={styles.headerPopupHint}>
            Trigger threshold and pulse width are positive integer values.
          </p>
          {configureError ? <p className={styles.headerPopupError}>{configureError}</p> : null}
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
                const parsedThreshold = Number(eventThresholdInput)
                const parsedPulseWidthUs = Number(syncPulseWidthUsInput)
                if (!Number.isInteger(parsedThreshold) || parsedThreshold < 1) {
                  setConfigureError('Threshold must be an integer greater than or equal to 1.')
                  return
                }
                if (!Number.isInteger(parsedPulseWidthUs) || parsedPulseWidthUs < 1) {
                  setConfigureError('Pulse width must be an integer greater than or equal to 1 us.')
                  return
                }
                setIsApplyingConfig(true)
                setConfigureError(null)
                void Promise.all([
                  driver.trigger.setEventType(eventTypeInput),
                  driver.trigger.setEventThreshold(parsedThreshold),
                  driver.trigger.setAutoRepeat(autoRepeatInput),
                  driver.trigger.setSyncMode(syncModeInput),
                  driver.trigger.setSyncPulseWidthUs(parsedPulseWidthUs),
                ])
                  .then(async () => {
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
      ),
    }

    const resetControl: InstrumentHeaderControl = {
      id: 'reset-trigger',
      label: isResettingTrigger ? 'Resetting...' : 'Reset',
      disabled:
        !driver ||
        isEditMode ||
        isResettingTrigger ||
        triggerInfo?.status !== TriggerStatus.TRIGGERED,
      onClick: () => {
        if (!driver || triggerInfo?.status !== TriggerStatus.TRIGGERED) {
          return
        }
        setConfigureError(null)
        setIsResettingTrigger(true)
        void driver.trigger
          .reset()
          .then(async () => {
            await driver.refreshState()
          })
          .catch((error) => {
            const message = error instanceof Error ? error.message : String(error)
            setConfigureError(message)
          })
          .finally(() => {
            setIsResettingTrigger(false)
          })
      },
    }

    return [configureControl, resetControl]
  }, [
    autoRepeatInput,
    driver,
    eventThresholdInput,
    eventTypeInput,
    instrument.id,
    isApplyingConfig,
    isEditMode,
    isResettingTrigger,
    syncModeInput,
    syncPulseWidthUsInput,
    triggerInfo?.status,
  ])

  const statusClassName =
    triggerInfo?.status === TriggerStatus.TRIGGERED
      ? styles.valueTriggered
      : triggerInfo?.status === TriggerStatus.ARMED
        ? styles.valueArmed
        : styles.valueNeutral

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
      headerControls={headerControls}
      contentClassName={styles.content}
    >
      <div className={styles.wrapper}>
        <section className={styles.section}>
          <div className={styles.metricRow}>
            <span className={styles.metricLabel}>State</span>
            <span className={`${styles.metricValue} ${statusClassName}`}>
              {formatTriggerStatus(triggerInfo?.status)}
            </span>
          </div>
          <div className={styles.metricRow}>
            <span className={styles.metricLabel}>Count</span>
            <span className={styles.metricValue}>
              {formatNumber(triggerInfo?.eventCount)}
            </span>
          </div>
        </section>
        <section className={styles.section}>
          <div className={styles.setupGrid}>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Event</span>
              <span className={styles.metricValue}>{formatTriggerEventType(triggerInfo?.type)}</span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Threshold</span>
              <span className={styles.metricValue}>{formatNumber(triggerInfo?.eventThreshold)}</span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Repeat</span>
              <span className={styles.metricValue}>{formatOnOff(triggerInfo?.autorepeat)}</span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Sync</span>
              <span className={styles.metricValue}>{formatTriggerSyncMode(triggerInfo?.syncMode)}</span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Pulse</span>
              <span className={styles.metricValue}>
                {formatNumber(triggerInfo?.syncPulseWidthUs, ' us')}
              </span>
            </div>
          </div>
          {configureError ? <p className={styles.inlineError}>{configureError}</p> : null}
        </section>
      </div>
    </InstrumentBase>
  )
}
