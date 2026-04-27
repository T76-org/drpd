import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import {
  DRPDDevice,
  OnOffState,
  TriggerEventType,
  TriggerMessageTypeFilterClass,
  TriggerSenderFilter,
  TriggerStatus,
  TriggerSyncMode,
  type DRPDDriverRuntime,
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
import { TriggerConfigurePopover } from '../overlays/trigger/TriggerConfigurePopover'
import styles from './DrpdTriggerInstrumentView.module.css'

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
  const [resolvedTriggerInfo, setResolvedTriggerInfo] = useState<{
    driver: DRPDDriverRuntime
    info: TriggerInfo
  } | null>(null)
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
  const [isConfigureDialogOpen, setIsConfigureDialogOpen] = useState(false)

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

  const populateConfigureInputs = useCallback((info: TriggerInfo | null) => {
    setEventTypeInput(info?.type ?? TriggerEventType.OFF)
    setEventThresholdInput(String(info?.eventThreshold ?? 1))
    setSenderFilterInput(info?.senderFilter ?? TriggerSenderFilter.ANY)
    setAutoRepeatInput(info?.autorepeat ?? OnOffState.OFF)
    setSyncModeInput(info?.syncMode ?? TriggerSyncMode.PULSE_HIGH)
    setSyncPulseWidthUsInput(String(info?.syncPulseWidthUs ?? 1))
    setMessageTypeFiltersInput(info?.messageTypeFilters ?? [])
    setMessageTypeFilterClassInput(TriggerMessageTypeFilterClass.CONTROL)
    setMessageTypeFilterTypeInput(String(CONTROL_FILTER_OPTIONS[0]?.messageTypeNumber ?? 0))
  }, [])

  const visibleTriggerInfo =
    driver ? (resolvedTriggerInfo?.driver === driver ? resolvedTriggerInfo.info : triggerInfo) : null
  const displayedFilterChips = visibleTriggerInfo?.messageTypeFilters ?? []
  const filterSummaryChips = displayedFilterChips.slice(0, 2)
  const hiddenFilterCount = Math.max(0, displayedFilterChips.length - filterSummaryChips.length)

  const headerControls = useMemo<InstrumentHeaderControl[]>(() => {
    const configureControl: InstrumentHeaderControl = {
      id: 'configure-trigger',
      label: 'Configure',
      disabled: !driver || isEditMode || isApplyingConfig,
      onClick: () => {
        populateConfigureInputs(visibleTriggerInfo)
        setConfigureError(null)
        setIsConfigureDialogOpen(true)
        if (driver) {
          void driver.trigger
            .getInfo()
            .then((latestTriggerInfo) => {
              setResolvedTriggerInfo({ driver, info: latestTriggerInfo })
              populateConfigureInputs(latestTriggerInfo)
            })
            .catch((error) => {
              const message = error instanceof Error ? error.message : String(error)
              setConfigureError(message)
            })
        }
      },
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
    driver,
    isApplyingConfig,
    isEditMode,
    isResettingTrigger,
    populateConfigureInputs,
    visibleTriggerInfo,
  ])

  const applyTriggerConfiguration = (closeDialog: () => void) => {
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
                  setResolvedTriggerInfo({ driver, info: latestTriggerInfo })
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
                closeDialog()
              })
              .catch((error) => {
                const message = error instanceof Error ? error.message : String(error)
                setConfigureError(message)
              })
              .finally(() => {
                setIsApplyingConfig(false)
              })
  }

  const statusClassName =
    visibleTriggerInfo?.status === TriggerStatus.TRIGGERED
      ? styles.valueTriggered
      : visibleTriggerInfo?.status === TriggerStatus.ARMED
        ? styles.valueArmed
        : styles.valueNeutral

  return (
    <>
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
      <TriggerConfigurePopover
        open={isConfigureDialogOpen}
        onOpenChange={setIsConfigureDialogOpen}
        instrumentId={instrument.id}
        eventTypeInput={eventTypeInput}
        senderFilterInput={senderFilterInput}
        messageTypeFiltersInput={messageTypeFiltersInput}
        messageTypeFilterClassInput={messageTypeFilterClassInput}
        messageTypeFilterTypeInput={messageTypeFilterTypeInput}
        eventThresholdInput={eventThresholdInput}
        autoRepeatInput={autoRepeatInput}
        syncModeInput={syncModeInput}
        syncPulseWidthUsInput={syncPulseWidthUsInput}
        configureError={configureError}
        isApplyingConfig={isApplyingConfig}
        setEventTypeInput={setEventTypeInput}
        setSenderFilterInput={setSenderFilterInput}
        setMessageTypeFiltersInput={setMessageTypeFiltersInput}
        setMessageTypeFilterClassInput={setMessageTypeFilterClassInput}
        setMessageTypeFilterTypeInput={setMessageTypeFilterTypeInput}
        setEventThresholdInput={setEventThresholdInput}
        setAutoRepeatInput={setAutoRepeatInput}
        setSyncModeInput={setSyncModeInput}
        setSyncPulseWidthUsInput={setSyncPulseWidthUsInput}
        setConfigureError={setConfigureError}
        onCancel={() => {
          setConfigureError(null)
          setIsConfigureDialogOpen(false)
        }}
        onApply={() => {
          applyTriggerConfiguration(() => setIsConfigureDialogOpen(false))
        }}
      />
    </>
  )
}
