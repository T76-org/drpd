import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  join(process.cwd(), 'src/features/rack/instruments/DrpdTimeStripInstrumentView.module.css'),
  'utf8',
)

describe('Timestrip range-selection styling', () => {
  it('keeps the drag highlight visible without a theme-specific accent token', () => {
    expect(css).toMatch(
      /\.rangeSelectionOverlay\s*\{[^}]*--timestrip-overlay-accent:\s*var\(--color-accent-primary,\s*var\(--color-status-info\)\);/s,
    )
    expect(css).toMatch(
      /\.rangeSelectionOverlay\s*\{[^}]*border:\s*2px solid var\(--timestrip-overlay-accent\);/s,
    )
    expect(css).toMatch(
      /\.rangeSelectionOverlay\s*\{[^}]*repeating-linear-gradient\(/s,
    )
  })
})
