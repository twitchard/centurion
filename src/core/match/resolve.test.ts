import { Chess } from 'chessops/chess'
import { makeFen, parseFen } from 'chessops/fen'
import { makeUci, squareRank } from 'chessops/util'
import { describe, expect, it } from 'vitest'
import type { CommandPredicate } from '../command/model'
import {
  MATE_CP,
  type MatchState,
  activeGameCount,
  activePlacer,
  canIssueCommands,
  initMatch,
  sideToMove,
} from './model'
import {
  type PendingResolution,
  type RankedMove,
  beginAutoResolution,
  beginResolution,
  completeResolution,
  flipSquare,
} from './resolve'

const KNIGHTS: CommandPredicate = { tag: 'piece', roles: ['knight'] }
const CASTLES: CommandPredicate = { tag: 'castles' }

/**
 * Stand-in for Stockfish in tests: every legal move of the position,
 * scored by `cpOf` (default all zero, making the soldier sample
 * uniformly among them).
 */
function rankedFor(
  fen: string,
  cpOf: (uci: string) => number = () => 0,
): RankedMove[] {
  const position = Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
  const moves: RankedMove[] = []
  for (const [from, dests] of position.allDests()) {
    for (const to of dests) {
      const isPawn = position.board.getRole(from) === 'pawn'
      const toRank = squareRank(to)
      const uci =
        isPawn && (toRank === 0 || toRank === 7)
          ? makeUci({ from, to, promotion: 'queen' })
          : makeUci({ from, to })
      moves.push({ uci, cp: cpOf(uci) })
    }
  }
  moves.sort((a, b) => b.cp - a.cp)
  return moves
}

function rankedLists(
  resolution: PendingResolution,
  cpOf?: (uci: string) => number,
): RankedMove[][] {
  return resolution.pending.map((entry) => rankedFor(entry.fen, cpOf))
}

function resolveTurn(
  match: MatchState,
  text: string | null,
  predicate: CommandPredicate | null,
  cpOf?: (uci: string) => number,
): MatchState {
  const command =
    text !== null && predicate !== null ? { text, predicate } : null
  const resolution = beginResolution(match, command)
  if (resolution === null) {
    throw new Error('match already finished')
  }
  const next = completeResolution(resolution, rankedLists(resolution, cpOf))
  if (next === null) {
    throw new Error('resolution rejected its own ranked lists')
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

  it('derives colors and first commander deterministically from the seed', () => {
    const first = initMatch(7)
    const second = initMatch(7)
    expect(first.games[0]?.whiteOwner).toBe(second.games[0]?.whiteOwner)
    expect(first.firstPlacer).toBe(second.firstPlacer)
    expect([1, 2]).toContain(first.firstPlacer)
    expect(activePlacer(first)).toBe(first.firstPlacer)
  })

  it('flipSquare is a rank flip and its own inverse', () => {
    expect(flipSquare(12)).toBe(52)
    expect(flipSquare(flipSquare(18))).toBe(18)
  })
})

describe('beginResolution', () => {
  it('lists every active game for the ranked search', () => {
    const match = initMatch(3, { gameCount: 10 })
    const resolution = beginResolution(match, {
      text: 'all knights advance',
      predicate: KNIGHTS,
    })
    expect(resolution?.pending).toHaveLength(10)
    expect(resolution?.command).toMatchObject({
      turn: 1,
      owner: match.firstPlacer,
      text: 'all knights advance',
    })
  })

  it('rejects commands after turn 100 but still auto-plays out', () => {
    const match = {
      ...initMatch(3, { gameCount: 2 }),
      turn: 101,
    }
    expect(canIssueCommands(match)).toBe(false)
    expect(
      beginResolution(match, { text: 'castle', predicate: CASTLES }),
    ).toBeNull()
    expect(beginAutoResolution(match)).not.toBeNull()
  })
})

