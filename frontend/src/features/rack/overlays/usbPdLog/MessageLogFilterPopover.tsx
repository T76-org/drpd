import { useState } from 'react'
import { Dialog, DialogButton } from '../../../../ui/overlays'
import type { FilterOption, MessageLogFilterKey, MessageLogFilters } from './usbPdLogFilters'
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
  const next = { ...filters }
  for (const group of groups) {
    const excludedValues = group.options
      .filter((option) => !isFilterOptionChecked(filters, group.key, option.value))
      .map((option) => option.value)
    next[group.key] = {
      include: [],
      exclude: excludedValues,
    }
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

const MessageLogFilterDialogContent = ({
  onOpenChange,
  filters,
  options,
  onApply,
  onClear,
}: MessageLogFilterDialogContentProps) => {
  const [draft, setDraft] = useState(filters)
  const groups: MessageLogFilterGroup[] = [
    { key: 'messageTypes', title: 'Message type', options: options.messageTypes },
    { key: 'senders', title: 'Sender', options: options.senders },
    { key: 'receivers', title: 'Receiver', options: options.receivers },
    { key: 'sopTypes', title: 'SOP type', options: options.sopTypes },
    { key: 'crcValid', title: 'CRC', options: options.crcValid },
  ]

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
            variant="primary"
            onClick={() => {
              onApply(normalizeCheckboxFilters(draft, groups))
              onOpenChange(false)
            }}
          >
            Apply
          </DialogButton>
        </>
      }
    >
      <div className={styles.filterGroups}>
        {groups.map((group) => (
          <fieldset key={group.key} className={styles.filterGroup}>
            <legend className={styles.filterLegend}>{group.title}</legend>
            {group.options.length > 0 ? (
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
    </Dialog>
  )
}

export const MessageLogFilterPopover = (props: MessageLogFilterPopoverProps) => {
  if (!props.open) {
    return null
  }

  return <MessageLogFilterDialogContent {...props} />
}
