import { Chess } from 'chessops/chess'
import { makeFen, parseFen } from 'chessops/fen'
import { makeUci, squareRank } from 'chessops/util'
import { describe, expect, it } from 'vitest'
import type { CommandPredicate } from '../command/model'
import { type MatchState, initMatch } from './model'
import {
  type RankedMove,
  beginAutoResolution,
  beginResolution,
  completeResolution,
} from './resolve'
import { decodeMatchSnapshot, encodeMatchState } from './snapshot'

const KNIGHTS: CommandPredicate = { tag: 'piece', roles: ['knight'] }

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

function resolvedCommandMatch(): MatchState {
  const match = initMatch(3, { gameCount: 4, whitePlayer: 1, firstPlacer: 1 })
  const resolution = beginResolution(match, {
    text: 'move a knight',
    predicate: KNIGHTS,
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
  return next
}

describe('match snapshot codec', () => {
  it('round-trips a match after resolution', () => {
    const base = initMatch(42, { gameCount: 3 })
    const resolution = beginAutoResolution(base)
    if (resolution === null) {
      throw new Error('expected resolution')
    }
    const match = completeResolution(
      resolution,
      resolution.pending.map((entry) => rankedFor(entry.fen)),
    )
    if (match === null) {
      throw new Error('expected completed resolution')
    }

    const encoded = encodeMatchState(match)
    const decoded = decodeMatchSnapshot(encoded)
    if (decoded === null) {
      throw new Error('expected decoded match')
    }

    expect(decoded.turn).toBe(match.turn)
    expect(decoded.scores).toEqual(match.scores)
    expect(decoded.games).toHaveLength(match.games.length)
    for (let index = 0; index < match.games.length; index++) {
      const before = match.games[index]
      const after = decoded.games[index]
      if (before === undefined || after === undefined) {
        throw new Error('missing game')
      }
      expect(makeFen(after.position.toSetup())).toBe(
        makeFen(before.position.toSetup()),
      )
      expect(after.moves).toEqual(before.moves)
    }
  })

  it('round-trips commands with their predicates and owners', () => {
    const next = resolvedCommandMatch()
    const commandMoves = next.games
      .flatMap((game) => game.moves)
      .filter((move) => move.source === 'command')
    expect(commandMoves.length).toBeGreaterThan(0)

    const decoded = decodeMatchSnapshot(encodeMatchState(next))
    if (decoded === null) {
      throw new Error('expected decoded match')
    }
    expect(decoded.commands).toEqual(next.commands)
    expect(decoded.games.map((game) => game.moves)).toEqual(
      next.games.map((game) => game.moves),
    )
  })

  it('rejects snapshots whose command predicate fails the codec', () => {
    const next = resolvedCommandMatch()
    const encoded = encodeMatchState(next)
    const corrupted = {
      ...encoded,
      commands: encoded.commands.map((command) => ({
        ...command,
        predicate: { tag: 'best-move' },
      })),
    }
    expect(decodeMatchSnapshot(corrupted)).toBeNull()
  })

  it('rejects snapshots with an invalid command owner on a move', () => {
    const next = resolvedCommandMatch()
    const encoded = encodeMatchState(next)
    const corrupted = {
      ...encoded,
      games: encoded.games.map((game) => ({
        ...game,
        moves: game.moves.map((move) => ({ ...move, commandOwner: 3 })),
      })),
    }
    expect(decodeMatchSnapshot(corrupted)).toBeNull()
  })
})
