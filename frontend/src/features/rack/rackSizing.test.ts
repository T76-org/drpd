import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_RACK_SIZING, getRackSizingConfig } from './rackSizing'

describe('rackSizing', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('style')
  })

  it('returns the default sizing config when CSS variables are not defined', () => {
    expect(getRackSizingConfig()).toEqual(DEFAULT_RACK_SIZING)
  })

  it('reads resolved popover sizing tokens from CSS custom properties', () => {
    document.documentElement.style.setProperty('--rack-popover-viewport-inset-px', '12px')
    document.documentElement.style.setProperty('--rack-popover-gap-px', '6px')

    const config = getRackSizingConfig()

    expect(config.popoverViewportInsetPx).toBe(12)
    expect(config.popoverGapPx).toBe(6)
  })

  it('resolves calc-based popover sizing tokens', () => {
    document.documentElement.style.setProperty('--ui-scale', '1')
    document.documentElement.style.setProperty(
      '--rack-popover-viewport-inset-px',
      'calc(8px * var(--ui-scale))',
    )

    const config = getRackSizingConfig()

    expect(config.popoverViewportInsetPx).toBeCloseTo(8)
  })
})
