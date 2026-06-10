import { describe, expect, it } from 'vitest'
import { parseBestMoveLine, planSearches } from './stockfish-engine'

describe('planSearches', () => {
  it('collapses duplicate positions into one search each', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    const other = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'
    const plan = planSearches([start, start, other, start, other])
    expect(plan.unique).toEqual([start, other])
    expect(plan.indices).toEqual([0, 0, 1, 0, 1])
  })

  it('handles the all-identical opening case with a single search', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    const plan = planSearches(Array.from({ length: 100 }, () => start))
    expect(plan.unique).toEqual([start])
    expect(plan.indices).toHaveLength(100)
  })

  it('keeps positions distinct when only the clocks differ', () => {
    // Stockfish's evaluation can depend on the halfmove clock (fifty-move
    // rule), so dedup must use the full FEN.
    const a = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'
    const b = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 40 1'
    const plan = planSearches([a, b])
    expect(plan.unique).toEqual([a, b])
  })

  it('handles an empty batch', () => {
    expect(planSearches([])).toEqual({ unique: [], indices: [] })
  })
})

describe('parseBestMoveLine', () => {
  it('extracts the move from a bestmove line', () => {
    expect(parseBestMoveLine('bestmove e2e4 ponder e7e5')).toBe('e2e4')
    expect(parseBestMoveLine('bestmove a7a8q')).toBe('a7a8q')
  })

  it('ignores other engine output', () => {
    expect(parseBestMoveLine('info depth 5 score cp 30')).toBeNull()
    expect(parseBestMoveLine('uciok')).toBeNull()
  })

  it('rejects the no-move marker', () => {
    expect(parseBestMoveLine('bestmove (none)')).toBeNull()
  })
})
