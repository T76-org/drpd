import {
  OnOffState,
  TriggerEventType,
  TriggerMessageTypeFilterClass,
  TriggerSenderFilter,
  TriggerSyncMode,
  TRIGGER_MESSAGE_TYPE_FILTER_LIMIT,
  type TriggerInfo,
  type TriggerMessageTypeFilter,
} from '../../../../lib/device'
import { useState, type ChangeEvent } from 'react'
import { Dialog, DialogButton, DialogForm, DialogFormRow } from '../../../../ui/overlays'
import {
  CONTROL_MESSAGE_TYPES,
  DATA_MESSAGE_TYPES,
  EXTENDED_MESSAGE_TYPES,
} from '../../../../lib/device/drpd/usb-pd/message'
import styles from '../../instruments/DrpdTriggerInstrumentView.module.css'

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
}

const humanizeMessageTypeName = (value: string): string =>
  value
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const formatMessageTypeNumberHex = (value: number): string =>
  `0x${value.toString(16).toUpperCase().padStart(2, '0')}`

const CONTROL_FILTER_OPTIONS: TriggerMessageTypeOption[] = Object.entries(CONTROL_MESSAGE_TYPES)
  .map(([messageTypeNumber, definition]) => {
    const numericType = Number(messageTypeNumber)
    const humanizedName = humanizeMessageTypeName(definition.name)
    return {
      key: `${TriggerMessageTypeFilterClass.CONTROL}:${numericType}`,
      class: TriggerMessageTypeFilterClass.CONTROL,
      messageTypeNumber: numericType,
      pickerLabel: humanizedName,
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
      return {
        key: `${TriggerMessageTypeFilterClass.DATA}:${messageTypeNumber}`,
        class: TriggerMessageTypeFilterClass.DATA,
        messageTypeNumber,
        pickerLabel: combinedNames,
      }
    })
})()

const isFilterCapableTriggerEventType = (value: TriggerEventType): boolean =>
  FILTER_CAPABLE_EVENT_TYPES.has(value)

