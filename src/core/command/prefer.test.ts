import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { describe, expect, it } from 'vitest'
import { matchingMoves } from './evaluate'
import type { CommandPredicate } from './model'

function positionFromFen(fen: string): Chess {
  return Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
}

const CAPTURE_QUEEN_OR_ELSE_KNIGHT: CommandPredicate = {
  tag: 'prefer',
  options: [
    { tag: 'captures', roles: ['queen'] },
    { tag: 'captures', roles: ['knight'] },
  ],
}

const CASTLE_KINGSIDE_PREFER: CommandPredicate = {
  tag: 'prefer',
  options: [
    {
      tag: 'and',
      all: [
        { tag: 'castles' },
        { tag: 'to', region: { files: { from: 'g', to: 'g' } } },
      ],
    },
    {
      tag: 'and',
      all: [
        { tag: 'castles' },
        { tag: 'to', region: { files: { from: 'c', to: 'c' } } },
      ],
    },
  ],
}

describe('prefer combinator', () => {
  it('uses the first option when it has matches', () => {
    const position = positionFromFen('7k/8/8/3q4/8/4N3/8/K7 w - - 0 1')
    expect(
      matchingMoves(position, CAPTURE_QUEEN_OR_ELSE_KNIGHT).map((m) => m.san),
    ).toEqual(['Nxd5'])
  })

  it('falls back to the second option when the first has none', () => {
    const position = positionFromFen('7k/8/8/8/3n4/8/2N5/K7 w - - 0 1')
    expect(
      matchingMoves(position, CAPTURE_QUEEN_OR_ELSE_KNIGHT).map((m) => m.san),
    ).toEqual(['Nxd4'])
  })

  it('prefers kingside castling over queenside', () => {
    const position = positionFromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
    expect(
      matchingMoves(position, CASTLE_KINGSIDE_PREFER).map((m) => m.san),
    ).toEqual(['O-O'])
  })

  it('falls back to queenside when kingside is unavailable', () => {
    const position = positionFromFen('r3k2r/8/8/8/8/8/8/R3KN1R w KQkq - 0 1')
    expect(
      matchingMoves(position, CASTLE_KINGSIDE_PREFER).map((m) => m.san),
    ).toEqual(['O-O-O'])
  })
})
