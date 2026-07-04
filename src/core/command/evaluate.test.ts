import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { describe, expect, it } from 'vitest'
import { matchingMoves } from './evaluate'
import type { CommandPredicate } from './model'

function positionFromFen(fen: string): Chess {
  return Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
}

function sans(position: Chess, predicate: CommandPredicate): string[] {
  return matchingMoves(position, predicate).map((match) => match.san)
}

describe('matchingMoves', () => {
  it('finds advancing knight moves in the start position', () => {
    const predicate: CommandPredicate = {
      tag: 'and',
      all: [{ tag: 'piece', roles: ['knight'] }, { tag: 'advances' }],
    }
    expect(sans(Chess.default(), predicate)).toEqual([
      'Na3',
      'Nc3',
      'Nf3',
      'Nh3',
    ])
  })

  it('finds no captures in the start position', () => {
    expect(sans(Chess.default(), { tag: 'captures' })).toEqual([])
  })

  it('reads ranks from the mover side for black', () => {
    const position = positionFromFen(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    )
    // Black's rank 4 is board rank 5: e7-e5 lands there, e7-e6 does not.
    const predicate: CommandPredicate = {
      tag: 'and',
      all: [
        { tag: 'piece', roles: ['pawn'] },
        { tag: 'to', region: { ranks: { from: 4, to: 4 } } },
      ],
    }
    const matched = sans(position, predicate)
    expect(matched).toContain('e5')
    expect(matched).not.toContain('e6')
  })

  it('matches castling once per side despite dual encodings', () => {
    const position = positionFromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
    expect(sans(position, { tag: 'castles' })).toEqual(['O-O', 'O-O-O'])
  })

  it('detects checks by playing the move out', () => {
    const position = positionFromFen('7k/8/8/8/8/8/R7/K7 w - - 0 1')
    const matched = sans(position, { tag: 'gives-check' })
    expect(matched).toContain('Ra8+')
    expect(matched).toContain('Rh2+')
  })

  it('matches only mating moves for checkmates', () => {
    const position = positionFromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1')
    const mates = sans(position, { tag: 'checkmates' })
    expect(mates).toEqual(['Ra8#'])
    expect(sans(position, { tag: 'gives-check' })).toEqual(['Ra8#'])
    const checkingOnly = positionFromFen('7k/8/8/8/8/8/R7/K7 w - - 0 1')
    expect(sans(checkingOnly, { tag: 'checkmates' })).toEqual([])
    expect(sans(checkingOnly, { tag: 'gives-check' }).length).toBeGreaterThan(0)
  })

  it('treats escapes as a property of the moving piece', () => {
    // Black rook on d8 pins its eyes on the knight at d1; only knight
    // moves count as escaping.
    const position = positionFromFen('k2r4/8/8/8/8/8/8/K2N4 w - - 0 1')
    const matched = sans(position, { tag: 'escapes' })
    expect(matched).toEqual(['Nb2', 'Nc3', 'Ne3', 'Nf2'])
  })

  it('finds moves that attack the enemy queen', () => {
    const position = positionFromFen('k7/8/8/3q4/8/8/8/K4N2 w - - 0 1')
    const matched = sans(position, { tag: 'attacks', roles: ['queen'] })
    expect(matched).toContain('Ne3')
  })

  it('matches promotions with the queen auto-promotion', () => {
    const position = positionFromFen('8/P6k/8/8/8/8/8/K7 w - - 0 1')
    expect(sans(position, { tag: 'promotes' })).toEqual(['a8=Q'])
  })

  it('counts en passant as a pawn capture', () => {
    const position = positionFromFen('k7/8/8/3pP3/8/8/8/K7 w - d6 0 2')
    const matched = sans(position, { tag: 'captures', roles: ['pawn'] })
    expect(matched).toEqual(['exd6'])
  })

  it('supports negation', () => {
    const predicate: CommandPredicate = {
      tag: 'not',
      inner: { tag: 'piece', roles: ['pawn'] },
    }
    expect(sans(Chess.default(), predicate)).toEqual([
      'Na3',
      'Nc3',
      'Nf3',
      'Nh3',
    ])
  })
})
