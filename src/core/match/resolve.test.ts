import { Chess } from 'chessops/chess'
import { makeFen, parseFen } from 'chessops/fen'
import { makeUci, parseSquare, squareRank } from 'chessops/util'
import { describe, expect, it } from 'vitest'
import {
  type Arrow,
  type MatchState,
  activeGameCount,
  activePlacer,
  arrowPullWeight,
  canPlaceArrows,
  initMatch,
  sideToMove,
} from './model'
import {
  type PendingResolution,
  arrowMoveForGame,
  beginAutoResolution,
  beginResolution,
  completeResolution,
  flipSquare,
} from './resolve'

function sq(name: string): number {
  const square = parseSquare(name)
  if (square === undefined) {
    throw new Error(`Bad square: ${name}`)
  }
  return square
}

/** Stand-in for Stockfish in tests: the first legal move per position. */
function firstLegalUci(fen: string): string {
  const position = Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
  for (const [from, dests] of position.allDests()) {
    for (const to of dests) {
      const isPawn = position.board.getRole(from) === 'pawn'
      const toRank = squareRank(to)
      if (isPawn && (toRank === 0 || toRank === 7)) {
        return makeUci({ from, to, promotion: 'queen' })
      }
      return makeUci({ from, to })
    }
  }
  throw new Error(`No legal move in ${fen}`)
}

function engineMovesFor(resolution: PendingResolution): string[] {
  return resolution.pending.map((entry) => firstLegalUci(entry.fen))
}

function resolveTurn(match: MatchState, arrow: Arrow): MatchState {
  const resolution = beginResolution(match, arrow)
  if (resolution === null) {
    throw new Error('match already finished')
  }
  const next = completeResolution(resolution, engineMovesFor(resolution))
  if (next === null) {
    throw new Error('resolution rejected its own engine moves')
  }
  return next
}

function fens(match: MatchState): readonly string[] {
  return match.games.map((game) => makeFen(game.position.toSetup()))
}

describe('initMatch', () => {
  it('assigns one player white and the other black across all games', () => {
    const match = initMatch(42)
    expect(match.games).toHaveLength(100)
    const whiteOwners = new Set(match.games.map((g) => g.whiteOwner))
    expect(whiteOwners.size).toBe(1)
    expect([1, 2]).toContain([...whiteOwners][0])
    expect(match.turn).toBe(1)
    expect(sideToMove(match)).toBe('white')
    expect(match.phase).toEqual({ tag: 'active' })
  })

  it('derives colors and first placer deterministically from the seed', () => {
    const first = initMatch(7)
    const second = initMatch(7)
    expect(first.games[0]?.whiteOwner).toBe(second.games[0]?.whiteOwner)
    expect(first.firstPlacer).toBe(second.firstPlacer)
    expect([1, 2]).toContain(first.firstPlacer)
    expect(activePlacer(first)).toBe(first.firstPlacer)
  })
})

describe('arrowMoveForGame', () => {
  it('interprets arrows literally in games where player 1 is white', () => {
    const match = initMatch(1, { gameCount: 2, whitePlayer: 1 })
    const game = match.games[0]
    if (game === undefined) {
      throw new Error('missing game')
    }
    expect(game.whiteOwner).toBe(1)
    const move = arrowMoveForGame(game, { from: sq('e2'), to: sq('e4') })
    expect(move).toEqual({ from: sq('e2'), to: sq('e4') })
  })

  it('rank-flips arrows in games where player 1 is black', () => {
    const match = initMatch(1, { gameCount: 2, whitePlayer: 2 })
    const game = match.games[0]
    if (game === undefined) {
      throw new Error('missing game')
    }
    expect(game.whiteOwner).toBe(2)
    // White to move; the flipped arrow e2->e4 becomes e7->e5, which is a
    // black move, so it cannot match yet.
    expect(arrowMoveForGame(game, { from: sq('e2'), to: sq('e4') })).toBeNull()
    // But e7->e5 on the visual board flips to the white move e2->e4.
    expect(arrowMoveForGame(game, { from: sq('e7'), to: sq('e5') })).toEqual({
      from: sq('e2'),
      to: sq('e4'),
    })
  })

  it('flipSquare is a rank flip and its own inverse', () => {
    expect(flipSquare(sq('e2'))).toBe(sq('e7'))
    expect(flipSquare(flipSquare(sq('c3')))).toBe(sq('c3'))
  })
})

