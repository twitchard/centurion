import { describe, expect, it } from 'vitest'
import { initMatch } from '../../core/match/model'
import type { MatchSession } from './model'
import {
  CENTURION_PERSISTENCE_VERSION,
  decodePersistedCenturion,
  encodeCenturionForPersistence,
  encodeSessionForPersistence,
} from './persistence'

describe('centurion persistence', () => {
  it('round-trips a solo playing session', () => {
    const match = initMatch(99, { gameCount: 2 })
    const session: MatchSession = {
      mode: { tag: 'solo' },
      match,
      resolving: null,
      commandInput: 'all knights advance',
      draft: { tag: 'idle' },
      inputError: null,
      notice: null,
      gameReplay: null,
    }
    const encoded = encodeCenturionForPersistence({ tag: 'playing', session })
    if (encoded === null || encoded.tag !== 'playing') {
      throw new Error('expected playing persistence')
    }
    expect(encoded.session.commandInput).toBe('all knights advance')
    const decoded = decodePersistedCenturion(encoded)
    expect(decoded).toEqual(encoded)
    expect(decoded?.v).toBe(CENTURION_PERSISTENCE_VERSION)
  })

  it('skips sessions while the soldiers are resolving', () => {
    const match = initMatch(1, { gameCount: 1 })
    const session: MatchSession = {
      mode: { tag: 'solo' },
      match,
      resolving: {
        base: match,
        command: null,
        pending: [{ gameId: 0, fen: 'x' }],
      },
      commandInput: '',
      draft: { tag: 'idle' },
      inputError: null,
      notice: null,
      gameReplay: null,
    }
    expect(encodeSessionForPersistence(session)).toBeNull()
    expect(
      encodeCenturionForPersistence({ tag: 'playing', session }),
    ).toBeNull()
  })

  it('rejects persisted entries from older versions', () => {
    expect(
      decodePersistedCenturion({
        v: 1,
        tag: 'waiting',
        code: '123456',
        pendingSeed: 7,
      }),
    ).toBeNull()
  })

  it('encodes a waiting room with pending seed', () => {
    const encoded = encodeCenturionForPersistence({
      tag: 'waiting',
      code: '123456',
      seed: 77,
      notice: null,
    })
    expect(encoded).toEqual({
      v: CENTURION_PERSISTENCE_VERSION,
      tag: 'waiting',
      code: '123456',
      pendingSeed: 77,
    })
    expect(decodePersistedCenturion(encoded)).toEqual(encoded)
  })
})
