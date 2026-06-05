import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const appCss = readFileSync(join(process.cwd(), 'src/App.css'), 'utf8')
const indexCss = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')

describe('app shell responsive CSS', () => {
  it('keeps the browser app from shrinking below the minimum layout width', () => {
    expect(indexCss).toContain('--app-min-width: 800px;')
    expect(indexCss).toMatch(/body\s*\{[^}]*min-width:\s*var\(--app-min-width\);/s)
    expect(indexCss).toMatch(/#root\s*\{[^}]*min-width:\s*var\(--app-min-width\);/s)
    expect(appCss).toMatch(/\.appViewport\s*\{[^}]*min-width:\s*var\(--app-min-width\);/s)
  })

  it('allows horizontal browser scrolling below the minimum layout width', () => {
    expect(indexCss).toMatch(/body\s*\{[^}]*overflow-x:\s*auto;/s)
    expect(indexCss).toMatch(/body\s*\{[^}]*overflow-y:\s*hidden;/s)
  })
})