describe('arrowPullWeight', () => {
  it('halves cardinality each full round until the arrow vanishes', () => {
    expect(arrowPullWeight(8, 1, 1)).toBe(8)
    expect(arrowPullWeight(8, 1, 2)).toBe(8)
    expect(arrowPullWeight(8, 1, 3)).toBe(4)
    expect(arrowPullWeight(8, 1, 4)).toBe(4)
    expect(arrowPullWeight(8, 1, 5)).toBe(2)
    expect(arrowPullWeight(8, 1, 6)).toBe(2)
    expect(arrowPullWeight(8, 1, 7)).toBe(1)
    expect(arrowPullWeight(8, 1, 8)).toBe(1)
    expect(arrowPullWeight(8, 1, 9)).toBe(0)
  })

  it('scales pull weight with stacked cardinality', () => {
    expect(arrowPullWeight(16, 3, 3)).toBe(16)
    expect(arrowPullWeight(16, 3, 4)).toBe(16)
    expect(arrowPullWeight(16, 3, 5)).toBe(8)
  })
})

describe('beginResolution', () => {
  it('pulls up to the decay weight in games on the placement turn', () => {
    const match = initMatch(3, { gameCount: 10 })
    const resolution = beginResolution(match, {
      from: sq('e2'),
      to: sq('e4'),
    })
    if (resolution === null) {
      throw new Error('expected a resolution')
    }
    expect(resolution.arrowMoves).toBeLessThanOrEqual(8)
    expect(resolution.arrowMoves).toBe(8)
    expect(resolution.arrowMoves + resolution.pending.length).toBe(10)
  })

  it('rejects arrow placement after turn 100', () => {
    const match = {
      ...initMatch(3, { gameCount: 2 }),
      turn: 101,
    }
    expect(canPlaceArrows(match)).toBe(false)
    expect(beginResolution(match, { from: sq('e2'), to: sq('e4') })).toBeNull()
  })

  it('keeps decaying arrows active in later turns', () => {
    let match = initMatch(3, { gameCount: 4 })
    match = resolveTurn(match, { from: sq('e2'), to: sq('e4') })
    // Turn 2: black to move. The earlier e2->e4 arrow pulls up to 4 games.
    const resolution = beginResolution(match, {
      from: sq('d7'),
      to: sq('d5'),
    })
    if (resolution === null) {
      throw new Error('expected a resolution')
    }
    expect(resolution.arrowMoves).toBeGreaterThanOrEqual(1)
    expect(resolution.arrows).toHaveLength(2)
  })

  it('removes arrows once their decay weight reaches zero', () => {
    let match = initMatch(3, { gameCount: 4, firstPlacer: 1 })
    match = resolveTurn(match, { from: sq('e2'), to: sq('e4') })
    // Per-round decay: an unrefreshed cardinality-8 arrow survives 8
    // half-moves, so it is dropped once the turn counter reaches 9.
    for (let ply = 0; ply < 7; ply++) {
      match = resolveTurn(match, { from: sq('a7'), to: sq('a6') })
    }
    expect(match.turn).toBe(9)
    expect(match.arrows.some((entry) => entry.placedTurn === 1)).toBe(false)
    expect(
      match.arrows.every(
        (entry) =>
          arrowPullWeight(entry.cardinality, entry.placedTurn, match.turn) > 0,
      ),
    ).toBe(true)
  })

  it('replays the arrow phase deterministically for a given seed', () => {
    const arrowPhase = (): PendingResolution => {
      const match = resolveTurn(initMatch(99, { gameCount: 12 }), {
        from: sq('e2'),
        to: sq('e4'),
      })
      const resolution = beginResolution(match, {
        from: sq('g8'),
        to: sq('f6'),
      })
      if (resolution === null) {
        throw new Error('expected a resolution')
      }
      return resolution
    }
    const first = arrowPhase()
    const second = arrowPhase()
    expect(first.pending).toEqual(second.pending)
    expect(first.rng).toBe(second.rng)
    expect(first.arrowMoves).toBe(second.arrowMoves)
  })
})

