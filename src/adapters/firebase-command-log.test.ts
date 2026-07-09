import { describe, expect, it, vi } from 'vitest'
import type { NewCommandLogEntry } from '../core/command-log/model'
import { FirebaseCommandLogAdapter } from './firebase-command-log'

const ENTRY: NewCommandLogEntry = {
  text: 'develop a knight',
  source: 'solo',
  outcome: {
    tag: 'compiled',
    predicate: { tag: 'piece', roles: ['knight'] },
    reading: 'a move by a knight',
  },
  match: { turn: 1, matches: { matchedGames: 1, activeGames: 1 } },
  build: 'test-build',
}

function okFetch(): typeof globalThis.fetch {
  return vi
    .fn()
    .mockResolvedValue(new Response('{}')) as unknown as typeof globalThis.fetch
}

describe('FirebaseCommandLogAdapter', () => {
  it('POSTs the encoded entry to the log node', () => {
    const fetchImpl = okFetch()
    const adapter = new FirebaseCommandLogAdapter(
      'https://db.example.com',
      fetchImpl,
    )
    adapter.record(ENTRY)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(url).toBe(
      'https://db.example.com/__trystero__/centurion-command-log.json',
    )
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body).toMatchObject({
      text: 'develop a knight',
      source: 'solo',
      status: 'compiled',
      reading: 'a move by a knight',
      turn: 1,
      matchedGames: 1,
      activeGames: 1,
      at: { '.sv': 'timestamp' },
    })
  })

  it('does nothing when the database is disabled', () => {
    const fetchImpl = okFetch()
    // An empty/blank URL is how a disabled database reaches the
    // constructor (explicit undefined would re-trigger the env default).
    const adapter = new FirebaseCommandLogAdapter('', fetchImpl)
    adapter.record(ENTRY)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('swallows network failures', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(
        new Error('offline'),
      ) as unknown as typeof globalThis.fetch
    const adapter = new FirebaseCommandLogAdapter(
      'https://db.example.com',
      fetchImpl,
    )
    expect(() => {
      adapter.record(ENTRY)
    }).not.toThrow()
    // Let the rejected promise settle; an unhandled rejection would fail
    // the test run.
    await vi.waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    })
  })

  it('swallows a synchronously throwing fetch', () => {
    const fetchImpl = vi.fn(() => {
      throw new Error('no network stack')
    }) as unknown as typeof globalThis.fetch
    const adapter = new FirebaseCommandLogAdapter(
      'https://db.example.com',
      fetchImpl,
    )
    expect(() => {
      adapter.record(ENTRY)
    }).not.toThrow()
  })
})
