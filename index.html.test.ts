import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('index shell', () => {
  it('loads the app entry from a relative path', () => {
    const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8')
    expect(html).toContain('src="./src/main.ts"')
  })
})
