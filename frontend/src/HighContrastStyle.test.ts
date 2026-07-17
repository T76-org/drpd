import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')
const messageLogCss = readFileSync(
  join(process.cwd(), 'src/features/rack/instruments/DrpdUsbPdLogInstrumentView.module.css'),
  'utf8',
)

const luminance = (hex: string): number => {
  const channels = hex.match(/[0-9a-f]{2}/gi)?.map((value) => Number.parseInt(value, 16) / 255) ?? []
  const linear = channels.map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ))
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

const contrast = (left: string, right: string): number => {
  const [bright, dark] = [luminance(left), luminance(right)].sort((a, b) => b - a)
  return (bright + 0.05) / (dark + 0.05)
}

describe('high contrast semantic palette', () => {
  it('covers both light and dark themes plus non-color focus differentiation', () => {
    expect(css).toContain(":root[data-high-contrast='true']")
    expect(css).toContain(":root[data-theme='light'][data-high-contrast='true']")
    expect(css).toContain('--color-timestrip-selection-fill:')
    expect(css).toContain('--color-log-event-ocp-bg:')
    expect(css).toMatch(/data-high-contrast='true'][^}]*button:focus-visible[\s\S]*outline:\s*3px/)
  })

  it('meets WCAG AA contrast for representative semantic text colors', () => {
    expect(contrast('#ffffff', '#000000')).toBeGreaterThanOrEqual(7)
    expect(contrast('#d6d6d6', '#000000')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#333333', '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#9c0006', '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#0047ab', '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('gives Message Log events high-contrast text, borders, and non-color category accents', () => {
    expect(messageLogCss).toMatch(
      /data-high-contrast='true'\]\) \.dataRow\s*\{[^}]*border-bottom:\s*var\(--border-thin\) solid var\(--color-text-primary\);/s,
    )
    expect(messageLogCss).toMatch(
      /data-high-contrast='true'\]\) \.eventRow\s*\{[^}]*color:\s*var\(--color-text-primary\);/s,
    )
    expect(messageLogCss).toMatch(
      /data-high-contrast='true'\]\) \.eventRow\s*\{[^}]*border-left:\s*6px solid var\(--event-row-accent/s,
    )
    expect(messageLogCss).not.toMatch(
      /data-high-contrast='true'\]\) \.eventRow\s*\{[^}]*box-shadow:/s,
    )
    expect(messageLogCss.match(/--event-row-accent:/g)).toHaveLength(8)
  })
})
