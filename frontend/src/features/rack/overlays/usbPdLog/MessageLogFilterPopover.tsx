import { useId, useState, type ChangeEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Dialog, DialogButton } from '../../../../ui/overlays'
import {
  GOODCRC_MESSAGE_TYPE_LABEL,
  type FilterOption,
  type MessageLogFilterKey,
  type MessageLogFilters,
} from './usbPdLogFilters'
import styles from '../../instruments/DrpdUsbPdLogInstrumentView.module.css'

type MessageLogFilterPopoverProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: MessageLogFilters
  options: {
    messageTypes: FilterOption[]
    senders: FilterOption[]
    receivers: FilterOption[]
    sopTypes: FilterOption[]
    crcValid: FilterOption[]
  }
  onApply: (next: MessageLogFilters) => void
  onClear: () => void
}

type MessageLogFilterDialogContentProps = Omit<MessageLogFilterPopoverProps, 'open'>

type MessageLogFilterGroup = {
  key: MessageLogFilterKey
  title: string
  options: FilterOption[]
}

const isFilterOptionChecked = (
  filters: MessageLogFilters,
  key: MessageLogFilterKey,
  value: string,
): boolean => {
  const rule = filters[key]
  if (rule.include.length > 0) {
    return rule.include.includes(value)
  }
  return !rule.exclude.includes(value)
}

const normalizeCheckboxFilters = (
  filters: MessageLogFilters,
  groups: MessageLogFilterGroup[],
): MessageLogFilters => {
  const hideGoodCrc = isGoodCrcHidden(filters)
  const next = { ...filters }
  for (const group of groups) {
    if (group.key === 'messageTypes') {
      continue
    }
    const excludedValues = group.options
      .filter((option) => !isFilterOptionChecked(filters, group.key, option.value))
      .map((option) => option.value)
    next[group.key] = {
      include: [],
      exclude: excludedValues,
    }
  }
  const messageTypeOptions = groups.find((group) => group.key === 'messageTypes')?.options ?? []
  const excludedMessageTypes = splitMessageTypeOptions(filters, messageTypeOptions)
    .excluded
    .map((option) => option.value)
  next.messageTypes = {
    include: [],
    exclude: [
      ...excludedMessageTypes,
      ...(hideGoodCrc ? [GOODCRC_MESSAGE_TYPE_LABEL] : []),
    ],
  }
  return next
}

const setCheckboxFilterValue = (
  filters: MessageLogFilters,
  group: MessageLogFilterGroup,
  value: string,
  checked: boolean,
): MessageLogFilters => {
  const checkedValues = new Set(
    group.options
      .filter((option) => isFilterOptionChecked(filters, group.key, option.value))
      .map((option) => option.value),
  )
  if (checked) {
    checkedValues.add(value)
  } else {
    checkedValues.delete(value)
  }
  return {
    ...filters,
    [group.key]: {
      include: [],
      exclude: group.options
        .filter((option) => !checkedValues.has(option.value))
        .map((option) => option.value),
    },
  }
}

const isGoodCrcHidden = (filters: MessageLogFilters): boolean =>
  !isFilterOptionChecked(filters, 'messageTypes', GOODCRC_MESSAGE_TYPE_LABEL)

const setGoodCrcHidden = (
  filters: MessageLogFilters,
  checked: boolean,
): MessageLogFilters => ({
  ...filters,
  messageTypes: {
    include: filters.messageTypes.include.filter((entry) => entry !== GOODCRC_MESSAGE_TYPE_LABEL),
    exclude: checked
      ? Array.from(new Set([...filters.messageTypes.exclude, GOODCRC_MESSAGE_TYPE_LABEL]))
      : filters.messageTypes.exclude.filter((entry) => entry !== GOODCRC_MESSAGE_TYPE_LABEL),
  },
})

const getSelectedValues = (event: ChangeEvent<HTMLSelectElement>): string[] =>
  Array.from(event.currentTarget.selectedOptions).map((option) => option.value)

