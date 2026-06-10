import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { makeUci, squareRank } from 'chessops/util'
import { describe, expect, it } from 'vitest'
import { initMatch } from './model'
import { matchGameToPgn, replaySnapshot } from './pgn'
import { beginAutoResolution, completeResolution } from './resolve'

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

describe('matchGameToPgn', () => {
  it('exports a PGN with SAN moves after one ply', () => {
    let match = initMatch(42, { gameCount: 2 })
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
    let match = initMatch(7, { gameCount: 1 })
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
  })
})
