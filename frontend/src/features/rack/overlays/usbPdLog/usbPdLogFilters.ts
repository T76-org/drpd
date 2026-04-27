export type MessageLogFilterRule = {
  include: string[]
  exclude: string[]
}

export type MessageLogFilterKey =
  | 'messageTypes'
  | 'senders'
  | 'receivers'
  | 'sopTypes'
  | 'crcValid'

export type MessageLogFilters = Record<MessageLogFilterKey, MessageLogFilterRule>

export type FilterOption = {
  value: string
  label: string
}

export const toggleFilterValue = (
  filters: MessageLogFilters,
  key: MessageLogFilterKey,
  mode: keyof MessageLogFilterRule,
  value: string,
): MessageLogFilters => {
  const currentRule = filters[key]
  const otherMode: keyof MessageLogFilterRule = mode === 'include' ? 'exclude' : 'include'
  const nextModeValues = currentRule[mode].includes(value)
    ? currentRule[mode].filter((entry) => entry !== value)
    : [...currentRule[mode], value]
  return {
    ...filters,
    [key]: {
      [mode]: nextModeValues,
      [otherMode]: currentRule[otherMode].filter((entry) => entry !== value),
    },
  }
}
