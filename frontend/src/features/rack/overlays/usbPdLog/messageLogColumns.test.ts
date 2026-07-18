import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_MESSAGE_LOG_COLUMN_WIDTHS,
  normalizeMessageLogColumnWidths,
  readMessageLogColumnWidths,
} from './messageLogColumns'

describe('messageLogColumns', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    })
  })

  it('uses widened defaults for time columns', () => {
    expect(DEFAULT_MESSAGE_LOG_COLUMN_WIDTHS.timestamp).toBe(144)
    expect(DEFAULT_MESSAGE_LOG_COLUMN_WIDTHS.delta).toBe(88)
  })

  it('migrates persisted legacy default widths', () => {
    window.localStorage.setItem(
      'drpd:message-log:column-widths',
      JSON.stringify({
        ...DEFAULT_MESSAGE_LOG_COLUMN_WIDTHS,
        timestamp: 116,
        delta: 72,
      }),
    )

    expect(readMessageLogColumnWidths()).toMatchObject({
      timestamp: 144,
      delta: 88,
    })
  })

  it('preserves custom widths and all other columns', () => {
    const widths = normalizeMessageLogColumnWidths({
      flagged: 48,
      timestamp: 132,
      duration: 76,
      delta: 96,
      messageId: 44,
      messageType: 240,
      sender: 84,
      receiver: 92,
      sopType: 60,
      valid: 64,
    })

    expect(widths).toEqual({
      flagged: 48,
      timestamp: 132,
      duration: 76,
      delta: 96,
      messageId: 44,
      messageType: 240,
      sender: 84,
      receiver: 92,
      sopType: 60,
      valid: 64,
    })
  })
})
