import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { makeUci, squareRank } from 'chessops/util'
import { describe, expect, it } from 'vitest'
import { type MatchGame, type MatchState, initMatch } from './model'
import {
  compareGamesForReplay,
  gameMoveSourceCounts,
  matchGameToPgn,
  replaySnapshot,
} from './pgn'
import {
  type RankedMove,
  beginAutoResolution,
  beginResolution,
  completeResolution,
} from './resolve'

function rankedFor(fen: string): RankedMove[] {
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
      moves.push({ uci, cp: 0 })
    }
  }
  return moves
}

function autoResolve(match: MatchState): MatchState {
  const resolution = beginAutoResolution(match)
  if (resolution === null) {
    throw new Error('expected resolution')
  }
  const next = completeResolution(
    resolution,
    resolution.pending.map((entry) => rankedFor(entry.fen)),
  )
  if (next === null) {
    throw new Error('expected completed resolution')
  }
  return next
}

describe('matchGameToPgn', () => {
  it('exports a PGN with SAN moves after one ply', () => {
    const match = autoResolve(initMatch(42, { gameCount: 2 }))
    const game = match.games[0]
    if (game === undefined) {
      throw new Error('missing game')
    }
    expect(game.moves.length).toBeGreaterThan(0)

    const pgn = matchGameToPgn(game)
    expect(pgn).toContain('[Event "Centurion Chess"]')
    expect(pgn).toMatch(/\d+\.\s+\S+/)
  })
})

describe('replaySnapshot', () => {
  it('replays moves up to the requested ply', () => {
    const match = autoResolve(initMatch(7, { gameCount: 1 }))
    const game = match.games[0]
    if (game === undefined) {
      throw new Error('missing game')
    }

    const start = replaySnapshot(game, 0)
    const afterOne = replaySnapshot(game, 1)
    expect(start.ply).toBe(0)
    expect(afterOne.ply).toBe(1)
    expect(start.fen).not.toBe(afterOne.fen)
    expect(afterOne.lastMove).toBeDefined()
    expect(start.lastMoveRecord).toBeUndefined()
    expect(afterOne.lastMoveRecord).toEqual(game.moves[0])
  })

  it('exposes the source and owner of the shown move', () => {
    const match = initMatch(3, {
      gameCount: 1,
      whitePlayer: 1,
      firstPlacer: 1,
    })
    // "Move a knight" constrains the only game, so ply 1 is a command move.
    const resolution = beginResolution(match, {
      text: 'move a knight',
      predicate: { tag: 'piece', roles: ['knight'] },
    })
    if (resolution === null) {
      throw new Error('expected resolution')
    }
    const next = completeResolution(
      resolution,
      resolution.pending.map((entry) => rankedFor(entry.fen)),
    )
    if (next === null) {
      throw new Error('expected completed resolution')
    }
    const game = next.games[0]
    if (game === undefined) {
      throw new Error('missing game')
    }

    const snapshot = replaySnapshot(game, 1)
    expect(snapshot.lastMoveRecord).toMatchObject({
      source: 'command',
      commandOwner: 1,
    })
  })
})

describe('gameMoveSourceCounts', () => {
  it('counts command and free moves separately', () => {
    const match = autoResolve(initMatch(7, { gameCount: 1 }))
    const game = match.games[0]
    if (game === undefined) {
      throw new Error('missing game')
    }
    const counts = gameMoveSourceCounts(game)
    expect(counts.command + counts.free).toBe(game.moves.length)
    expect(counts.free).toBe(game.moves.length)
    expect(counts.command).toBe(0)
  })
})

describe('compareGamesForReplay', () => {
  it('ranks games with more command moves ahead of free-only games', () => {
    const commandHeavy = {
      id: 1,
      moves: [
        { uci: 'e2e4', source: 'command' },
        { uci: 'e7e5', source: 'command' },
        { uci: 'g1f3', source: 'free' },
      ],
    } as unknown as MatchGame
    const freeOnly = {
      id: 0,
      moves: [
        { uci: 'd2d4', source: 'free' },
        { uci: 'd7d5', source: 'free' },
        { uci: 'c2c4', source: 'free' },
      ],
    } as unknown as MatchGame
    expect(compareGamesForReplay(commandHeavy, freeOnly)).toBeLessThan(0)
  })
})