const splitMessageTypeOptions = (
  filters: MessageLogFilters,
  options: FilterOption[],
): { included: FilterOption[]; excluded: FilterOption[] } => {
  const messageTypeOptions = options.filter((option) => option.value !== GOODCRC_MESSAGE_TYPE_LABEL)
  const includeValues = new Set(filters.messageTypes.include)
  const excludeValues = new Set(filters.messageTypes.exclude)
  return {
    included: messageTypeOptions.filter((option) => (
      includeValues.size > 0 ? includeValues.has(option.value) : !excludeValues.has(option.value)
    )),
    excluded: messageTypeOptions.filter((option) => (
      includeValues.size > 0 ? !includeValues.has(option.value) : excludeValues.has(option.value)
    )),
  }
}

const setMessageTypeExcludedValues = (
  filters: MessageLogFilters,
  excludedValues: string[],
): MessageLogFilters => ({
  ...filters,
  messageTypes: {
    include: [],
    exclude: Array.from(new Set([
      ...excludedValues.filter((entry) => entry !== GOODCRC_MESSAGE_TYPE_LABEL),
      ...(isGoodCrcHidden(filters) ? [GOODCRC_MESSAGE_TYPE_LABEL] : []),
    ])),
  },
})

const MessageLogFilterDialogContent = ({
  onOpenChange,
  filters,
  options,
  onApply,
  onClear,
}: MessageLogFilterDialogContentProps) => {
  const formId = useId()
  const [draft, setDraft] = useState(filters)
  const [selectedIncludedMessageTypes, setSelectedIncludedMessageTypes] = useState<string[]>([])
  const [selectedExcludedMessageTypes, setSelectedExcludedMessageTypes] = useState<string[]>([])
  const groups: MessageLogFilterGroup[] = [
    {
      key: 'messageTypes',
      title: 'Message type',
      options: options.messageTypes.filter((option) => option.value !== GOODCRC_MESSAGE_TYPE_LABEL),
    },
    { key: 'senders', title: 'Sender', options: options.senders },
    { key: 'receivers', title: 'Receiver', options: options.receivers },
    { key: 'sopTypes', title: 'SOP type', options: options.sopTypes },
    { key: 'crcValid', title: 'CRC', options: options.crcValid },
  ]
  const hideGoodCrc = isGoodCrcHidden(draft)
  const messageTypeOptions = groups[0]?.options ?? []
  const messageTypeLists = splitMessageTypeOptions(draft, messageTypeOptions)
  const moveMessageTypesToExcluded = (values: string[]) => {
    if (values.length === 0) {
      return
    }
    setDraft((previous) =>
      setMessageTypeExcludedValues(previous, [
        ...splitMessageTypeOptions(previous, messageTypeOptions)
          .excluded
          .map((option) => option.value),
        ...values,
      ]),
    )
    setSelectedIncludedMessageTypes([])
  }
  const moveMessageTypesToIncluded = (values: string[]) => {
    if (values.length === 0) {
      return
    }
    setDraft((previous) => {
      const moved = new Set(values)
      return setMessageTypeExcludedValues(
        previous,
        splitMessageTypeOptions(previous, messageTypeOptions)
          .excluded
          .map((option) => option.value)
          .filter((value) => !moved.has(value)),
      )
    })
    setSelectedExcludedMessageTypes([])
  }
  const resetMessageTypes = () => {
    setDraft((previous) => setMessageTypeExcludedValues(previous, []))
    setSelectedIncludedMessageTypes([])
    setSelectedExcludedMessageTypes([])
  }
  const submitDraft = () => {
    onApply(normalizeCheckboxFilters(draft, groups))
    onOpenChange(false)
  }
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submitDraft()
  }
  const handleFormKeyDown = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter') {
      return
    }
    event.preventDefault()
    submitDraft()
  }

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title="Filter message log"
      footer={
        <>
          <DialogButton
            onClick={() => {
              onClear()
              onOpenChange(false)
            }}
          >
            Clear
          </DialogButton>
          <DialogButton
            type="submit"
            form={formId}
            variant="primary"
          >
            Apply
          </DialogButton>
        </>
      }
    >
      <form
        id={formId}
        className={styles.filterForm}
        onSubmit={handleSubmit}
        onKeyDown={handleFormKeyDown}
      >
        <div className={styles.filterGroups}>
          {groups.map((group) => (
            <fieldset
              key={group.key}
              className={[
                styles.filterGroup,
                group.key === 'messageTypes' ? styles.filterGroupWide : '',
              ].filter(Boolean).join(' ')}
            >
              <legend className={styles.filterLegend}>{group.title}</legend>
              {group.key === 'messageTypes' ? (
                <div className={styles.messageTypeDualList}>
                  <label className={styles.messageTypeListColumn}>
                    <span className={styles.messageTypeListLabel}><strong>Included message types</strong></span>
                    <select
                      multiple
                      className={styles.messageTypeSelect}
                      onChange={(event) => {
                        setSelectedIncludedMessageTypes(getSelectedValues(event))
                      }}
                      onDoubleClick={(event) => {
                        const value = event.currentTarget.value
                        if (value) {
                          moveMessageTypesToExcluded([value])
                        }
                      }}
                    >
                      {messageTypeLists.included.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className={styles.messageTypeActions}>
                    <button
                      type="button"
                      className={styles.messageTypeMoveButton}
                      onClick={() => {
                        moveMessageTypesToExcluded(selectedIncludedMessageTypes)
                      }}
                    >
                      &gt;&gt;
                    </button>
                    <button
                      type="button"
                      className={styles.messageTypeMoveButton}
                      onClick={() => {
                        moveMessageTypesToIncluded(selectedExcludedMessageTypes)
                      }}
                    >
                      &lt;&lt;
                    </button>
                    <button
                      type="button"
                      className={styles.messageTypeResetButton}
                      onClick={resetMessageTypes}
                    >
                      Reset
                    </button>
                  </div>
                  <label className={styles.messageTypeListColumn}>
                    <span className={styles.messageTypeListLabel}><strong>Excluded message types</strong></span>
                    <select
                      multiple
                      className={styles.messageTypeSelect}
                      onChange={(event) => {
                        setSelectedExcludedMessageTypes(getSelectedValues(event))
                      }}
                      onDoubleClick={(event) => {
                        const value = event.currentTarget.value
                        if (value) {
                          moveMessageTypesToIncluded([value])
                        }
                      }}
                    >
                      {messageTypeLists.excluded.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : group.options.length > 0 ? (
                group.options.map((option) => {
                  const checked = isFilterOptionChecked(draft, group.key, option.value)
                  return (
                    <label key={option.value} className={styles.filterOption}>
                      <input
                        type="checkbox"
                        className={styles.filterOptionCheckbox}
                        checked={checked}
                        onChange={(event) => {
                          setDraft((previous) =>
                            setCheckboxFilterValue(
                              previous,
                              group,
                              option.value,
                              event.target.checked,
                            ),
                          )
                        }}
                      />
                      <span className={styles.filterOptionLabel}>{option.label}</span>
                    </label>
                  )
                })
              ) : (
                <span className={styles.filterEmpty}>No values</span>
              )}
            </fieldset>
          ))}
        </div>
        <label className={styles.filterGoodCrcOption}>
          <input
            type="checkbox"
            className={styles.filterOptionCheckbox}
            checked={hideGoodCrc}
            onChange={(event) => {
              setDraft((previous) => setGoodCrcHidden(previous, event.target.checked))
            }}
          />
          <span className={styles.filterOptionLabel}>Hide GoodCRC messages</span>
        </label>
      </form>
    </Dialog>
  )
}

export const MessageLogFilterPopover = (props: MessageLogFilterPopoverProps) => {
  if (!props.open) {
    return null
  }

  return <MessageLogFilterDialogContent {...props} />
}
