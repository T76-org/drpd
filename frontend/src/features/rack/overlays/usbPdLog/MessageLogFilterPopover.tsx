import { useState } from 'react'
import type { FilterOption, MessageLogFilterKey, MessageLogFilters } from './usbPdLogFilters'
import { toggleFilterValue } from './usbPdLogFilters'
import styles from '../../instruments/DrpdUsbPdLogInstrumentView.module.css'

export const MessageLogFilterPopover = ({
  filters,
  options,
  onApply,
  onClear,
  closePopover,
}: {
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
  closePopover: () => void
}) => {
  const [draft, setDraft] = useState(filters)
  const groups: Array<{
    key: MessageLogFilterKey
    title: string
    options: FilterOption[]
  }> = [
    { key: 'messageTypes', title: 'Message type', options: options.messageTypes },
    { key: 'senders', title: 'Sender', options: options.senders },
    { key: 'receivers', title: 'Receiver', options: options.receivers },
    { key: 'sopTypes', title: 'SOP type', options: options.sopTypes },
    { key: 'crcValid', title: 'CRC', options: options.crcValid },
  ]

  return (
    <div className={styles.headerPopup}>
      <div className={styles.filterGroups}>
        {groups.map((group) => (
          <fieldset key={group.key} className={styles.filterGroup}>
            <legend className={styles.filterLegend}>{group.title}</legend>
            {group.options.length > 0 ? (
              group.options.map((option) => {
                const rule = draft[group.key]
                const included = rule.include.includes(option.value)
                const excluded = rule.exclude.includes(option.value)
                return (
                  <div key={option.value} className={styles.filterOption}>
                    <span className={styles.filterOptionLabel}>{option.label}</span>
                    <div className={styles.filterOptionActions}>
                      <button
                        type="button"
                        className={[
                          styles.filterModeButton,
                          included ? styles.filterModeButtonActive : '',
                        ].filter(Boolean).join(' ')}
                        aria-pressed={included}
                        onClick={() => {
                          setDraft((previous) =>
                            toggleFilterValue(previous, group.key, 'include', option.value),
                          )
                        }}
                      >
                        Include
                      </button>
                      <button
                        type="button"
                        className={[
                          styles.filterModeButton,
                          excluded ? styles.filterModeButtonActive : '',
                        ].filter(Boolean).join(' ')}
                        aria-pressed={excluded}
                        onClick={() => {
                          setDraft((previous) =>
                            toggleFilterValue(previous, group.key, 'exclude', option.value),
                          )
                        }}
                      >
                        Exclude
                      </button>
                    </div>
                  </div>
                )
              })
            ) : (
              <span className={styles.filterEmpty}>No values</span>
            )}
          </fieldset>
        ))}
      </div>
      <div className={styles.headerPopupActions}>
        <button
          type="button"
          className={styles.headerPopupButton}
          onClick={() => {
            onClear()
            closePopover()
          }}
        >
          Clear
        </button>
        <button
          type="button"
          className={styles.headerPopupButton}
          onClick={() => {
            onApply(draft)
            closePopover()
          }}
        >
          Apply
        </button>
      </div>
    </div>
  )
}
