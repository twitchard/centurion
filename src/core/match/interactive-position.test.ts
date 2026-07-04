import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { describe, expect, it } from 'vitest'
import {
  commandTextForSquares,
  commandTextForVisualSquares,
  handleSquareClick,
  pickInteractiveGame,
} from './interactive-position'
import { initMatch } from './model'
import { beginAutoResolution, completeResolution } from './resolve'

describe('pickInteractiveGame', () => {
  it('prefers an active game on the commander side to move', () => {
    const match = initMatch(1, { gameCount: 3, whitePlayer: 1 })
    const afterTurn1 = (() => {
      const resolution = beginAutoResolution(match)
      if (resolution === null) {
        throw new Error('expected resolution')
      }
      const ranked = resolution.pending.map(() => [{ uci: 'e2e4', cp: 20 }])
      return completeResolution(resolution, ranked)
    })()
    if (afterTurn1 === null) {
      throw new Error('expected match')
    }
    const game = pickInteractiveGame(afterTurn1, 1)
    expect(game?.id).toBe(0)
    expect(game?.position.turn).toBe('black')
  })
})

describe('commandTextForSquares', () => {
  it('returns SAN without check or mate markers', () => {
    const position = Chess.fromSetup(
      parseFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1').unwrap(),
    ).unwrap()
    expect(commandTextForSquares(position, 'a1', 'a8')).toBe('Ra8')
  })

  it('returns a pawn push for a one-square advance', () => {
    const position = Chess.default()
    expect(commandTextForSquares(position, 'e2', 'e4')).toBe('e4')
  })
})

describe('handleSquareClick', () => {
  it('selects on first tap and submits on second', () => {
    const match = initMatch(1, { gameCount: 1, whitePlayer: 1 })
    const game = match.games[0]
    if (game === undefined) {
      throw new Error('expected game')
    }
    const e2 = { col: 4, row: 1 }
    const e4 = { col: 4, row: 3 }
    const first = handleSquareClick(null, e2, game, 1)
    expect(first.selected).toEqual(e2)
    expect(first.command).toBeNull()
    const second = handleSquareClick(first.selected, e4, game, 1)
    expect(second.selected).toBeNull()
    expect(second.command).toBe('e4')
  })

  it('clears selection when the same square is tapped twice', () => {
    const match = initMatch(1, { gameCount: 1, whitePlayer: 1 })
    const game = match.games[0]
    if (game === undefined) {
      throw new Error('expected game')
    }
    const e2 = { col: 4, row: 1 }
    const first = handleSquareClick(null, e2, game, 1)
    const second = handleSquareClick(first.selected, e2, game, 1)
    expect(second.selected).toBeNull()
    expect(second.command).toBeNull()
  })

  it('maps visual squares through the viewer frame', () => {
    const match = initMatch(1, { gameCount: 1, whitePlayer: 1 })
    const game = match.games[0]
    if (game === undefined) {
      throw new Error('expected game')
    }
    expect(
      commandTextForVisualSquares(
        game,
        1,
        { col: 4, row: 1 },
        { col: 4, row: 3 },
      ),
    ).toBe('e4')
  })

  it('maps visual squares through a flipped viewer frame', () => {
    const match = initMatch(1, { gameCount: 1, whitePlayer: 1 })
    const game = match.games[0]
    if (game === undefined) {
      throw new Error('expected game')
    }
    expect(
      commandTextForVisualSquares(
        game,
        2,
        { col: 4, row: 6 },
        { col: 4, row: 4 },
      ),
    ).toBe('e4')
  })
})
