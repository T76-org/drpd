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
    expect(rackViewCss).toMatch(/\.headerScroll\s*\{[^}]*justify-content: flex-start;/s)
  })

  it('sizes the rack status header from the header element', () => {
    expect(rackViewCss).toMatch(/\.header\s*\{[^}]*container-type: inline-size;/s)
    expect(rackViewCss).toMatch(/\.header\s*\{[^}]*width:\s*min\(100%,\s*1350px\);/s)
    expect(rackViewCss).toMatch(/\.headerContent\s*\{[^}]*--rack-header-scale:/s)
    expect(rackViewCss).toContain('--rack-header-design-width: 1200px;')
    expect(rackViewCss).toMatch(
      /--rack-header-scale:\s*clamp\([^,]+,\s*calc\(100cqw \/ var\(--rack-header-design-width\)\),\s*[^)]+\);/,
    )
  })

  it('applies the header scale to status header dimensions and typography', () => {
    expect(rackViewCss).toContain(
      'height: calc(var(--rack-header-logo-height) * 1.35 * var(--rack-header-scale));',
    )
    expect(rackViewCss).toContain('padding-left: calc(var(--space-8) * var(--rack-header-scale));')
    expect(rackViewCss).toContain(
      'font-size: calc(var(--font-size-4xl) * 1.38 * var(--rack-header-scale));',
    )
    expect(rackViewCss).toContain('font-size: calc(1.9rem * var(--rack-header-scale));')
    expect(rackViewCss).toContain(
      'font-size: calc(var(--font-size-xs) * 1.15 * var(--rack-header-scale));',
    )
    expect(rackViewCss).toContain(
      'font-size: calc(var(--font-size-sm) * 1.25 * var(--rack-header-scale));',
    )
    expect(rackViewCss).toContain('min-width: calc(102px * var(--rack-header-scale));')
    expect(rackViewCss).toContain('width: calc(27.6px * var(--rack-header-scale));')
  })

  it('wraps secondary status groups without scaled fixed ch tracks', () => {
    expect(rackViewCss).toMatch(/\.headerVbusStatusGrid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(max-content,\s*1fr\)\);/s)
    expect(rackViewCss).toMatch(/@container\s*\(max-width:\s*980px\)\s*\{[^}]*\.headerVbusStatusGrid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(max-content,\s*1fr\)\);/s)
    expect(rackViewCss).toMatch(/@container\s*\(max-width:\s*660px\)\s*\{[^}]*\.headerVbusStatusGrid\s*\{[^}]*grid-template-columns:\s*max-content;/s)
    expect(rackViewCss).not.toContain('--header-vbus-capture-profile-label-width')
    expect(rackViewCss).not.toContain('--header-vbus-capture-profile-value-width')
    expect(rackViewCss).not.toMatch(/\d+ch\s*\*\s*var\(--rack-header-scale\)/)
  })

  it('lets header contents distribute across the available status header width', () => {
    expect(rackViewCss).toMatch(/\.titleBlock\s*\{[^}]*width:\s*100%;/s)
    expect(rackViewCss).toMatch(/\.headerVbusMetrics\s*\{[^}]*justify-content:\s*space-between;/s)
    expect(rackViewCss).toMatch(/\.headerVbusMetrics\s*\{[^}]*flex:\s*1 1 auto;/s)
    expect(rackViewCss).toMatch(/\.headerVbusStatusGrid\s*\{[^}]*flex:\s*1 1 420px;/s)
  })
})
