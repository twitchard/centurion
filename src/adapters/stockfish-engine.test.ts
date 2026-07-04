import { describe, expect, it } from 'vitest'
import {
  parseBestMoveLine,
  parseMultiPvLine,
  planSearches,
} from './stockfish-engine'

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

describe('parseMultiPvLine', () => {
  it('extracts rank, root move, and centipawns from a ranked info line', () => {
    expect(
      parseMultiPvLine(
        'info depth 5 seldepth 7 multipv 3 score cp -42 nodes 999 nps 9000 time 12 pv g1h3 d7d5 b1c3',
      ),
    ).toEqual({ rank: 3, move: 'g1h3', cp: -42 })
  })

  it('maps mate scores near the mate ceiling', () => {
    expect(
      parseMultiPvLine('info depth 2 multipv 1 score mate 2 pv a1a8 g8h7'),
    ).toEqual({ rank: 1, move: 'a1a8', cp: 99_998 })
    expect(
      parseMultiPvLine('info depth 2 multipv 17 score mate -1 pv f2f3 e7e5'),
    ).toEqual({ rank: 17, move: 'f2f3', cp: -99_999 })
  })

  it('does not mistake "multipv" itself for the pv keyword', () => {
    expect(
      parseMultiPvLine('info depth 5 multipv 12 score cp 0 pv a2a3'),
    ).toEqual({ rank: 12, move: 'a2a3', cp: 0 })
  })

  it('ignores unranked engine output', () => {
    expect(
      parseMultiPvLine('info depth 5 currmove e2e4 currmovenumber 1'),
    ).toBeNull()
    expect(parseMultiPvLine('info depth 5 score cp 30 pv e2e4')).toBeNull()
    expect(parseMultiPvLine('bestmove e2e4')).toBeNull()
  })
})
