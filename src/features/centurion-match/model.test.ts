import { describe, expect, it } from 'vitest'
import { initMatch } from '../../core/match/model'
import { type MatchSession, sessionViewer } from './model'

function session(
  mode: MatchSession['mode'],
  match = initMatch(1, { gameCount: 1, whitePlayer: 1, firstPlacer: 1 }),
): MatchSession {
  return {
    mode,
    match,
    resolving: null,
    commandInput: '',
    draft: { tag: 'idle' },
    inputError: null,
    notice: null,
    gameReplay: null,
  }
}

describe('sessionViewer', () => {
  it('keeps remote clients on their seat', () => {
    expect(
      sessionViewer(
        session({ tag: 'remote', you: 2, code: '123456', peerConnected: true }),
      ),
    ).toBe(2)
  })

  it('keeps solo on player 1', () => {
    expect(sessionViewer(session({ tag: 'solo' }))).toBe(1)
  })

  it('follows the active commander in pass-and-play', () => {
    const turn1 = session({ tag: 'local' })
    expect(sessionViewer(turn1)).toBe(1)

    const turn2 = {
      ...turn1,
      match: { ...turn1.match, turn: 2 },
    }
    expect(sessionViewer(turn2)).toBe(2)
  })
})
