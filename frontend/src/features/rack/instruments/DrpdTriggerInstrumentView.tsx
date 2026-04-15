import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  DRPDDevice,
  OnOffState,
  TriggerEventType,
  TriggerMessageTypeFilterClass,
  TriggerSenderFilter,
  TriggerStatus,
  TriggerSyncMode,
  TRIGGER_MESSAGE_TYPE_FILTER_LIMIT,
  type TriggerMessageTypeFilter,
  type TriggerInfo,
} from '../../../lib/device'
import {
  CONTROL_MESSAGE_TYPES,
  DATA_MESSAGE_TYPES,
  EXTENDED_MESSAGE_TYPES,
} from '../../../lib/device/drpd/usb-pd/message'
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
  TriggerSyncMode.PULSE_HIGH,
  TriggerSyncMode.PULSE_LOW,
  TriggerSyncMode.TOGGLE,
  TriggerSyncMode.PULL_DOWN,
] as const

const TRIGGER_SENDER_FILTER_OPTIONS = [
  TriggerSenderFilter.ANY,
  TriggerSenderFilter.SOURCE,
  TriggerSenderFilter.SINK,
  TriggerSenderFilter.CABLE,
] as const

const FILTER_CAPABLE_EVENT_TYPES = new Set<TriggerEventType>([
  TriggerEventType.DATA_START,
  TriggerEventType.MESSAGE_COMPLETE,
  TriggerEventType.INVALID_KCODE,
  TriggerEventType.CRC_ERROR,
  TriggerEventType.TIMEOUT_ERROR,
  TriggerEventType.RUNT_PULSE_ERROR,
  TriggerEventType.ANY_ERROR,
])

type TriggerMessageTypeOption = {
  key: string
  class: TriggerMessageTypeFilter['class']
  messageTypeNumber: number
  pickerLabel: string
  chipLabel: string
}

const humanizeMessageTypeName = (value: string): string =>
  value
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const formatMessageTypeNumberHex = (value: number): string => `0x${value.toString(16).toUpperCase().padStart(2, '0')}`

const CONTROL_FILTER_OPTIONS: TriggerMessageTypeOption[] = Object.entries(CONTROL_MESSAGE_TYPES)
  .map(([messageTypeNumber, definition]) => {
    const numericType = Number(messageTypeNumber)
    const humanizedName = humanizeMessageTypeName(definition.name)
    return {
      key: `${TriggerMessageTypeFilterClass.CONTROL}:${numericType}`,
      class: TriggerMessageTypeFilterClass.CONTROL,
      messageTypeNumber: numericType,
      pickerLabel: `${formatMessageTypeNumberHex(numericType)} • ${humanizedName}`,
      chipLabel: `Control: ${humanizedName}`,
    }
  })
  .sort((left, right) => left.messageTypeNumber - right.messageTypeNumber)

const DATA_FILTER_OPTIONS: TriggerMessageTypeOption[] = (() => {
  const groupedNames = new Map<number, string[]>()
  for (const [messageTypeNumber, definition] of Object.entries(DATA_MESSAGE_TYPES)) {
    const numericType = Number(messageTypeNumber)
    const nextNames = groupedNames.get(numericType) ?? []
    nextNames.push(humanizeMessageTypeName(definition.name))
    groupedNames.set(numericType, nextNames)
  }
  for (const [messageTypeNumber, definition] of Object.entries(EXTENDED_MESSAGE_TYPES)) {
    const numericType = Number(messageTypeNumber)
    const nextNames = groupedNames.get(numericType) ?? []
    nextNames.push(humanizeMessageTypeName(definition.name))
    groupedNames.set(numericType, nextNames)
  }
  return Array.from(groupedNames.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([messageTypeNumber, names]) => {
      const uniqueNames = Array.from(new Set(names))
      const combinedNames = uniqueNames.join(' / ')
      const label = `${formatMessageTypeNumberHex(messageTypeNumber)} • ${combinedNames}`
      return {
        key: `${TriggerMessageTypeFilterClass.DATA}:${messageTypeNumber}`,
        class: TriggerMessageTypeFilterClass.DATA,
        messageTypeNumber,
        pickerLabel: label,
        chipLabel: `Data: ${label}`,
      }
    })
})()

const findTriggerMessageTypeOption = (
  filter: TriggerMessageTypeFilter,
): TriggerMessageTypeOption | undefined =>
  (filter.class === TriggerMessageTypeFilterClass.CONTROL
    ? CONTROL_FILTER_OPTIONS
    : DATA_FILTER_OPTIONS
  ).find((option) => option.messageTypeNumber === filter.messageTypeNumber)

