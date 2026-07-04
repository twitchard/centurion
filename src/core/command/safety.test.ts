import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { makeSan } from 'chessops/san'
import { describe, expect, it } from 'vitest'
import { matchingMoves } from './evaluate'
import { isSquareSafeAfterMove } from './safety'

function positionFromFen(fen: string): Chess {
  return Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
}

describe('isSquareSafeAfterMove', () => {
  it('treats unattacked squares as safe', () => {
    const position = positionFromFen('7k/8/8/8/8/8/8/3Q2K1 w - - 0 1')
    const move = findMove(position, 'Qc1')
    expect(isSquareSafeAfterMove(position, move)).toBe(true)
  })

  it('rejects moves onto a square that loses the exchange cascade', () => {
    const position = positionFromFen('3r2k1/8/8/8/8/8/8/3Q2K1 w - - 0 1')
    expect(isSquareSafeAfterMove(position, findMove(position, 'Qd2'))).toBe(
      false,
    )
    expect(isSquareSafeAfterMove(position, findMove(position, 'Qc2'))).toBe(
      true,
    )
  })
})

describe('safe predicate', () => {
  it('filters queen moves to safe destinations only', () => {
    const position = positionFromFen('3r2k1/8/8/8/8/8/8/3Q2K1 w - - 0 1')
    const matched = matchingMoves(position, {
      tag: 'and',
      all: [{ tag: 'piece', roles: ['queen'] }, { tag: 'safe' }],
    }).map((m) => m.san)
    expect(matched).toContain('Qc2')
    expect(matched).not.toContain('Qd2')
    expect(matched).not.toContain('Qd4')
  })
})

function findMove(position: Chess, san: string) {
  for (const [from, dests] of position.allDests()) {
    for (const to of dests) {
      const move = { from, to }
      if (makeSan(position, move) === san) {
        return move
      }
    }
  }
  throw new Error(`Move not found: ${san}`)
}
