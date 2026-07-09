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

  it('does not keep fixed-layout header overrides', () => {
    expect(rackViewCss).not.toContain("data-layout-mode='fixed'")
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
    expect(rackViewCss).toContain(
      'font-size: calc(var(--font-size-sm) * 1.25 * var(--rack-header-scale));',
    )
    expect(rackViewCss).toContain('min-width: calc(102px * var(--rack-header-scale));')
    expect(rackViewCss).toMatch(
      /\.headerVbusVoltage,\s*\.headerVbusCurrent,\s*\.headerVbusPower\s*\{[^}]*font-size:\s*calc\(var\(--font-size-4xl\) \* 1\.38 \* var\(--rack-header-scale\)\);/s,
    )
    expect(rackViewCss).toMatch(
      /\.headerVbusAccumulatorValue\s*\{[^}]*grid-template-columns:\s*8ch 2\.6ch;[^}]*font-variant-numeric:\s*tabular-nums;/s,
    )
    expect(rackViewCss).toMatch(
      /\.headerVbusAccumulatorUnit\s*\{[^}]*min-width:\s*2\.6ch;/s,
    )
    expect(rackViewCss).toMatch(
      /\.headerVbusAccumulatorElapsedValue\s*\{[^}]*width:\s*100%;[^}]*text-align:\s*right;[^}]*font-variant-numeric:\s*tabular-nums;/s,
    )
  })

  it('wraps secondary status groups without scaled fixed ch tracks', () => {
    expect(rackViewCss).toMatch(/\.headerVbusStatusGrid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(max-content,\s*1fr\)\);/s)
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

  it('keeps the front-panel visual compact while states change through data hooks', () => {
    expect(rackViewCss).toMatch(/\.headerFrontPanel\s*\{[^}]*--header-front-panel-width:\s*calc\(126px \* var\(--rack-header-scale\)\);/s)
    expect(rackViewCss).toMatch(/\.headerFrontPanel\s*\{[^}]*flex:\s*0 0 var\(--header-front-panel-width\);/s)
    expect(rackViewCss).toMatch(/\.headerFrontPanel\s*\{[^}]*height:\s*var\(--header-front-panel-height\);/s)
    expect(rackViewCss).toMatch(/\.headerFrontPanel\[data-disabled='true'\]\s*\{/s)
    expect(rackViewCss).toMatch(/\.headerUsbCPort\s*\{[^}]*background:\s*color-mix\(in srgb, #fff 94%, var\(--color-surface-header\)\);/s)
    expect(rackViewCss).toMatch(/\.headerUsbCPort\[data-connected='true'\]\s*\{/s)
    expect(rackViewCss).toMatch(/\.headerUsbCPort\[data-connected='true'\]\s*\{[^}]*border-color:\s*color-mix\(in srgb, var\(--color-status-success\) 74%, var\(--color-border-divider\)\);/s)
    expect(rackViewCss).toMatch(/\.headerUsbCPort\[data-disabled='true'\]\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--color-text-muted\) 14%, var\(--color-surface-header\)\);/s)
    expect(rackViewCss).not.toContain('background: color-mix(in srgb, var(--color-status-success) 72%, #fff);')
    expect(rackViewCss).toMatch(/\.headerFrontPanel\[data-usb-ports-enabled='true'\]\s+\.headerUsbCPort\[data-connected='false'\]\[data-disabled='false'\]\s*\{[^}]*animation:\s*headerUsbCPortAvailablePulse 2\.8s ease-in-out infinite;/s)
    expect(rackViewCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*animation:\s*none;/s)
    expect(rackViewCss).toMatch(/\.headerFrontPanel\s*\{[^}]*--header-banana-jack-color:\s*color-mix\(in srgb, #fff 94%, var\(--color-surface-header\)\);/s)
    expect(rackViewCss).toMatch(/\.headerFrontPanel\[data-disabled='true'\]\s*\{[^}]*--header-banana-jack-color:\s*color-mix\(in srgb, var\(--color-text-muted\) 56%, var\(--color-border-divider\)\);/s)
    expect(rackViewCss).toMatch(/\.headerFrontPanel\[data-flow='sink'\]\s*\{[^}]*--header-banana-jack-color:\s*color-mix\(in srgb, var\(--color-status-success\) 74%, var\(--color-border-divider\)\);/s)
    expect(rackViewCss).toMatch(/\.headerBananaJack\s*\{[^}]*border:[^;]*solid var\(--header-banana-jack-color\);[^}]*background:\s*transparent;/s)
    expect(rackViewCss).not.toMatch(/\.headerBananaJack\[data-polarity='positive'\]\s*\{/)
    expect(rackViewCss).not.toMatch(/\.headerBananaJack\[data-polarity='negative'\]\s*\{/)
    expect(rackViewCss).toMatch(/\.headerFrontPanelPortRail\s*\{[^}]*height:\s*calc\(16px \* var\(--rack-header-scale\)\);/s)
    expect(rackViewCss).toMatch(/\.headerFrontPanelPortRailLine\s*\{[^}]*stroke-width:\s*1\.5;/s)
    expect(rackViewCss).toMatch(/\.headerFrontPanelPortRailLine\s*\{[^}]*stroke-dasharray:\s*0 4;/s)
    expect(rackViewCss).toMatch(/\.headerFrontPanel\[data-port-rail-route='ports'\]\s+\.headerFrontPanelPortRailLine\[data-port-rail-route='banana'\]/s)
    expect(rackViewCss).toMatch(/\.headerFrontPanel\[data-port-rail-route='banana'\]\s+\.headerFrontPanelPortRailLine\[data-port-rail-route='ports'\][^{]*\{[^}]*display:\s*none;/s)
    expect(rackViewCss).toMatch(/\.headerFrontPanel\[data-role='DISABLED'\]\s+\.headerFrontPanelPortRailLine\s*\{[^}]*display:\s*none;/s)
    expect(rackViewCss).toMatch(/\.headerFrontPanel\[data-port-rail-direction='port-1-to-port-2'\]\s+\.headerFrontPanelPortRailLine[^{]*\{[^}]*animation:\s*headerFrontPanelPortRailFlow 1\.4s linear infinite;/s)
    expect(rackViewCss).toMatch(/\.headerFrontPanel\[data-port-rail-direction='port-1-to-port-2'\]\s+\.headerFrontPanelPortRailLine[^{]*\{[^}]*stroke:\s*color-mix\(in srgb, var\(--color-status-success\) 74%, var\(--color-border-divider\)\);/s)
    expect(rackViewCss).toMatch(/\.headerFrontPanel\[data-port-rail-direction='port-1-to-banana'\]\s+\.headerFrontPanelPortRailLine/s)
    expect(rackViewCss).toMatch(/\.headerFrontPanel\[data-port-rail-direction='port-2-to-port-1'\]\s+\.headerFrontPanelPortRailLine,/s)
    expect(rackViewCss).toMatch(/\.headerFrontPanel\[data-port-rail-direction='banana-to-port-1'\]\s+\.headerFrontPanelPortRailLine\s*\{[^}]*animation-direction:\s*reverse;/s)
    expect(rackViewCss).toMatch(/@keyframes\s+headerFrontPanelPortRailFlow\s*\{[^}]*stroke-dashoffset:\s*-8;/s)
    expect(rackViewCss).toMatch(/\.headerFrontPanelPortRailLine\s*\{[^}]*animation:\s*none;/s)
    expect(rackViewCss).not.toContain('headerFrontPanelFlowRail')
    expect(rackViewCss).not.toContain('headerFrontPanelFlowPath')
    expect(rackViewCss).not.toContain('headerFrontPanelCurrentFlow')
    expect(rackViewCss).not.toContain('data-flow-direction')
  })

  it('shows context-menu cursor over header context menu targets', () => {
    expect(rackViewCss).toMatch(/\.headerVbusProtection\s*\{[^}]*cursor:\s*context-menu;/s)
    expect(rackViewCss).toMatch(/\.headerVbusAccumulatorPanel\s*\{[^}]*cursor:\s*context-menu;/s)
    expect(rackViewCss).toMatch(/\.menuBarDeviceStatusContextTarget\s*\{[^}]*cursor:\s*context-menu;/s)
  })
})
