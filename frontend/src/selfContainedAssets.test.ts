import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readSource = (relativePath: string): string =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')

describe('self-contained frontend assets', () => {
  it('loads Inter locally without external stylesheet or script references', () => {
    const entrypoint = readSource('./main.tsx')
    const styles = readSource('./index.css')
    const html = readSource('../index.html')

    expect(entrypoint).toContain("import '@fontsource/inter/400.css'")
    expect(entrypoint).toContain("import '@fontsource/inter/600.css'")
    expect(styles).not.toMatch(/@import\s+url\(\s*['"]?https?:\/\//i)
    expect(html).not.toMatch(
      /<(?:link|script)\b[^>]*(?:href|src)=['"]https?:\/\//i,
    )
  })
})
