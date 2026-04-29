export const MESSAGE_LOG_COLUMNS = [
  {
    id: 'timestamp',
    label: 'Wall time',
    widthVar: '--column-width-timestamp',
    defaultWidthPx: 116,
    minWidthPx: 80,
    align: 'right',
    field: 'timestamp',
  },
  {
    id: 'duration',
    label: 'Length',
    widthVar: '--column-width-duration',
    defaultWidthPx: 68,
    minWidthPx: 52,
    align: 'right',
    field: 'duration',
  },
  {
    id: 'delta',
    label: 'Δt',
    widthVar: '--column-width-delta',
    defaultWidthPx: 72,
    minWidthPx: 52,
    align: 'right',
    field: 'delta',
  },
  {
    id: 'messageId',
    label: 'ID',
    widthVar: '--column-width-id',
    defaultWidthPx: 40,
    minWidthPx: 34,
    align: 'center',
    field: 'messageId',
  },
  {
    id: 'messageType',
    label: 'Message type',
    widthVar: '--column-width-message-type',
    defaultWidthPx: 200,
    minWidthPx: 110,
    align: 'left',
    field: 'messageType',
  },
  {
    id: 'sender',
    label: 'Sender',
    widthVar: '--column-width-sender',
    defaultWidthPx: 74,
    minWidthPx: 56,
    align: 'left',
    field: 'sender',
  },
  {
    id: 'receiver',
    label: 'Receiver',
    widthVar: '--column-width-receiver',
    defaultWidthPx: 80,
    minWidthPx: 62,
    align: 'left',
    field: 'receiver',
  },
  {
    id: 'sopType',
    label: 'SOP',
    widthVar: '--column-width-sop-type',
    defaultWidthPx: 52,
    minWidthPx: 40,
    align: 'center',
    field: 'sopType',
  },
  {
    id: 'valid',
    label: 'Valid',
    widthVar: '--column-width-valid',
    defaultWidthPx: 56,
    minWidthPx: 40,
    align: 'center',
    field: 'valid',
  },
] as const

export type MessageLogColumnId = typeof MESSAGE_LOG_COLUMNS[number]['id']
export type MessageLogColumnVisibility = Record<MessageLogColumnId, boolean>
export type MessageLogColumnWidths = Record<MessageLogColumnId, number>

const MESSAGE_LOG_COLUMNS_STORAGE_KEY = 'drpd:message-log:columns'
const MESSAGE_LOG_COLUMN_WIDTHS_STORAGE_KEY = 'drpd:message-log:column-widths'

export const DEFAULT_MESSAGE_LOG_COLUMN_VISIBILITY: MessageLogColumnVisibility =
  Object.fromEntries(MESSAGE_LOG_COLUMNS.map((column) => [column.id, true])) as MessageLogColumnVisibility
export const DEFAULT_MESSAGE_LOG_COLUMN_WIDTHS: MessageLogColumnWidths =
  Object.fromEntries(MESSAGE_LOG_COLUMNS.map((column) => [column.id, column.defaultWidthPx])) as MessageLogColumnWidths

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

export const normalizeMessageLogColumnWidths = (
  value: unknown,
): MessageLogColumnWidths => {
  const source = value && typeof value === 'object'
    ? value as Partial<Record<MessageLogColumnId, unknown>>
    : {}
  return Object.fromEntries(
    MESSAGE_LOG_COLUMNS.map((column) => {
      const width = source[column.id]
      const normalizedWidth = typeof width === 'number' && Number.isFinite(width)
        ? Math.max(column.minWidthPx, Math.round(width))
        : column.defaultWidthPx
      return [column.id, normalizedWidth]
    }),
  ) as MessageLogColumnWidths
}

export const readMessageLogColumnWidths = (): MessageLogColumnWidths => {
  if (typeof window === 'undefined') {
    return DEFAULT_MESSAGE_LOG_COLUMN_WIDTHS
  }
  try {
    const raw = window.localStorage?.getItem?.(MESSAGE_LOG_COLUMN_WIDTHS_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_MESSAGE_LOG_COLUMN_WIDTHS
    }
    return normalizeMessageLogColumnWidths(JSON.parse(raw))
  } catch {
    return DEFAULT_MESSAGE_LOG_COLUMN_WIDTHS
  }
}

export const saveMessageLogColumnWidths = (
  widths: MessageLogColumnWidths,
): void => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage?.setItem?.(
      MESSAGE_LOG_COLUMN_WIDTHS_STORAGE_KEY,
      JSON.stringify(normalizeMessageLogColumnWidths(widths)),
    )
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

export const notifyMessageLogColumnVisibilityChanged = (
  visibility: MessageLogColumnVisibility,
  widths?: MessageLogColumnWidths,
): void => {
  window.dispatchEvent(
    new CustomEvent('drpd-message-log-columns-changed', {
      detail: {
        visibility: normalizeMessageLogColumnVisibility(visibility),
        widths: widths ? normalizeMessageLogColumnWidths(widths) : undefined,
      },
    }),
  )
}