describe('beginAutoResolution', () => {
  it('advances a ply from the existing arrow pool without adding arrows', () => {
    const match = resolveTurn(initMatch(3, { gameCount: 4 }), {
      from: sq('e2'),
      to: sq('e4'),
    })
    expect(match.arrows).toHaveLength(1)

    const resolution = beginAutoResolution(match)
    if (resolution === null) {
      throw new Error('expected a resolution')
    }
    expect(resolution.arrows).toHaveLength(1)

    const next = completeResolution(resolution, engineMovesFor(resolution))
    if (next === null) {
      throw new Error('resolution rejected its own engine moves')
    }
    expect(next.turn).toBe(3)
    expect(next.arrows).toHaveLength(1)
    for (const game of next.games) {
      expect(game.position.turn).toBe('white')
      expect(game.position.fullmoves).toBe(2)
    }
  })
})

describe('completeResolution', () => {
  it('advances every active game exactly one ply per turn', () => {
    const match = initMatch(3, { gameCount: 10 })
    const next = resolveTurn(match, { from: sq('e2'), to: sq('e4') })
    expect(next.turn).toBe(2)
    expect(sideToMove(next)).toBe('black')
    for (const game of next.games) {
      expect(game.position.turn).toBe('black')
      expect(game.position.fullmoves).toBe(1)
    }
    const summary = next.lastResolution
    expect(summary).not.toBeNull()
    expect((summary?.arrowMoves ?? 0) + (summary?.engineMoves ?? 0)).toBe(10)
  })

  it('produces identical matches for identical inputs', () => {
    const play = (): MatchState => {
      let match = initMatch(99, { gameCount: 12 })
      match = resolveTurn(match, { from: sq('e2'), to: sq('e4') })
      match = resolveTurn(match, { from: sq('g8'), to: sq('f6') })
      match = resolveTurn(match, { from: sq('d2'), to: sq('d4') })
      return match
    }
    const first = play()
    const second = play()
    expect(fens(first)).toEqual(fens(second))
    expect(first.scores).toEqual(second.scores)
    expect(first.rng).toBe(second.rng)
  })

  it('rejects a move list of the wrong length', () => {
    const match = initMatch(3, { gameCount: 4, whitePlayer: 2 })
    const resolution = beginResolution(match, {
      from: sq('e2'),
      to: sq('e4'),
    })
    if (resolution === null) {
      throw new Error('expected a resolution')
    }
    expect(completeResolution(resolution, [])).toBeNull()
  })

  it('rejects illegal engine moves', () => {
    const match = initMatch(3, { gameCount: 2 })
    const resolution = beginResolution(match, {
      from: sq('e2'),
      to: sq('e4'),
    })
    if (resolution === null) {
      throw new Error('expected a resolution')
    }
    const moves = engineMovesFor(resolution)
    moves[0] = 'e2e5'
    expect(completeResolution(resolution, moves)).toBeNull()
  })

  it('scores checkmate for the side that delivered it and ends the match', () => {
    // One game, white mates in one with Ra8#. Player 1 owns white.
    const match = initMatch(5, {
      fens: ['6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'],
      whitePlayer: 1,
    })
    const next = resolveTurn(match, { from: sq('a1'), to: sq('a8') })
    const game = next.games[0]
    expect(game?.status).toEqual({ tag: 'won', by: 1 })
    expect(next.scores).toEqual({ p1: 1, p2: 0 })
    expect(activeGameCount(next)).toBe(0)
    expect(next.phase).toEqual({ tag: 'finished', winner: 1 })
  })

  it('removes stalemated games without scoring and can draw the match', () => {
    // Black has only Ka8. White plays Qb6->c7, covering a7/b7/b8 while
    // leaving a8 unattacked: stalemate.
    const match = initMatch(5, { fens: ['k7/8/1Q6/8/8/8/8/4K3 w - - 0 1'] })
    const next = resolveTurn(match, { from: sq('b6'), to: sq('c7') })
    expect(next.lastResolution?.arrowMoves).toBe(1)
    expect(next.games[0]?.status).toEqual({
      tag: 'drawn',
      reason: 'stalemate',
    })
    expect(next.scores).toEqual({ p1: 0, p2: 0 })
    expect(next.phase).toEqual({ tag: 'finished', winner: 'draw' })
  })

  it('declares the match decided only when the trailing player cannot catch up', () => {
    const match = initMatch(5, {
      fens: [
        '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      ],
      whitePlayer: 1,
    })
    const next = resolveTurn(match, { from: sq('a1'), to: sq('a8') })
    expect(next.scores.p1).toBe(1)
    expect(activeGameCount(next)).toBe(1)
    expect(next.phase).toEqual({ tag: 'active' })
  })
})