const formatTriggerEventType = (value: TriggerInfo['type'] | null | undefined): string => {
  if (!value) {
    return '--'
  }
  switch (value) {
    case TriggerEventType.OFF:
      return 'Off (trigger disabled)'
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

const parsePositiveIntegerInput = (value: string): number | null => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null
}

type TriggerMessageFilterSlot = TriggerMessageTypeFilter & {
  active: boolean
}

const getMessageTypeOptionsForClass = (
  filterClass: TriggerMessageTypeFilter['class'],
): TriggerMessageTypeOption[] =>
  filterClass === TriggerMessageTypeFilterClass.CONTROL
    ? CONTROL_FILTER_OPTIONS
    : DATA_FILTER_OPTIONS

const getDefaultMessageTypeNumber = (filterClass: TriggerMessageTypeFilter['class']): number => {
  const options = getMessageTypeOptionsForClass(filterClass)
  if (filterClass === TriggerMessageTypeFilterClass.DATA) {
    return options.find((option) => option.messageTypeNumber === 2)?.messageTypeNumber ??
      options[0]?.messageTypeNumber ??
      0
  }
  return options[0]?.messageTypeNumber ?? 0
}

const buildDefaultMessageFilterSlot = (): TriggerMessageFilterSlot => ({
  active: false,
  class: TriggerMessageTypeFilterClass.CONTROL,
  messageTypeNumber: getDefaultMessageTypeNumber(TriggerMessageTypeFilterClass.CONTROL),
})

const buildMessageFilterSlots = (
  filters: TriggerMessageTypeFilter[],
): TriggerMessageFilterSlot[] => {
  const slots = filters.slice(0, TRIGGER_MESSAGE_TYPE_FILTER_LIMIT).map((filter) => ({
    active: true,
    class: filter.class,
    messageTypeNumber: filter.messageTypeNumber,
  }))
  while (slots.length < TRIGGER_MESSAGE_TYPE_FILTER_LIMIT) {
    slots.push(buildDefaultMessageFilterSlot())
  }
  return slots
}

const buildMessageFilterKey = (filter: TriggerMessageTypeFilter): string =>
  `${filter.class}:${filter.messageTypeNumber}`

const buildUniqueMessageTypeFilters = (
  slots: TriggerMessageFilterSlot[],
): TriggerMessageTypeFilter[] => {
  const seen = new Set<string>()
  const filters: TriggerMessageTypeFilter[] = []
  for (const slot of slots) {
    if (!slot.active) {
      continue
    }
    const filter: TriggerMessageTypeFilter = {
      class: slot.class,
      messageTypeNumber: slot.messageTypeNumber,
    }
    const key = buildMessageFilterKey(filter)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    filters.push(filter)
  }
  return filters
}

const buildMessageFilterTypeOptions = (
  slot: TriggerMessageFilterSlot,
): TriggerMessageTypeOption[] => {
  const options = getMessageTypeOptionsForClass(slot.class)
  const hasCurrentOption = options.some(
    (option) => option.messageTypeNumber === slot.messageTypeNumber,
  )
  if (hasCurrentOption) {
    return options
  }
  return [
    {
      key: `${slot.class}:${slot.messageTypeNumber}:unknown`,
      class: slot.class,
      messageTypeNumber: slot.messageTypeNumber,
      pickerLabel: 'Unknown',
    },
    ...options,
  ]
}

export const TriggerConfigurePopover = ({
  instrumentId,
  open,
  onOpenChange,
  eventTypeInput,
  senderFilterInput,
  messageTypeFiltersInput,
  eventThresholdInput,
  autoRepeatInput,
  syncModeInput,
  syncPulseWidthUsInput,
  configureError,
  isApplyingConfig,
  setEventTypeInput,
  setSenderFilterInput,
  setMessageTypeFiltersInput,
  setEventThresholdInput,
  setAutoRepeatInput,
  setSyncModeInput,
  setSyncPulseWidthUsInput,
  setConfigureError,
  onCancel,
  onApply,
}: {
  instrumentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  eventTypeInput: TriggerEventType
  senderFilterInput: TriggerSenderFilter
  messageTypeFiltersInput: TriggerMessageTypeFilter[]
  eventThresholdInput: string
  autoRepeatInput: OnOffState
  syncModeInput: TriggerSyncMode
  syncPulseWidthUsInput: string
  configureError: string | null
  isApplyingConfig: boolean
  setEventTypeInput: (value: TriggerEventType) => void
  setSenderFilterInput: (value: TriggerSenderFilter) => void
  setMessageTypeFiltersInput: (updater: (current: TriggerMessageTypeFilter[]) => TriggerMessageTypeFilter[]) => void
  setEventThresholdInput: (value: string) => void
  setAutoRepeatInput: (value: OnOffState) => void
  setSyncModeInput: (value: TriggerSyncMode) => void
  setSyncPulseWidthUsInput: (value: string) => void
  setConfigureError: (value: string | null) => void
  onCancel: () => void
  onApply: () => void
}) => {
  const [draftMessageFilterSlots, setDraftMessageFilterSlots] = useState<
    TriggerMessageFilterSlot[] | null
  >(null)
  const messageFilterSlots =
    draftMessageFilterSlots ?? buildMessageFilterSlots(messageTypeFiltersInput)
  const selectedEventSupportsFilters = isFilterCapableTriggerEventType(eventTypeInput)
  const thresholdError =
    parsePositiveIntegerInput(eventThresholdInput) == null
      ? 'Threshold must be an integer greater than or equal to 1.'
      : null
  const pulseWidthError =
    parsePositiveIntegerInput(syncPulseWidthUsInput) == null
      ? 'Pulse width must be an integer greater than or equal to 1 µs.'
      : null
  const hasFieldError = thresholdError != null || pulseWidthError != null

  const commitMessageFilterSlots = (nextSlots: TriggerMessageFilterSlot[]) => {
    setDraftMessageFilterSlots(nextSlots)
    setMessageTypeFiltersInput(() => buildUniqueMessageTypeFilters(nextSlots))
    setConfigureError(null)
  }

  const updateMessageFilterSlot = (
    index: number,
    updater: (slot: TriggerMessageFilterSlot) => TriggerMessageFilterSlot,
  ) => {
    commitMessageFilterSlots(
      messageFilterSlots.map((slot, slotIndex) =>
        slotIndex === index ? updater(slot) : slot,
      ),
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setDraftMessageFilterSlots(null)
        }
        onOpenChange(nextOpen)
      }}
      title="Configure trigger"
      dismissible={!isApplyingConfig}
      footer={
        <>
          <DialogButton
            onClick={() => {
              setDraftMessageFilterSlots(null)
              onCancel()
            }}
            disabled={isApplyingConfig}
          >
            Cancel
          </DialogButton>
          <DialogButton
            variant="primary"
            onClick={() => {
              setDraftMessageFilterSlots(null)
              onApply()
            }}
            disabled={isApplyingConfig || hasFieldError}
          >
            {isApplyingConfig ? 'Applying...' : 'Apply'}
          </DialogButton>
        </>
      }
    >
      <DialogForm className={styles.headerPopup}>
      <DialogFormRow
        className={styles.headerPopupRow}
        label="Trigger stage"
        htmlFor={`${instrumentId}-trigger-event`}
      >
        <select
          id={`${instrumentId}-trigger-event`}
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
      </DialogFormRow>
      <DialogFormRow
        className={styles.headerPopupRow}
        label="Sender"
        htmlFor={`${instrumentId}-trigger-sender`}
        helpText={
          selectedEventSupportsFilters
            ? 'Filter by source, sink, or cable origin once the header is available.'
            : 'Sender filtering is stored but ignored for this event type until the header is known, starting at Data Start.'
        }
      >
        <select
          id={`${instrumentId}-trigger-sender`}
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
      </DialogFormRow>
      <DialogFormRow
        className={styles.headerPopupRow}
        label="Message Type"
        helpText={
          selectedEventSupportsFilters
            ? undefined
            : 'Message filters are stored but ignored for this event type until the header is known, starting at Data Start.'
        }
      >
        <div className={styles.headerPopupSection}>
        <div className={styles.messageFilterSlotList}>
          {messageFilterSlots.map((slot, index) => {
            const slotNumber = index + 1
            const typeOptions = buildMessageFilterTypeOptions(slot)
            const controlsDisabled = isApplyingConfig || !selectedEventSupportsFilters
            const dropdownsDisabled = controlsDisabled || !slot.active
            return (
              <div key={index} className={styles.messageFilterSlotRow}>
                <label className={styles.messageFilterSlotToggle}>
                  <input
                    type="checkbox"
                    checked={slot.active}
                    disabled={controlsDisabled}
                    aria-label={`Enable message filter slot ${slotNumber}`}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      updateMessageFilterSlot(index, (current) => ({
                        ...current,
                        active: event.currentTarget.checked,
                      }))
                    }}
                  />
                </label>
                <select
                  aria-label={`Message filter slot ${slotNumber} category`}
                  className={styles.headerPopupSelect}
                  value={slot.class}
                  disabled={dropdownsDisabled}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                    const nextClass = event.currentTarget.value as TriggerMessageTypeFilter['class']
                    updateMessageFilterSlot(index, (current) => ({
                      ...current,
                      class: nextClass,
                      messageTypeNumber: getDefaultMessageTypeNumber(nextClass),
                    }))
                  }}
                >
                  <option value={TriggerMessageTypeFilterClass.CONTROL}>Control</option>
                  <option value={TriggerMessageTypeFilterClass.DATA}>Data-bearing</option>
                </select>
                <select
                  aria-label={`Message filter slot ${slotNumber} type`}
                  className={styles.headerPopupSelect}
                  value={String(slot.messageTypeNumber)}
                  disabled={dropdownsDisabled || typeOptions.length === 0}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                    const nextType = Number(event.currentTarget.value)
                    updateMessageFilterSlot(index, (current) => ({
                      ...current,
                      messageTypeNumber: Number.isInteger(nextType)
                        ? nextType
                        : getDefaultMessageTypeNumber(current.class),
                    }))
                  }}
                >
                  {typeOptions.map((option) => (
                    <option key={option.key} value={String(option.messageTypeNumber)}>
                      {option.pickerLabel}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
        </div>
      </DialogFormRow>
      <DialogFormRow
        className={styles.headerPopupRow}
        label="Threshold"
        htmlFor={`${instrumentId}-trigger-threshold`}
        errorText={thresholdError}
      >
          <input
            id={`${instrumentId}-trigger-threshold`}
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
            aria-invalid={thresholdError != null}
          />
      </DialogFormRow>
      <DialogFormRow
        className={styles.headerPopupRow}
        label="Auto-repeat"
        htmlFor={`${instrumentId}-trigger-autorepeat`}
      >
          <select
            id={`${instrumentId}-trigger-autorepeat`}
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
      </DialogFormRow>
      <DialogFormRow
        className={styles.headerPopupRow}
        label="Sync mode"
        htmlFor={`${instrumentId}-trigger-sync-mode`}
      >
          <select
            id={`${instrumentId}-trigger-sync-mode`}
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
      </DialogFormRow>
      <DialogFormRow
        className={styles.headerPopupRow}
        label="Pulse width (µs)"
        htmlFor={`${instrumentId}-trigger-pulse-width`}
        errorText={pulseWidthError}
      >
          <input
            id={`${instrumentId}-trigger-pulse-width`}
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
            aria-invalid={pulseWidthError != null}
          />
      </DialogFormRow>
      {configureError ? (
        <div className={styles.headerPopupStatusRow}>
          <p className={styles.headerPopupError}>{configureError}</p>
        </div>
      ) : null}
      </DialogForm>
    </Dialog>
  )
}
