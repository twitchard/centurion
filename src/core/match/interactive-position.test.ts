import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { describe, expect, it } from 'vitest'
import {
  commandTextForSquares,
  pickInteractiveGame,
} from './interactive-position'
import { initMatch } from './model'
import { beginAutoResolution, completeResolution } from './resolve'

describe('pickInteractiveGame', () => {
  it('prefers an active game on the viewer side to move', () => {
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
