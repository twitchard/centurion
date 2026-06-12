import { parseSquare } from 'chessops/util'
import { describe, expect, it } from 'vitest'
import { initMatch } from './model'
import { chooseTrapArrow, trapTargets } from './trap'

function sq(name: string): number {
  const square = parseSquare(name)
  if (square === undefined) {
    throw new Error(`Bad square: ${name}`)
  }
  return square
}

describe('trapTargets', () => {
  it('lists only active games, ids aligned with fens', () => {
    const match = initMatch(7, { gameCount: 3, whitePlayer: 1 })
    const games = [...match.games]
    const decided = games[1]
    if (decided === undefined) {
      throw new Error('expected three games')
    }
    games[1] = { ...decided, status: { tag: 'won', by: 1 } }
    const targets = trapTargets({ ...match, games })
    expect(targets.gameIds).toEqual([0, 2])
    expect(targets.fens).toHaveLength(2)
    expect(targets.fens[0]).toContain('w KQkq')
  })
})

describe('chooseTrapArrow', () => {
  function gamesFor(count: number, whitePlayer: 1 | 2) {
    return initMatch(3, { gameCount: count, whitePlayer }).games
  }

  it('picks the plurality worst move', () => {
    const games = gamesFor(3, 1)
    const arrow = chooseTrapArrow(games, ['e2e4', 'g1f3', 'e2e4'])
    expect(arrow).toEqual({ from: sq('e2'), to: sq('e4') })
  })

  it('rank-flips moves when player 1 owns black', () => {
    const games = gamesFor(1, 2)
    // In games owned by player 2 as white, board coordinates are
    // flipped back into the canonical (player 1) frame.
    const arrow = chooseTrapArrow(games, ['e2e4'])
    expect(arrow).toEqual({ from: sq('e7'), to: sq('e5') })
  })

  it('breaks count ties toward the lowest square pair', () => {
    const games = gamesFor(2, 1)
    expect(chooseTrapArrow(games, ['b2b3', 'a2a3'])).toEqual({
      from: sq('a2'),
      to: sq('a3'),
    })
    expect(chooseTrapArrow(games, ['a2a3', 'b2b3'])).toEqual({
      from: sq('a2'),
      to: sq('a3'),
    })
  })

  it('ignores malformed moves and keeps only the square pair of promotions', () => {
    const games = gamesFor(3, 1)
    const arrow = chooseTrapArrow(games, ['nonsense', 'a7a8n', 'a7a8q'])
    expect(arrow).toEqual({ from: sq('a7'), to: sq('a8') })
  })

  it('returns null when nothing translates', () => {
    const games = gamesFor(1, 1)
    expect(chooseTrapArrow(games, ['nonsense'])).toBeNull()
    expect(chooseTrapArrow([], [])).toBeNull()
  })
})