const formatTriggerMessageTypeChipLabel = (filter: TriggerMessageTypeFilter): string => {
  const option = findTriggerMessageTypeOption(filter)
  if (option) {
    return option.chipLabel
  }
  const prefix = filter.class === TriggerMessageTypeFilterClass.CONTROL ? 'Control' : 'Data'
  return `${prefix}: ${formatMessageTypeNumberHex(filter.messageTypeNumber)}`
}

const isFilterCapableTriggerEventType = (value: TriggerEventType): boolean =>
  FILTER_CAPABLE_EVENT_TYPES.has(value)

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
    case TriggerSyncMode.PULSE_HIGH:
      return 'Pulse High'
    case TriggerSyncMode.PULSE_LOW:
      return 'Pulse Low'
    case TriggerSyncMode.TOGGLE:
      return 'Toggle'
    case TriggerSyncMode.PULL_DOWN:
      return 'Pull-Down'
    default:
      return '--'
  }
}

/**
 * Format a trigger sender filter token into a concise label.
 *
 * @param value - Sender filter token.
 * @returns Display label.
 */
const formatTriggerSenderFilter = (value: TriggerInfo['senderFilter'] | null | undefined): string => {
  switch (value) {
    case TriggerSenderFilter.ANY:
      return 'Any sender'
    case TriggerSenderFilter.SOURCE:
      return 'Source'
    case TriggerSenderFilter.SINK:
      return 'Sink'
    case TriggerSenderFilter.CABLE:
      return 'Cable'
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
  const [resolvedTriggerInfo, setResolvedTriggerInfo] = useState<TriggerInfo | null>(null)
  const [eventTypeInput, setEventTypeInput] = useState<TriggerEventType>(TriggerEventType.OFF)
  const [eventThresholdInput, setEventThresholdInput] = useState<string>('1')
  const [senderFilterInput, setSenderFilterInput] = useState<TriggerSenderFilter>(TriggerSenderFilter.ANY)
  const [autoRepeatInput, setAutoRepeatInput] = useState<OnOffState>(OnOffState.OFF)
  const [syncModeInput, setSyncModeInput] = useState<TriggerSyncMode>(TriggerSyncMode.PULSE_HIGH)
  const [syncPulseWidthUsInput, setSyncPulseWidthUsInput] = useState<string>('1')
  const [messageTypeFiltersInput, setMessageTypeFiltersInput] = useState<TriggerMessageTypeFilter[]>([])
  const [messageTypeFilterClassInput, setMessageTypeFilterClassInput] =
    useState<TriggerMessageTypeFilter['class']>(TriggerMessageTypeFilterClass.CONTROL)
  const [messageTypeFilterTypeInput, setMessageTypeFilterTypeInput] = useState<string>('0')
  const [configureError, setConfigureError] = useState<string | null>(null)
  const [isApplyingConfig, setIsApplyingConfig] = useState(false)
  const [isResettingTrigger, setIsResettingTrigger] = useState(false)

  const triggerInfo = useSyncExternalStore(
    (onStoreChange) => {
      if (!driver) {
        return () => {
          // No subscription when a driver is unavailable.
        }
      }

      /**
       * Notify subscribers when trigger info changes.
       *
       * @param event - Device state update event.
       */
      const handleStateUpdated = (event: Event) => {
        const detail = event instanceof CustomEvent ? event.detail : undefined
        const changed = Array.isArray(detail?.changed) ? (detail.changed as string[]) : null
        if (changed && !changed.includes('triggerInfo')) {
          return
        }
        onStoreChange()
      }

      driver.addEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
      return () => {
        driver.removeEventListener(DRPDDevice.STATE_UPDATED_EVENT, handleStateUpdated)
      }
    },
    () => (driver ? driver.getState().triggerInfo ?? null : null),
    () => null,
  )

  useEffect(() => {
    if (!driver) {
      setResolvedTriggerInfo(null)
      return
    }

    setResolvedTriggerInfo(triggerInfo)
  }, [driver, triggerInfo])

  const populateConfigureInputs = (info: TriggerInfo | null) => {
    setEventTypeInput(info?.type ?? TriggerEventType.OFF)
    setEventThresholdInput(String(info?.eventThreshold ?? 1))
    setSenderFilterInput(info?.senderFilter ?? TriggerSenderFilter.ANY)
    setAutoRepeatInput(info?.autorepeat ?? OnOffState.OFF)
    setSyncModeInput(info?.syncMode ?? TriggerSyncMode.PULSE_HIGH)
    setSyncPulseWidthUsInput(String(info?.syncPulseWidthUs ?? 1))
    setMessageTypeFiltersInput(info?.messageTypeFilters ?? [])
    setMessageTypeFilterClassInput(TriggerMessageTypeFilterClass.CONTROL)
    setMessageTypeFilterTypeInput(String(CONTROL_FILTER_OPTIONS[0]?.messageTypeNumber ?? 0))
  }

  const visibleTriggerInfo = driver ? (resolvedTriggerInfo ?? triggerInfo) : null
  const displayedFilterChips = visibleTriggerInfo?.messageTypeFilters ?? []
  const filterSummaryChips = displayedFilterChips.slice(0, 2)
  const hiddenFilterCount = Math.max(0, displayedFilterChips.length - filterSummaryChips.length)

  const activeMessageTypeOptions =
    messageTypeFilterClassInput === TriggerMessageTypeFilterClass.CONTROL
      ? CONTROL_FILTER_OPTIONS
      : DATA_FILTER_OPTIONS

  const selectedEventSupportsFilters = isFilterCapableTriggerEventType(eventTypeInput)

  useEffect(() => {
    if (activeMessageTypeOptions.length === 0) {
      setMessageTypeFilterTypeInput('')
      return
    }

    const stillValid = activeMessageTypeOptions.some(
      (option) => String(option.messageTypeNumber) === messageTypeFilterTypeInput,
    )
    if (!stillValid) {
      setMessageTypeFilterTypeInput(String(activeMessageTypeOptions[0].messageTypeNumber))
    }
  }, [activeMessageTypeOptions, messageTypeFilterTypeInput])

  const headerControls = useMemo<InstrumentHeaderControl[]>(() => {
    const configureControl: InstrumentHeaderControl = {
      id: 'configure-trigger',
      label: 'Configure',
      disabled: !driver || isEditMode || isApplyingConfig,
      renderPopover: ({ closePopover }) => (
        <div className={styles.headerPopup}>
          <PopoverLifecycle
            onMount={() => {
              populateConfigureInputs(visibleTriggerInfo)
              setConfigureError(null)
              if (driver) {
                void driver.trigger
                  .getInfo()
                  .then((latestTriggerInfo) => {
                    setResolvedTriggerInfo(latestTriggerInfo)
                    populateConfigureInputs(latestTriggerInfo)
                  })
                  .catch((error) => {
                    const message = error instanceof Error ? error.message : String(error)
                    setConfigureError(message)
                  })
              }
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
          <div className={styles.headerPopupField}>
            <label className={styles.headerPopupLabel} htmlFor={`${instrument.id}-trigger-sender`}>
              Sender
            </label>
            <select
              id={`${instrument.id}-trigger-sender`}
              className={styles.headerPopupSelect}
              value={senderFilterInput}
              onChange={(event) => {
                setSenderFilterInput(event.currentTarget.value as TriggerSenderFilter)
                setConfigureError(null)
              }}
              disabled={isApplyingConfig || !selectedEventSupportsFilters}
            >
              {TRIGGER_SENDER_FILTER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {formatTriggerSenderFilter(option)}
                </option>
              ))}
            </select>
            <p className={styles.headerPopupHint}>
              {selectedEventSupportsFilters
                ? 'Filter by source, sink, or cable origin once the header is available.'
                : 'Sender filtering is stored but ignored for this event type until the header is known, starting at Data Start.'}
            </p>
          </div>
          <div className={styles.headerPopupSection}>
            <div className={styles.headerPopupSectionHeader}>
              <span className={styles.headerPopupLabel}>Message filters</span>
              <span className={styles.headerPopupSectionMeta}>
                {messageTypeFiltersInput.length}/{TRIGGER_MESSAGE_TYPE_FILTER_LIMIT}
              </span>
            </div>
            <div className={styles.filterChipList}>
              {messageTypeFiltersInput.length > 0 ? (
                messageTypeFiltersInput.map((filter) => (
                  <span key={`${filter.class}:${filter.messageTypeNumber}`} className={styles.filterChip}>
                    <span className={styles.filterChipText}>
                      {formatTriggerMessageTypeChipLabel(filter)}
                    </span>
                    <button
                      type="button"
                      className={styles.filterChipRemove}
                      onClick={() => {
                        setMessageTypeFiltersInput((current) =>
                          current.filter(
                            (entry) =>
                              !(
                                entry.class === filter.class &&
                                entry.messageTypeNumber === filter.messageTypeNumber
                              ),
                          ),
                        )
                        setConfigureError(null)
                      }}
                      disabled={isApplyingConfig || !selectedEventSupportsFilters}
                      aria-label={`Remove ${formatTriggerMessageTypeChipLabel(filter)}`}
                    >
                      ×
                    </button>
                  </span>
                ))
              ) : (
                <span className={styles.filterChipPlaceholder}>Any message</span>
              )}
            </div>
            <div className={styles.filterPickerRow}>
              <select
                aria-label="Message filter class"
                className={styles.headerPopupSelect}
                value={messageTypeFilterClassInput}
                onChange={(event) => {
                  setMessageTypeFilterClassInput(
                    event.currentTarget.value as TriggerMessageTypeFilter['class'],
                  )
                  setConfigureError(null)
                }}
                disabled={isApplyingConfig || !selectedEventSupportsFilters}
              >
                <option value={TriggerMessageTypeFilterClass.CONTROL}>Control</option>
                <option value={TriggerMessageTypeFilterClass.DATA}>Data-bearing</option>
              </select>
              <select
                aria-label="Message filter type"
                className={styles.headerPopupSelect}
                value={messageTypeFilterTypeInput}
                onChange={(event) => {
                  setMessageTypeFilterTypeInput(event.currentTarget.value)
                  setConfigureError(null)
                }}
                disabled={
                  isApplyingConfig ||
                  !selectedEventSupportsFilters ||
                  activeMessageTypeOptions.length === 0
                }
              >
                {activeMessageTypeOptions.map((option) => (
                  <option key={option.key} value={String(option.messageTypeNumber)}>
                    {option.pickerLabel}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.headerPopupButton}
                onClick={() => {
                  const parsedTypeNumber = Number(messageTypeFilterTypeInput)
                  if (!Number.isInteger(parsedTypeNumber) || parsedTypeNumber < 0) {
                    setConfigureError('Select a valid message type filter before adding it.')
                    return
                  }

                  const nextFilter: TriggerMessageTypeFilter = {
                    class: messageTypeFilterClassInput,
                    messageTypeNumber: parsedTypeNumber,
                  }

                  const duplicate = messageTypeFiltersInput.some(
                    (filter) =>
                      filter.class === nextFilter.class &&
                      filter.messageTypeNumber === nextFilter.messageTypeNumber,
                  )
                  if (duplicate) {
                    setConfigureError('That message type filter is already in the list.')
                    return
                  }
                  if (messageTypeFiltersInput.length >= TRIGGER_MESSAGE_TYPE_FILTER_LIMIT) {
                    setConfigureError(
                      `No more than ${TRIGGER_MESSAGE_TYPE_FILTER_LIMIT} message type filters are allowed.`,
                    )
                    return
                  }

                  setMessageTypeFiltersInput((current) => [...current, nextFilter])
                  setConfigureError(null)
                }}
                disabled={
                  isApplyingConfig ||
                  !selectedEventSupportsFilters ||
                  activeMessageTypeOptions.length === 0
                }
              >
                Add filter
              </button>
            </div>
            <p className={styles.headerPopupHint}>
              {selectedEventSupportsFilters
                ? 'Choose control or data-bearing message types from the known USB-PD message list.'
                : 'Message filters are stored but ignored for this event type until the header is known, starting at Data Start.'}
            </p>
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
                  driver.trigger.setSenderFilter(senderFilterInput),
                  driver.trigger.setAutoRepeat(autoRepeatInput),
                  driver.trigger.setSyncMode(syncModeInput),
                  driver.trigger.setSyncPulseWidthUs(parsedPulseWidthUs),
                  driver.trigger.setMessageTypeFilters(messageTypeFiltersInput),
                ])
                  .then(async () => {
                    try {
                      const latestTriggerInfo = await driver.trigger.getInfo()
                      setResolvedTriggerInfo(latestTriggerInfo)
                    } catch {
                      // Fall back to the mirrored refresh path if direct readback fails.
                    }
                    if (deviceRecord && onUpdateDeviceConfig) {
                      await onUpdateDeviceConfig(deviceRecord.id, (current) => {
                        const source = current && typeof current === 'object' ? current : {}
                        return {
                          ...source,
                          trigger: {
                            type: eventTypeInput,
                            eventThreshold: parsedThreshold,
                            senderFilter: senderFilterInput,
                            autorepeat: autoRepeatInput,
                            syncMode: syncModeInput,
                            syncPulseWidthUs: parsedPulseWidthUs,
                            messageTypeFilters: messageTypeFiltersInput,
                          },
                        }
                      })
                    }
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
        (visibleTriggerInfo?.status !== TriggerStatus.TRIGGERED &&
          visibleTriggerInfo?.autorepeat !== OnOffState.ON),
      onClick: () => {
        if (
          !driver ||
          (visibleTriggerInfo?.status !== TriggerStatus.TRIGGERED &&
            visibleTriggerInfo?.autorepeat !== OnOffState.ON)
        ) {
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
    messageTypeFilterClassInput,
    messageTypeFilterTypeInput,
    messageTypeFiltersInput,
    onUpdateDeviceConfig,
    selectedEventSupportsFilters,
    senderFilterInput,
    syncModeInput,
    syncPulseWidthUsInput,
    deviceRecord,
    visibleTriggerInfo?.autorepeat,
    visibleTriggerInfo?.eventThreshold,
    visibleTriggerInfo?.messageTypeFilters,
    visibleTriggerInfo?.senderFilter,
    visibleTriggerInfo?.syncMode,
    visibleTriggerInfo?.syncPulseWidthUs,
    visibleTriggerInfo?.type,
    visibleTriggerInfo?.status,
    configureError,
  ])

  const statusClassName =
    visibleTriggerInfo?.status === TriggerStatus.TRIGGERED
      ? styles.valueTriggered
      : visibleTriggerInfo?.status === TriggerStatus.ARMED
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
        <section className={styles.leftPane}>
          <div className={styles.leftMetricRow}>
            <span className={styles.metricLabel}>State</span>
            <span className={`${styles.metricValue} ${statusClassName}`}>
              {formatTriggerStatus(visibleTriggerInfo?.status)}
            </span>
          </div>
          <div className={styles.leftMetricRow}>
            <span className={styles.metricLabel}>Count</span>
            <span className={styles.metricValue}>
              {formatNumber(visibleTriggerInfo?.eventCount)}
            </span>
          </div>
          <div className={styles.leftMetricRow}>
            <span className={styles.metricLabel}>Repeat</span>
            <span className={styles.metricValue}>{formatOnOff(visibleTriggerInfo?.autorepeat)}</span>
          </div>
          <div className={styles.leftMetricRow}>
            <span className={styles.metricLabel}>Threshold</span>
            <span className={styles.metricValue}>{formatNumber(visibleTriggerInfo?.eventThreshold)}</span>
          </div>
        </section>
        <section className={styles.rightPane}>
          <div className={styles.rightMetricRow}>
            <span className={styles.metricLabel}>Event</span>
            <span className={styles.metricValue}>{formatTriggerEventType(visibleTriggerInfo?.type)}</span>
          </div>
          <div className={styles.rightMetricRow}>
            <span className={styles.metricLabel}>Sync</span>
            <span className={styles.metricValue}>{formatTriggerSyncMode(visibleTriggerInfo?.syncMode)}</span>
          </div>
          <div className={styles.rightMetricRow}>
            <span className={styles.metricLabel}>Sender</span>
            <div className={styles.metricFilterValue}>
              <span className={styles.metricValue}>
                {formatTriggerSenderFilter(visibleTriggerInfo?.senderFilter)}
              </span>
            </div>
          </div>
          <div className={styles.rightMetricRow}>
            <span className={styles.metricLabel}>Pulse</span>
            <span className={styles.metricValue}>
              {formatNumber(visibleTriggerInfo?.syncPulseWidthUs, ' us')}
            </span>
          </div>
          <div className={styles.rightMetricRow}>
            <span className={styles.metricLabel}>Filters</span>
            <div className={styles.metricFilterValue}>
              {displayedFilterChips.length > 0 ? (
                <>
                  <div className={styles.filterChipListCompact}>
                    {filterSummaryChips.map((filter) => (
                      <span
                        key={`${filter.class}:${filter.messageTypeNumber}`}
                        className={styles.filterChipCompact}
                      >
                        {formatTriggerMessageTypeChipLabel(filter)}
                      </span>
                    ))}
                    {hiddenFilterCount > 0 ? (
                      <span className={styles.filterChipOverflow}>+{hiddenFilterCount} more</span>
                    ) : null}
                  </div>
                </>
              ) : (
                <span className={styles.metricValue}>Any message</span>
              )}
            </div>
          </div>
          {configureError ? <p className={styles.inlineError}>{configureError}</p> : null}
        </section>
      </div>
    </InstrumentBase>
  )
}
