import { Chess } from 'chessops/chess'
import { makeFen, parseFen } from 'chessops/fen'
import { makeUci, squareRank } from 'chessops/util'
import { describe, expect, it } from 'vitest'
import { initMatch } from './model'
import {
  beginAutoResolution,
  beginResolution,
  completeResolution,
} from './resolve'
import { decodeMatchSnapshot, encodeMatchState } from './snapshot'

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

describe('match snapshot codec', () => {
  it('round-trips a match after resolution', () => {
    let match = initMatch(42, { gameCount: 3 })
    const resolution = beginAutoResolution(match)
    if (resolution === null) {
      throw new Error('expected resolution')
    }
    const engineMoves = resolution.pending.map((entry) =>
      firstLegalUci(entry.fen),
    )
    const next = completeResolution(resolution, engineMoves)
    if (next === null) {
      throw new Error('expected completed resolution')
    }
    match = next

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

  it('round-trips arrow moves with their owner', () => {
    const match = initMatch(3, {
      gameCount: 4,
      whitePlayer: 1,
      firstPlacer: 1,
    })
    const resolution = beginResolution(match, { from: 12, to: 28 })
    if (resolution === null) {
      throw new Error('expected resolution')
    }
    const engineMoves = resolution.pending.map((entry) =>
      firstLegalUci(entry.fen),
    )
    const next = completeResolution(resolution, engineMoves)
    if (next === null) {
      throw new Error('expected completed resolution')
    }

    const arrowMoves = next.games
      .flatMap((game) => game.moves)
      .filter((move) => move.source === 'arrow')
    expect(arrowMoves.length).toBeGreaterThan(0)

    const decoded = decodeMatchSnapshot(encodeMatchState(next))
    if (decoded === null) {
      throw new Error('expected decoded match')
    }
    expect(decoded.games.map((game) => game.moves)).toEqual(
      next.games.map((game) => game.moves),
    )
  })

  it('accepts legacy snapshots whose arrow moves lack an owner', () => {
    const match = initMatch(3, {
      gameCount: 4,
      whitePlayer: 1,
      firstPlacer: 1,
    })
    const resolution = beginResolution(match, { from: 12, to: 28 })
    if (resolution === null) {
      throw new Error('expected resolution')
    }
    const engineMoves = resolution.pending.map((entry) =>
      firstLegalUci(entry.fen),
    )
    const next = completeResolution(resolution, engineMoves)
    if (next === null) {
      throw new Error('expected completed resolution')
    }

    const encoded = encodeMatchState(next)
    const legacy = {
      ...encoded,
      games: encoded.games.map((game) => ({
        ...game,
        moves: game.moves.map((move) => ({
          uci: move.uci,
          source: move.source,
        })),
      })),
    }
    const decoded = decodeMatchSnapshot(legacy)
    if (decoded === null) {
      throw new Error('expected decoded match')
    }
    expect(
      decoded.games
        .flatMap((game) => game.moves)
        .every((move) => move.arrowOwner === undefined),
    ).toBe(true)
  })

  it('rejects snapshots with an invalid arrow owner', () => {
    const match = initMatch(3, {
      gameCount: 4,
      whitePlayer: 1,
      firstPlacer: 1,
    })
    const resolution = beginResolution(match, { from: 12, to: 28 })
    if (resolution === null) {
      throw new Error('expected resolution')
    }
    const engineMoves = resolution.pending.map((entry) =>
      firstLegalUci(entry.fen),
    )
    const next = completeResolution(resolution, engineMoves)
    if (next === null) {
      throw new Error('expected completed resolution')
    }

    const encoded = encodeMatchState(next)
    const corrupted = {
      ...encoded,
      games: encoded.games.map((game) => ({
        ...game,
        moves: game.moves.map((move) => ({ ...move, arrowOwner: 3 })),
      })),
    }
    expect(decodeMatchSnapshot(corrupted)).toBeNull()
  })
})
