/**
 * Takes screenshots of the app pages using Playwright.
 *
 * Usage:
 *   bun run screenshot
 *
 * Expects the Vite dev server to be running on http://localhost:5173.
 * If it is not, start it first: bun run dev:cloud
 *
 * Screenshots are written to screenshots/
 */

import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const BASE_URL = process.env['VITE_URL'] ?? 'http://localhost:5173'
const OUT_DIR = 'screenshots'

async function waitForServer(url: string, maxMs = 15_000): Promise<void> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) {
        return
      }
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Server at ${url} did not become ready within ${maxMs}ms`)
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true })

  console.log(`Waiting for dev server at ${BASE_URL}...`)
  await waitForServer(BASE_URL)
  console.log('Server ready.')

  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1280, height: 800 })

  const pages: { name: string; path: string; setup?: () => Promise<void> }[] = [
    { name: 'menu', path: '/labs' },
    {
      name: 'superposition-lab',
      path: '/labs',
      setup: async () => {
        await page.click('button:has-text("Superposition Board Lab")')
        await page.waitForTimeout(800)
      },
    },
    { name: 'board-standalone', path: '/board.html' },
    { name: 'centurion-lobby', path: '/' },
    {
      name: 'centurion-match',
      path: '/',
      setup: async () => {
        await page.click('#centurion-pass-and-play-btn')
        await page.waitForTimeout(500)
        // The arrow input lives inside a collapsed <details>.
        await page.click('.centurion-type-move summary')
        await page.fill('#centurion-arrow-input', 'e2->e4')
        await page.press('#centurion-arrow-input', 'Enter')
        await page.waitForTimeout(800)
      },
    },
  ]

  for (const { name, path, setup } of pages) {
    await page.goto(`${BASE_URL}${path}`)
    await page.waitForLoadState('networkidle')
    if (setup) {
      await setup()
    }
    const file = `${OUT_DIR}/${name}.png`
    await page.screenshot({ path: file, fullPage: false })
    console.log(`Saved ${file}`)
  }

  await browser.close()
  console.log('Done.')
}

await main()
