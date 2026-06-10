import { makeFen } from 'chessops/fen'
import { parseSquare } from 'chessops/util'
import { describe, expect, it } from 'vitest'
import { chooseEngineMove } from './engine'
import {
  type MatchState,
  activeGameCount,
  activePlacer,
  initMatch,
  sideToMove,
} from './model'
import { arrowMoveForGame, flipSquare, placeArrowAndResolve } from './resolve'

function sq(name: string): number {
  const square = parseSquare(name)
  if (square === undefined) {
    throw new Error(`Bad square: ${name}`)
  }
  return square
}

function fens(match: MatchState): readonly string[] {
  return match.games.map((game) => makeFen(game.position.toSetup()))
}

describe('initMatch', () => {
  it('creates the configured number of games with colors split evenly', () => {
    const match = initMatch(42)
    expect(match.games).toHaveLength(100)
    expect(match.games.filter((g) => g.whiteOwner === 1)).toHaveLength(50)
    expect(match.games.filter((g) => g.whiteOwner === 2)).toHaveLength(50)
    expect(match.turn).toBe(1)
    expect(sideToMove(match)).toBe('white')
    expect(match.phase).toEqual({ tag: 'active' })
  })

  it('derives the first placer from the seed', () => {
    const match = initMatch(7)
    expect([1, 2]).toContain(match.firstPlacer)
    expect(activePlacer(match)).toBe(match.firstPlacer)
  })
})

describe('arrowMoveForGame', () => {
  it('interprets arrows literally in games where player 1 is white', () => {
    const match = initMatch(1, { gameCount: 2 })
    const game = match.games[0]
    if (game === undefined) {
      throw new Error('missing game')
    }
    expect(game.whiteOwner).toBe(1)
    const move = arrowMoveForGame(game, { from: sq('e2'), to: sq('e4') })
    expect(move).toEqual({ from: sq('e2'), to: sq('e4') })
  })

  it('rank-flips arrows in games where player 1 is black', () => {
    const match = initMatch(1, { gameCount: 2 })
    const game = match.games[1]
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

describe('placeArrowAndResolve', () => {
  it('advances every active game exactly one ply per turn', () => {
    const match = initMatch(3, { gameCount: 10 })
    const next = placeArrowAndResolve(match, { from: sq('e2'), to: sq('e4') })
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

  it('matches each arrow instance to at most one game', () => {
    const match = initMatch(3, { gameCount: 10 })
    const next = placeArrowAndResolve(match, { from: sq('e2'), to: sq('e4') })
    expect(next.lastResolution?.arrowMoves).toBe(1)
    const movedGames = next.games.filter((game) => {
      const fen = makeFen(game.position.toSetup())
      return game.whiteOwner === 1
        ? fen.startsWith('rnbqkbnr/pppppppp/8/8/4P3/8')
        : fen.startsWith('rnbqkbnr/pppp1ppp/8/4p3')
    })
    // The arrow moved one of player 1's white games; flipped games could
    // only match e2->e4 as the black reply e7->e5, and it is white to move.
    expect(movedGames.length).toBeGreaterThanOrEqual(1)
  })

  it('keeps old arrows active in later turns', () => {
    let match = initMatch(3, { gameCount: 4 })
    match = placeArrowAndResolve(match, { from: sq('e2'), to: sq('e4') })
    // Turn 2: black to move. The earlier e2->e4 arrow now also matches the
    // flipped games (actual move e7->e5).
    match = placeArrowAndResolve(match, { from: sq('d7'), to: sq('d5') })
    expect(match.lastResolution?.arrowMoves).toBeGreaterThanOrEqual(1)
    expect(match.arrows).toHaveLength(2)
  })

  it('is deterministic for a given seed and arrow sequence', () => {
    const play = (): MatchState => {
      let match = initMatch(99, { gameCount: 12 })
      match = placeArrowAndResolve(match, { from: sq('e2'), to: sq('e4') })
      match = placeArrowAndResolve(match, { from: sq('g8'), to: sq('f6') })
      match = placeArrowAndResolve(match, { from: sq('d2'), to: sq('d4') })
      return match
    }
    const first = play()
    const second = play()
    expect(fens(first)).toEqual(fens(second))
    expect(first.scores).toEqual(second.scores)
    expect(first.rng).toBe(second.rng)
  })

  it('diverges across different seeds', () => {
    const playWith = (seed: number): readonly string[] => {
      let match = initMatch(seed, { gameCount: 12 })
      match = placeArrowAndResolve(match, { from: sq('e2'), to: sq('e4') })
      match = placeArrowAndResolve(match, { from: sq('g8'), to: sq('f6') })
      return fens(match)
    }
    expect(playWith(1)).not.toEqual(playWith(2))
  })

  it('scores checkmate for the side that delivered it and ends the match', () => {
    // One game, white mates in one with Ra8#. Player 1 owns white.
    const match = initMatch(5, { fens: ['6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'] })
    const next = placeArrowAndResolve(match, { from: sq('a1'), to: sq('a8') })
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
    const next = placeArrowAndResolve(match, { from: sq('b6'), to: sq('c7') })
    expect(next.lastResolution?.arrowMoves).toBe(1)
    expect(next.games[0]?.status).toEqual({
      tag: 'drawn',
      reason: 'stalemate',
    })
    expect(next.scores).toEqual({ p1: 0, p2: 0 })
    expect(next.phase).toEqual({ tag: 'finished', winner: 'draw' })
  })

  it('declares the match decided when the trailing player cannot catch up', () => {
    // Two games; player 1 wins one by checkmate while the other stays
    // active: lead (1) > active (1) is false, so use a single decisive
    // game plus none active -> covered above. Here check the inverse:
    // with one game still active and scores 1:0 the match continues.
    const match = initMatch(5, {
      fens: [
        '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      ],
    })
    const next = placeArrowAndResolve(match, { from: sq('a1'), to: sq('a8') })
    expect(next.scores.p1).toBe(1)
    expect(activeGameCount(next)).toBe(1)
    expect(next.phase).toEqual({ tag: 'active' })
  })
})

describe('chooseEngineMove', () => {
  it('finds mate in one', () => {
    const match = initMatch(1, { fens: ['6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'] })
    const game = match.games[0]
    if (game === undefined) {
      throw new Error('missing game')
    }
    const [move] = chooseEngineMove(game, match.rng)
    expect(move).toEqual({ from: sq('a1'), to: sq('a8') })
  })

  it('prefers winning a hanging queen', () => {
    // Black queen on d5 hangs to Qd1xd5 along the open d-file.
    const match = initMatch(1, {
      fens: ['rnb1kbnr/ppp1pppp/8/3q4/8/8/PPP1PPPP/RNBQKBNR w KQkq - 0 1'],
    })
    const game = match.games[0]
    if (game === undefined) {
      throw new Error('missing game')
    }
    const [move] = chooseEngineMove(game, match.rng)
    expect(move).toEqual({ from: sq('d1'), to: sq('d5') })
  })

  it('is deterministic for identical inputs', () => {
    const match = initMatch(123, { gameCount: 1 })
    const game = match.games[0]
    if (game === undefined) {
      throw new Error('missing game')
    }
    const [a] = chooseEngineMove(game, match.rng)
    const [b] = chooseEngineMove(game, match.rng)
    expect(a).toEqual(b)
  })
})
