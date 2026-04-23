import { describe, expect, it } from 'vitest'
import { isTextEntryShortcutTarget, matchRackShortcut } from './shortcuts'

describe('rack shortcuts', () => {
  it('matches declared global shortcuts', () => {
    expect(matchRackShortcut(new KeyboardEvent('keydown', { key: 'S' }))).toBe('switch-sink')
    expect(matchRackShortcut(new KeyboardEvent('keydown', { key: 'O' }))).toBe('switch-observer')
    expect(matchRackShortcut(new KeyboardEvent('keydown', { key: 'C' }))).toBe('toggle-capture')
    expect(matchRackShortcut(new KeyboardEvent('keydown', { key: 'T' }))).toBe('toggle-usb-connection')
    expect(matchRackShortcut(new KeyboardEvent('keydown', { key: '?' }))).toBe('show-shortcut-help')
  })

  it('ignores text-entry targets', () => {
    const input = document.createElement('input')
    input.type = 'text'
    const event = new KeyboardEvent('keydown', { key: 'S' })
    Object.defineProperty(event, 'target', { value: input })

    expect(isTextEntryShortcutTarget(input)).toBe(true)
    expect(matchRackShortcut(event)).toBeNull()
  })

  it('allows non-text controls to use shortcuts', () => {
    const button = document.createElement('button')
    const event = new KeyboardEvent('keydown', { key: 'S' })
    Object.defineProperty(event, 'target', { value: button })

    expect(isTextEntryShortcutTarget(button)).toBe(false)
    expect(matchRackShortcut(event)).toBe('switch-sink')
  })
})
