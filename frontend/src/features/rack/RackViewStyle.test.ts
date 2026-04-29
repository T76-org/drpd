import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const rackViewCss = readFileSync(
  join(process.cwd(), 'src/features/rack/RackView.module.css'),
  'utf8',
)

describe('RackView responsive header CSS', () => {
  it('clips header and menu bar overflow on the right without horizontal scroll', () => {
    expect(rackViewCss).toMatch(/\.menuBarViewport\s*\{[^}]*overflow-x: hidden;/s)
    expect(rackViewCss).toMatch(/\.headerViewport\s*\{[^}]*overflow-x: hidden;/s)
    expect(rackViewCss).toMatch(/\.menuBarScroll\s*\{[^}]*justify-content: safe center;/s)
    expect(rackViewCss).toMatch(/\.headerScroll\s*\{[^}]*justify-content: safe center;/s)
  })

  it('sizes the rack status header from the header element', () => {
    expect(rackViewCss).toMatch(/\.header\s*\{[^}]*container-type: inline-size;/s)
    expect(rackViewCss).toMatch(/\.headerContent\s*\{[^}]*--rack-header-scale:/s)
    expect(rackViewCss).toContain('--rack-header-design-width: 1200px;')
    expect(rackViewCss).toMatch(
      /--rack-header-scale:\s*clamp\([^,]+,\s*calc\(100cqw \/ var\(--rack-header-design-width\)\),\s*[^)]+\);/,
    )
  })

  it('applies the header scale to status header dimensions and typography', () => {
    expect(rackViewCss).toContain(
      'height: calc(var(--rack-header-logo-height) * 1.15 * var(--rack-header-scale));',
    )
    expect(rackViewCss).toContain('padding-left: calc(var(--space-8) * var(--rack-header-scale));')
    expect(rackViewCss).toContain(
      'font-size: calc(var(--font-size-4xl) * 1.265 * var(--rack-header-scale));',
    )
    expect(rackViewCss).toContain('min-width: calc(102px * var(--rack-header-scale));')
    expect(rackViewCss).toContain(
      'grid-template-columns: auto calc(12ch * var(--rack-header-scale));',
    )
    expect(rackViewCss).toContain('width: calc(27.6px * var(--rack-header-scale));')
  })
})