describe('completeResolution', () => {
  it('advances every active game exactly one ply per turn', () => {
    const match = initMatch(3, { gameCount: 10 })
    const next = resolveTurn(match, 'knights', KNIGHTS)
    expect(next.turn).toBe(2)
    expect(sideToMove(next)).toBe('black')
    for (const game of next.games) {
      expect(game.position.turn).toBe('black')
      expect(game.position.fullmoves).toBe(1)
    }
    const summary = next.lastResolution
    expect(summary).not.toBeNull()
    expect((summary?.commandMoves ?? 0) + (summary?.freeMoves ?? 0)).toBe(10)
  })

  it('constrains every game to matching moves and records the owner', () => {
    const match = initMatch(3, { gameCount: 10, whitePlayer: 1 })
    const next = resolveTurn(match, 'move a knight', KNIGHTS)
    expect(next.commands).toHaveLength(1)
    for (const game of next.games) {
      const [move] = game.moves
      expect(move?.source).toBe('command')
      expect(move?.commandOwner).toBe(1)
      // Knight moves from the start position land on the third rank.
      expect(['a3', 'c3', 'f3', 'h3']).toContain(move?.uci.slice(2))
    }
  })

  it('falls back to free soldier moves when nothing matches', () => {
    const match = initMatch(3, { gameCount: 4 })
    // No castling move exists on turn 1.
    const next = resolveTurn(match, 'castle', CASTLES)
    for (const game of next.games) {
      expect(game.moves[0]?.source).toBe('free')
      expect(game.moves[0]?.commandOwner).toBeUndefined()
    }
    expect(next.lastResolution?.freeMoves).toBe(4)
  })

  it('diverges identical games through sampling', () => {
    const match = initMatch(11, { gameCount: 20 })
    const next = resolveTurn(match, null, null)
    const firstMoves = new Set(next.games.map((game) => game.moves[0]?.uci))
    expect(firstMoves.size).toBeGreaterThan(1)
  })

  it('samples toward the target distance below the best move', () => {
    const match = initMatch(17, { gameCount: 50 })
    // e2e4 is "best" at +200; d2d4 sits exactly at the soldier target
    // (200 - 100); everything else is far below.
    const cpOf = (uci: string): number =>
      uci === 'e2e4' ? 200 : uci === 'd2d4' ? 100 : -400
    const next = resolveTurn(match, null, null, cpOf)
    let targetHits = 0
    for (const game of next.games) {
      if (game.moves[0]?.uci === 'd2d4') {
        targetHits += 1
      }
    }
    // Weight(d2d4) = 1 vs weight(e2e4) = exp(-100/60) ~ 0.19: the
    // on-target move should dominate.
    expect(targetHits).toBeGreaterThan(30)
  })

  it('takes a forced mate even against the command', () => {
    // White mates in one with Ra8#. The command asks for pawn moves.
    const match = initMatch(5, {
      fens: ['6k1/5ppp/8/8/8/8/6P1/R5K1 w - - 0 1'],
      whitePlayer: 1,
    })
    const cpOf = (uci: string): number => (uci === 'a1a8' ? MATE_CP - 1 : 0)
    const next = resolveTurn(
      match,
      'push pawns',
      { tag: 'piece', roles: ['pawn'] },
      cpOf,
    )
    expect(next.games[0]?.moves[0]?.uci).toBe('a1a8')
    expect(next.games[0]?.status).toEqual({ tag: 'won', by: 1 })
    expect(next.scores).toEqual({ p1: 1, p2: 0 })
    expect(activeGameCount(next)).toBe(0)
    expect(next.phase).toEqual({ tag: 'finished', winner: 1 })
  })

  it('produces identical matches for identical inputs', () => {
    const play = (): MatchState => {
      let match = initMatch(99, { gameCount: 12 })
      match = resolveTurn(match, 'knights', KNIGHTS)
      match = resolveTurn(match, null, null)
      match = resolveTurn(match, 'push pawns', {
        tag: 'piece',
        roles: ['pawn'],
      })
      return match
    }
    const first = play()
    const second = play()
    expect(fens(first)).toEqual(fens(second))
    expect(first.scores).toEqual(second.scores)
    expect(first.rng).toBe(second.rng)
  })

  it('rejects ranked lists of the wrong length', () => {
    const match = initMatch(3, { gameCount: 4 })
    const resolution = beginResolution(match, null)
    if (resolution === null) {
      throw new Error('expected a resolution')
    }
    expect(completeResolution(resolution, [])).toBeNull()
  })

  it('skips illegal ranked entries and fails only when nothing is playable', () => {
    const match = initMatch(3, { gameCount: 1 })
    const resolution = beginResolution(match, null)
    if (resolution === null) {
      throw new Error('expected a resolution')
    }
    const withJunk = resolution.pending.map((entry) => [
      { uci: 'e2e5', cp: 900 },
      ...rankedFor(entry.fen),
    ])
    const next = completeResolution(resolution, withJunk)
    expect(next).not.toBeNull()
    expect(next?.games[0]?.moves[0]?.uci).not.toBe('e2e5')

    const empty = resolution.pending.map(() => [])
    expect(completeResolution(resolution, empty)).toBeNull()
  })

  it('removes stalemated games without scoring and can draw the match', () => {
    // Black has only Ka8. Forcing Qb6->c7 covers a7/b7/b8 while leaving
    // a8 unattacked: stalemate.
    const match = initMatch(5, { fens: ['k7/8/1Q6/8/8/8/8/4K3 w - - 0 1'] })
    const resolution = beginResolution(match, null)
    if (resolution === null) {
      throw new Error('expected a resolution')
    }
    const next = completeResolution(resolution, [[{ uci: 'b6c7', cp: 0 }]])
    expect(next?.games[0]?.status).toEqual({
      tag: 'drawn',
      reason: 'stalemate',
    })
    expect(next?.scores).toEqual({ p1: 0, p2: 0 })
    expect(next?.phase).toEqual({ tag: 'finished', winner: 'draw' })
  })

  it('declares the match decided only when the trailing player cannot catch up', () => {
    const match = initMatch(5, {
      fens: [
        '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      ],
      whitePlayer: 1,
    })
    const cpOf = (uci: string): number => (uci === 'a1a8' ? MATE_CP - 1 : 0)
    const next = resolveTurn(match, null, null, cpOf)
    expect(next.scores.p1).toBe(1)
    expect(activeGameCount(next)).toBe(1)
    expect(next.phase).toEqual({ tag: 'active' })
  })
})
