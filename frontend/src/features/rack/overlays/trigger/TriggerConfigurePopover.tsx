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
import { Dialog, DialogButton } from '../../../../ui/overlays'
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
  chipLabel: string
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

export const TriggerConfigurePopover = ({
  instrumentId,
  open,
  onOpenChange,
  eventTypeInput,
  senderFilterInput,
  messageTypeFiltersInput,
  messageTypeFilterClassInput,
  messageTypeFilterTypeInput,
  eventThresholdInput,
  autoRepeatInput,
  syncModeInput,
  syncPulseWidthUsInput,
  configureError,
  isApplyingConfig,
  setEventTypeInput,
  setSenderFilterInput,
  setMessageTypeFiltersInput,
  setMessageTypeFilterClassInput,
  setMessageTypeFilterTypeInput,
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
  messageTypeFilterClassInput: TriggerMessageTypeFilter['class']
  messageTypeFilterTypeInput: string
  eventThresholdInput: string
  autoRepeatInput: OnOffState
  syncModeInput: TriggerSyncMode
  syncPulseWidthUsInput: string
  configureError: string | null
  isApplyingConfig: boolean
  setEventTypeInput: (value: TriggerEventType) => void
  setSenderFilterInput: (value: TriggerSenderFilter) => void
  setMessageTypeFiltersInput: (updater: (current: TriggerMessageTypeFilter[]) => TriggerMessageTypeFilter[]) => void
  setMessageTypeFilterClassInput: (value: TriggerMessageTypeFilter['class']) => void
  setMessageTypeFilterTypeInput: (value: string) => void
  setEventThresholdInput: (value: string) => void
  setAutoRepeatInput: (value: OnOffState) => void
  setSyncModeInput: (value: TriggerSyncMode) => void
  setSyncPulseWidthUsInput: (value: string) => void
  setConfigureError: (value: string | null) => void
  onCancel: () => void
  onApply: () => void
}) => {
  const activeMessageTypeOptions =
    messageTypeFilterClassInput === TriggerMessageTypeFilterClass.CONTROL
      ? CONTROL_FILTER_OPTIONS
      : DATA_FILTER_OPTIONS
  const effectiveMessageTypeFilterTypeInput = activeMessageTypeOptions.some(
    (option) => String(option.messageTypeNumber) === messageTypeFilterTypeInput,
  )
    ? messageTypeFilterTypeInput
    : String(activeMessageTypeOptions[0]?.messageTypeNumber ?? '')
  const selectedEventSupportsFilters = isFilterCapableTriggerEventType(eventTypeInput)

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Configure trigger"
      dismissible={!isApplyingConfig}
      footer={
        <>
          <DialogButton onClick={onCancel} disabled={isApplyingConfig}>
            Cancel
          </DialogButton>
          <DialogButton variant="primary" onClick={onApply} disabled={isApplyingConfig}>
            {isApplyingConfig ? 'Applying...' : 'Apply'}
          </DialogButton>
        </>
      }
    >
    <div className={styles.headerPopup}>
      <div className={styles.headerPopupField}>
        <label className={styles.headerPopupLabel} htmlFor={`${instrumentId}-trigger-event`}>
          Event type
        </label>
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
      </div>
      <div className={styles.headerPopupField}>
        <label className={styles.headerPopupLabel} htmlFor={`${instrumentId}-trigger-sender`}>
          Sender
        </label>
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
              const nextOptions =
                event.currentTarget.value === TriggerMessageTypeFilterClass.CONTROL
                  ? CONTROL_FILTER_OPTIONS
                  : DATA_FILTER_OPTIONS
              const defaultType =
                event.currentTarget.value === TriggerMessageTypeFilterClass.DATA
                  ? nextOptions.find((option) => option.messageTypeNumber === 2) ?? nextOptions[0]
                  : nextOptions[0]
              setMessageTypeFilterTypeInput(String(defaultType?.messageTypeNumber ?? ''))
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
            value={effectiveMessageTypeFilterTypeInput}
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
              const parsedTypeNumber = Number(effectiveMessageTypeFilterTypeInput)
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
          <label className={styles.headerPopupLabel} htmlFor={`${instrumentId}-trigger-threshold`}>
            Threshold
          </label>
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
          />
        </div>
        <div className={styles.headerPopupField}>
          <label className={styles.headerPopupLabel} htmlFor={`${instrumentId}-trigger-autorepeat`}>
            Auto-repeat
          </label>
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
        </div>
      </div>
      <div className={styles.headerPopupFieldRow}>
        <div className={styles.headerPopupField}>
          <label className={styles.headerPopupLabel} htmlFor={`${instrumentId}-trigger-sync-mode`}>
            Sync mode
          </label>
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
        </div>
        <div className={styles.headerPopupField}>
          <label className={styles.headerPopupLabel} htmlFor={`${instrumentId}-trigger-pulse-width`}>
            Pulse width (us)
          </label>
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
          />
        </div>
      </div>
      <p className={styles.headerPopupHint}>
        Trigger threshold and pulse width are positive integer values.
      </p>
      {configureError ? <p className={styles.headerPopupError}>{configureError}</p> : null}
    </div>
    </Dialog>
  )
}
