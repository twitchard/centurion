import { describe, expect, it, vi } from 'vitest'
import type { NewSavedDrawing } from '../core/ink/drawing-log'
import { FirebaseDrawingLogAdapter } from './firebase-drawing-log'

const ENTRY: NewSavedDrawing = {
  author: 'owner',
  strokes: [
    [
      { x: 1, y: 2 },
      { x: 1, y: 4 },
    ],
  ],
  recognized: ['arrow'],
  readings: ['Arrow b2 → b4'],
  build: 'abc1234',
}

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 401 })
}

describe('FirebaseDrawingLogAdapter', () => {
  it('POSTs a drawing and returns the push key', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ name: '-Nabc' }),
      ) as unknown as typeof globalThis.fetch
    const adapter = new FirebaseDrawingLogAdapter(
      'https://db.example.com',
      fetchImpl,
    )
    await expect(adapter.save(ENTRY)).resolves.toBe('-Nabc')
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(url).toBe(
      'https://db.example.com/__trystero__/centurion-drawings.json',
    )
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body).toMatchObject({
      author: 'owner',
      recognized: ['arrow'],
      corrected: false,
      at: { '.sv': 'timestamp' },
    })
    expect(body).not.toHaveProperty('expect')
  })

  it('PATCHes expect and the corrected flag', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({})) as unknown as typeof globalThis.fetch
    const adapter = new FirebaseDrawingLogAdapter(
      'https://db.example.com',
      fetchImpl,
    )
    await expect(adapter.correct('-Nabc', ['circle'])).resolves.toBe(true)
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(url).toBe(
      'https://db.example.com/__trystero__/centurion-drawings/-Nabc.json',
    )
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({
      expect: ['circle'],
      corrected: true,
    })
  })

  it('does nothing when the database is disabled', async () => {
    const fetchImpl = vi.fn() as unknown as typeof globalThis.fetch
    const adapter = new FirebaseDrawingLogAdapter('', fetchImpl)
    expect(adapter.enabled).toBe(false)
    await expect(adapter.save(ENTRY)).resolves.toBeNull()
    await expect(adapter.correct('-Nabc', ['arrow'])).resolves.toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns null when the write is rejected', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: 'Permission denied' }, false),
      ) as unknown as typeof globalThis.fetch
    const adapter = new FirebaseDrawingLogAdapter(
      'https://db.example.com',
      fetchImpl,
    )
    await expect(adapter.save(ENTRY)).resolves.toBeNull()
  })
})
