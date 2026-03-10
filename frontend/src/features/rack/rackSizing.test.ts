import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_RACK_SIZING, getRackSizingConfig } from './rackSizing'

describe('rackSizing', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('style')
  })

  it('returns the default sizing config when CSS variables are not defined', () => {
    expect(getRackSizingConfig()).toEqual(DEFAULT_RACK_SIZING)
  })

  it('reads resolved rack sizing tokens from CSS custom properties', () => {
    document.documentElement.style.setProperty('--rack-unit-height-px', '88px')
    document.documentElement.style.setProperty('--rack-max-row-width-units', '48')
    document.documentElement.style.setProperty('--rack-fit-min-viewport-height-px', '360px')
    document.documentElement.style.setProperty('--rack-popover-gap-px', '6px')

    const config = getRackSizingConfig()

    expect(config.unitHeightPx).toBe(88)
    expect(config.maxRowWidthUnits).toBe(48)
    expect(config.minFitViewportHeightPx).toBe(360)
    expect(config.popoverGapPx).toBe(6)
  })

  it('resolves calc-based rack sizing tokens that depend on a shared scale variable', () => {
    document.documentElement.style.setProperty('--ui-scale', '0.9')
    document.documentElement.style.setProperty(
      '--rack-unit-height-px',
      'calc(100px * var(--ui-scale))',
    )
    document.documentElement.style.setProperty(
      '--rack-popover-viewport-inset-px',
      'calc(8px * var(--ui-scale))',
    )

    const config = getRackSizingConfig()

    expect(config.unitHeightPx).toBeCloseTo(90)
    expect(config.popoverViewportInsetPx).toBeCloseTo(7.2)
  })
})
