import { describe, expect, it } from 'vitest'
import {
  MICRO_PAWN_EVEN_THRESHOLD_CP,
  aggregateMicroPawnStats,
  evalForPlayer,
  evalFromWhiteAfterMove,
  formatMicroPawns,
  microPawnSummaryText,
} from './eval'
import { MATE_CP, initMatch } from './model'

describe('evalFromWhiteAfterMove', () => {
  it('keeps white mover scores as white perspective', () => {
    expect(evalFromWhiteAfterMove(true, 35)).toBe(35)
  })

  it('negates black mover scores into white perspective', () => {
    expect(evalFromWhiteAfterMove(false, 35)).toBe(-35)
  })
})

describe('evalForPlayer', () => {
  it('returns white eval for the white owner', () => {
    const match = initMatch(1, { gameCount: 1, whitePlayer: 1 })
    const game = { ...match.games[0]!, evalCp: 42 }
    expect(evalForPlayer(game, 1)).toBe(42)
    expect(evalForPlayer(game, 2)).toBe(-42)
  })
})

describe('aggregateMicroPawnStats', () => {
  it('averages and buckets active games from the viewer perspective', () => {
    const match = initMatch(1, { gameCount: 4, whitePlayer: 1 })
    const games = match.games.map((game, index) => {
      const evalCp = [80, 10, -10, -80][index] ?? 0
      return { ...game, evalCp }
    })
    const stats = aggregateMicroPawnStats({ ...match, games }, 1)
    expect(stats.activeGames).toBe(4)
    expect(stats.ahead).toBe(1)
    expect(stats.even).toBe(2)
    expect(stats.behind).toBe(1)
    expect(stats.averageCp).toBe(0)
  })

  it('ignores finished games', () => {
    const match = initMatch(1, { gameCount: 2, whitePlayer: 1 })
    const [first, second] = match.games
    if (first === undefined || second === undefined) {
      throw new Error('expected two games')
    }
    const games = [
      {
        ...first,
        evalCp: 200,
        status: { tag: 'won' as const, by: 1 as const },
      },
      { ...second, evalCp: -200 },
    ]
    const stats = aggregateMicroPawnStats({ ...match, games }, 1)
    expect(stats.activeGames).toBe(1)
    expect(stats.averageCp).toBe(-200)
    expect(stats.behind).toBe(1)
  })
})

describe('formatMicroPawns', () => {
  it('formats centipawns as signed pawn fractions', () => {
    expect(formatMicroPawns(35)).toBe('+0.35')
    expect(formatMicroPawns(-120)).toBe('−1.20')
    expect(formatMicroPawns(0)).toBe('0.00')
  })

  it('uses mate glyphs for extreme scores', () => {
    expect(formatMicroPawns(MATE_CP)).toBe('#')
    expect(formatMicroPawns(-MATE_CP)).toBe('−#')
  })
})

describe('microPawnSummaryText', () => {
  it('summarises active games for the viewer', () => {
    const match = initMatch(1, { gameCount: 3, whitePlayer: 1 })
    const games = match.games.map((game, index) => ({
      ...game,
      evalCp: index === 0 ? MICRO_PAWN_EVEN_THRESHOLD_CP + 1 : 0,
    }))
    expect(microPawnSummaryText({ ...match, games }, 1)).toBe(
      '+0.09 pawn avg · 1↑ 2= 0↓',
    )
  })
})
