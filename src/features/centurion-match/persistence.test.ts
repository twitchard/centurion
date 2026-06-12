import { describe, expect, it } from 'vitest'
import { initMatch } from '../../core/match/model'
import {
  CENTURION_PERSISTENCE_VERSION,
  decodePersistedCenturion,
  encodeCenturionForPersistence,
  encodeSessionForPersistence,
} from './persistence'

describe('centurion persistence', () => {
  it('round-trips a solo playing session', () => {
    const match = initMatch(99, { gameCount: 2 })
    const session = {
      mode: { tag: 'solo' as const },
      match,
      resolving: null,
      trap: null,
      selectedSquare: null,
      arrowInput: '',
      inputError: null,
      notice: null,
      gameReplay: null,
    }
    const encoded = encodeCenturionForPersistence({ tag: 'playing', session })
    if (encoded === null || encoded.tag !== 'playing') {
      throw new Error('expected playing persistence')
    }
    const decoded = decodePersistedCenturion(encoded)
    expect(decoded).toEqual(encoded)
    expect(decoded?.v).toBe(CENTURION_PERSISTENCE_VERSION)
  })

  it('skips sessions while Stockfish is resolving', () => {
    const match = initMatch(1, { gameCount: 1 })
    const session = {
      mode: { tag: 'solo' as const },
      match,
      resolving: {
        base: match,
        arrows: [],
        games: [...match.games],
        rng: match.rng,
        arrowMoves: 0,
        pending: [{ gameId: 0, fen: 'x' }],
      },
      trap: null,
      selectedSquare: null,
      arrowInput: '',
      inputError: null,
      notice: null,
      gameReplay: null,
    }
    expect(encodeSessionForPersistence(session)).toBeNull()
    expect(
      encodeCenturionForPersistence({ tag: 'playing', session }),
    ).toBeNull()
  })

  it('skips sessions while the Centurion is placing a trap arrow', () => {
    const match = initMatch(1, { gameCount: 1 })
    const session = {
      mode: { tag: 'solo' as const },
      match,
      resolving: null,
      trap: { gameIds: [0] },
      selectedSquare: null,
      arrowInput: '',
      inputError: null,
      notice: null,
      gameReplay: null,
    }
    expect(encodeSessionForPersistence(session)).toBeNull()
  })

  it('encodes a waiting room with pending seed', () => {
    const encoded = encodeCenturionForPersistence({
      tag: 'waiting',
      code: '123456',
      pendingSeed: 77,
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
