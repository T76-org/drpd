import { describe, expect, it } from 'vitest'
import { getTimestripThemePalette } from './timestripTheme'

const computedStyle = (values: Record<string, string>) => ({
  getPropertyValue: (name: string) => values[name] ?? '',
}) as CSSStyleDeclaration

describe('getTimestripThemePalette', () => {
  it('reads semantic high-contrast canvas, selection, trace, marker, and overlay colors', () => {
    const palette = getTimestripThemePalette('dark', computedStyle({
      '--color-timestrip-canvas': '#000000',
      '--color-timestrip-message-text': '#ffffff',
      '--color-timestrip-selection-fill': '#6b5400',
      '--color-timestrip-grid': '#666666',
      '--color-timestrip-marker': '#ffffff',
      '--color-timestrip-unavailable-stroke': '#ffffff',
      '--color-metric-voltage': '#74c0fc',
      '--color-metric-current': '#63e6be',
    }))

    expect(palette.canvasBackground).toBe('#000000')
    expect(palette.messageTextColor).toBe('#ffffff')
    expect(palette.selectedMessageFillColor).toBe('#6b5400')
    expect(palette.analogGridColor).toBe('#666666')
    expect(palette.captureMarkerColor).toBe('#ffffff')
    expect(palette.unavailableOverlayStrokeColor).toBe('#ffffff')
    expect(palette.voltageTraceColor).toBe('#74c0fc')
    expect(palette.currentTraceColor).toBe('#63e6be')
  })
})
