export const MESSAGE_LOG_COLUMNS = [
  { id: 'timestamp', label: 'Wall time', widthVar: '--column-width-timestamp', align: 'right', field: 'timestamp' },
  { id: 'duration', label: 'Length', widthVar: '--column-width-duration', align: 'right', field: 'duration' },
  { id: 'delta', label: 'Δt', widthVar: '--column-width-delta', align: 'right', field: 'delta' },
  { id: 'messageId', label: 'ID', widthVar: '--column-width-id', align: 'center', field: 'messageId' },
  { id: 'messageType', label: 'Message type', widthVar: '--column-width-message-type', align: 'left', field: 'messageType' },
  { id: 'sender', label: 'Sender', widthVar: '--column-width-sender', align: 'left', field: 'sender' },
  { id: 'receiver', label: 'Receiver', widthVar: '--column-width-receiver', align: 'left', field: 'receiver' },
  { id: 'sopType', label: 'SOP', widthVar: '--column-width-sop-type', align: 'center', field: 'sopType' },
  { id: 'valid', label: 'Valid', widthVar: '--column-width-valid', align: 'center', field: 'valid' },
] as const

export type MessageLogColumnId = typeof MESSAGE_LOG_COLUMNS[number]['id']
export type MessageLogColumnVisibility = Record<MessageLogColumnId, boolean>

const MESSAGE_LOG_COLUMNS_STORAGE_KEY = 'drpd:message-log:columns'

export const DEFAULT_MESSAGE_LOG_COLUMN_VISIBILITY: MessageLogColumnVisibility =
  Object.fromEntries(MESSAGE_LOG_COLUMNS.map((column) => [column.id, true])) as MessageLogColumnVisibility

export const normalizeMessageLogColumnVisibility = (
  value: unknown,
): MessageLogColumnVisibility => {
  const source = value && typeof value === 'object'
    ? value as Partial<Record<MessageLogColumnId, unknown>>
    : {}
  return Object.fromEntries(
    MESSAGE_LOG_COLUMNS.map((column) => [
      column.id,
      typeof source[column.id] === 'boolean' ? source[column.id] : true,
    ]),
  ) as MessageLogColumnVisibility
}

export const readMessageLogColumnVisibility = (): MessageLogColumnVisibility => {
  if (typeof window === 'undefined') {
    return DEFAULT_MESSAGE_LOG_COLUMN_VISIBILITY
  }
  try {
    const raw = window.localStorage?.getItem?.(MESSAGE_LOG_COLUMNS_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_MESSAGE_LOG_COLUMN_VISIBILITY
    }
    return normalizeMessageLogColumnVisibility(JSON.parse(raw))
  } catch {
    return DEFAULT_MESSAGE_LOG_COLUMN_VISIBILITY
  }
}

export const saveMessageLogColumnVisibility = (
  visibility: MessageLogColumnVisibility,
): void => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage?.setItem?.(
      MESSAGE_LOG_COLUMNS_STORAGE_KEY,
      JSON.stringify(normalizeMessageLogColumnVisibility(visibility)),
    )
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

export const notifyMessageLogColumnVisibilityChanged = (
  visibility: MessageLogColumnVisibility,
): void => {
  window.dispatchEvent(
    new CustomEvent('drpd-message-log-columns-changed', {
      detail: { visibility: normalizeMessageLogColumnVisibility(visibility) },
    }),
  )
}
