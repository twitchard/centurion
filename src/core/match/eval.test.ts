import { describe, expect, it } from 'vitest'
import {
  MICRO_PAWN_HISTOGRAM_BIN_CP,
  aggregateMicroPawnStats,
  evalForPlayer,
  evalFromWhiteAfterMove,
  formatMicroPawns,
  microPawnHistogram,
  microPawnHistogramLabel,
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
  it('averages active games from the viewer perspective', () => {
    const match = initMatch(1, { gameCount: 4, whitePlayer: 1 })
    const games = match.games.map((game, index) => {
      const evalCp = [80, 10, -10, -80][index] ?? 0
      return { ...game, evalCp }
    })
    const stats = aggregateMicroPawnStats({ ...match, games }, 1)
    expect(stats.activeGames).toBe(4)
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
  })
})

describe('microPawnHistogram', () => {
  it('bins games symmetrically around even', () => {
    const match = initMatch(1, { gameCount: 4, whitePlayer: 1 })
    const games = match.games.map((game, index) => {
      const evalCp = [120, 20, -20, -120][index] ?? 0
      return { ...game, evalCp }
    })
    expect(microPawnHistogram({ ...match, games }, 1)).toEqual([
      0, 1, 0, 2, 0, 1, 0,
    ])
  })

  it('clamps mate scores into the outer bins', () => {
    const match = initMatch(1, { gameCount: 2, whitePlayer: 1 })
    const games = match.games.map((game, index) => ({
      ...game,
      evalCp: index === 0 ? MATE_CP : -MATE_CP,
    }))
    const bins = microPawnHistogram({ ...match, games }, 1)
    expect(bins[0]).toBe(1)
    expect(bins[bins.length - 1]).toBe(1)
    expect(bins.reduce((total, count) => total + count, 0)).toBe(2)
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

describe('microPawnHistogramLabel', () => {
  it('describes the average and bucket counts for screen readers', () => {
    const match = initMatch(1, { gameCount: 3, whitePlayer: 1 })
    const games = match.games.map((game, index) => ({
      ...game,
      evalCp: index === 0 ? MICRO_PAWN_HISTOGRAM_BIN_CP + 5 : 0,
    }))
    expect(microPawnHistogramLabel({ ...match, games }, 1)).toBe(
      'Average position +0.18 pawns across 3 games; 1 ahead, 2 even, 0 behind',
    )
  })
})
