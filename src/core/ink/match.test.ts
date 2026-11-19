import { describe, expect, it } from 'vitest'
import { MATE_THRESHOLD_CP } from '../match/model'
import type { RankedMove } from '../match/resolve'
import type { InkMark } from './gesture'
import {
  INK_GAME_COUNT,
  applyInkPly,
  countTemperaments,
  initInkMatch,
  inkMatchPhase,
  inkMover,
  inkSearchTargets,
} from './match'

const OPENING: readonly RankedMove[] = [
  { uci: 'e2e4', cp: 30 },
  { uci: 'd2d4', cp: 24 },
  { uci: 'g1f3', cp: 18 },
  { uci: 'c2c4', cp: 12 },
  { uci: 'b1c3', cp: 6 },
  { uci: 'a2a3', cp: 0 },
  { uci: 'h2h3', cp: -8 },
  { uci: 'a2a4', cp: -16 },
  { uci: 'h2h4', cp: -24 },
  { uci: 'g2g4', cp: -40 },
  { uci: 'f2f3', cp: -50 },
]

describe('ink match', () => {
  it('starts every game together from the standard position', () => {
    const match = initInkMatch(4)
    expect(match.gameCount).toBe(INK_GAME_COUNT)
    expect(match.games).toHaveLength(INK_GAME_COUNT)
    expect(match.turn).toBe(1)
    expect(inkMover(match)).toBe('player')
    const fen = match.games[0]?.startingFen
    expect(match.games.every((game) => game.status.tag === 'active')).toBe(true)
    expect(match.games.every((game) => game.startingFen === fen)).toBe(true)
    expect(match.games.every((game) => game.position.turn === 'white')).toBe(
      true,
    )
    expect(countTemperaments(match.games, 'player')).toEqual({
      strong: 25,
      weak: 25,
      steady: 25,
      swingy: 25,
    })
    expect(countTemperaments(match.games, 'computer')).toEqual({
      strong: 25,
      weak: 25,
      steady: 25,
      swingy: 25,
    })
  })

  it('deals the computer a stronger deck on hard', () => {
    const match = initInkMatch(9, { difficulty: 'hard', gameCount: 100 })
    expect(countTemperaments(match.games, 'computer')).toEqual({
      strong: 50,
      weak: 0,
      steady: 25,
      swingy: 25,
    })
    expect(countTemperaments(match.games, 'player').weak).toBe(25)
  })

  it('plays one ply in every active game and keeps the draw inside the top ten', () => {
    const match = initInkMatch(1, {
      gameCount: 4,
      playerTemperaments: ['strong', 'weak', 'steady', 'swingy'],
      computerTemperaments: ['strong', 'weak', 'steady', 'swingy'],
    })
    const targets = inkSearchTargets(match)
    const ranked = targets.gameIds.map(() => OPENING)
    const next = applyInkPly(match, targets.gameIds, ranked, [])
    if (next === null) {
      throw new Error('ply failed')
    }
    expect(next.turn).toBe(2)
    expect(inkMover(next)).toBe('computer')
    expect(next.lastPly?.moved).toBe(4)
    expect(next.lastPly?.shifted).toBe(0)
    expect(next.inkValueCp).toBeCloseTo(0, 8)
    const allowed = new Set(OPENING.slice(0, 10).map((move) => move.uci))
    for (const game of next.games) {
      expect(game.moves).toHaveLength(1)
      expect(allowed.has(game.moves[0]?.uci ?? '')).toBe(true)
      expect(game.position.turn).toBe('black')
    }
  })

  it('adds expected value when the player circles a better square', () => {
    const match = initInkMatch(2, {
      gameCount: 4,
      playerTemperaments: ['weak', 'weak', 'steady', 'swingy'],
      computerTemperaments: ['strong', 'strong', 'strong', 'strong'],
    })
    const circle: InkMark = {
      tag: 'circle',
      outline: Array.from({ length: 24 }, (_, index) => {
        const angle = (index / 24) * Math.PI * 2
        return {
          x: 4.5 + Math.cos(angle) * 0.6,
          y: 3.5 + Math.sin(angle) * 0.6,
        }
      }),
    }
    const targets = inkSearchTargets(match)
    const ranked = targets.gameIds.map(() => OPENING)
    const next = applyInkPly(match, targets.gameIds, ranked, [circle])
    if (next === null) {
      throw new Error('ply failed')
    }
    expect(next.inkValueCp).toBeGreaterThan(0)
    expect(next.lastInkCp).toBeGreaterThan(0)
  })

  it('plays a forced mate instead of the temperament', () => {
    const match = initInkMatch(3, {
      gameCount: 1,
      fens: ['k7/8/1K6/8/8/8/8/7R w - - 0 1'],
      playerTemperaments: ['weak'],
      computerTemperaments: ['weak'],
    })
    const targets = inkSearchTargets(match)
    const ranked: readonly RankedMove[][] = [
      [
        { uci: 'h1h8', cp: MATE_THRESHOLD_CP + 10 },
        { uci: 'h1h7', cp: 20 },
        { uci: 'b6a6', cp: 0 },
      ],
    ]
    const next = applyInkPly(match, targets.gameIds, ranked, [])
    if (next === null) {
      throw new Error('ply failed')
    }
    expect(next.games[0]?.moves[0]?.uci).toBe('h1h8')
    expect(next.games[0]?.status).toEqual({ tag: 'won', by: 1 })
    expect(next.scores.p1).toBe(1)
    expect(next.phase).toEqual({ tag: 'finished', winner: 1 })
  })

  it('ends when the lead is unreachable, and draws a level match', () => {
    expect(
      inkMatchPhase(
        [{ status: { tag: 'active' } }, { status: { tag: 'active' } }],
        { p1: 3, p2: 0 },
      ),
    ).toEqual({ tag: 'finished', winner: 1 })
    expect(
      inkMatchPhase(
        [{ status: { tag: 'active' } }, { status: { tag: 'active' } }],
        { p1: 2, p2: 0 },
      ),
    ).toEqual({ tag: 'active' })
    expect(
      inkMatchPhase(
        [
          { status: { tag: 'drawn', reason: 'stalemate' } },
          { status: { tag: 'drawn', reason: 'stalemate' } },
        ],
        { p1: 0, p2: 0 },
      ),
    ).toEqual({ tag: 'finished', winner: 'draw' })
  })
})
