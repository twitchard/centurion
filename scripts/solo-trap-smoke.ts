/**
 * End-to-end smoke test for the solo-mode Centurion trap arrow, driven
 * against the real Stockfish WASM engine in headless Chromium.
 *
 * Expects the Vite dev server on http://localhost:5173 (bun run dev:cloud).
 */
import { chromium } from '@playwright/test'

const BASE_URL = process.env['VITE_URL'] ?? 'http://localhost:5173'

async function main(): Promise<void> {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log(`[browser error] ${msg.text()}`)
    }
  })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(BASE_URL)

  await page.click('#centurion-solo-btn')
  console.log('Solo match started; tapping e2 then e4...')

  // The board is tap-only: convert squares to canvas positions (white
  // at the bottom for the solo player).
  const canvas = page.locator('#centurion-canvas')
  const box = await canvas.boundingBox()
  if (box === null) {
    throw new Error('Centurion canvas not visible')
  }
  const cell = box.width / 8
  const tap = async (file: number, rank: number) => {
    await canvas.click({
      position: { x: (file + 0.5) * cell, y: (8 - rank + 0.5) * cell },
    })
  }
  await tap(4, 2) // e2
  await tap(4, 4) // e4

  // Walk through the phases: white ply resolves, black ply resolves,
  // the Centurion computes its trap, then turn 3 is the player's.
  const meta = page.locator('#centurion-meta-line')
  const deadline = Date.now() + 120_000
  let sawTrapPhase = false
  for (;;) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for turn 3')
    }
    const text = (await meta.textContent()) ?? ''
    if (text.includes('laying a trap')) {
      sawTrapPhase = true
    }
    if (text.includes('Turn 3')) {
      break
    }
    await page.waitForTimeout(100)
  }
  console.log(`Trap-computation phase observed in meta line: ${sawTrapPhase}`)

  const notice =
    (await page.locator('#centurion-session-notice').textContent()) ?? ''
  if (notice.includes('Engine error')) {
    throw new Error(`Engine error surfaced: ${notice}`)
  }

  await page.screenshot({ path: 'screenshots/solo-trap.png' })
  console.log('Screenshot written to screenshots/solo-trap.png')
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
