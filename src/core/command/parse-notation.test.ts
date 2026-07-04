import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { describe, expect, it } from 'vitest'
import { matchingMoves } from './evaluate'
import { tryCompileLiteralNotation } from './parse-notation'

function positionFromFen(fen: string): Chess {
  return Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
}

describe('tryCompileLiteralNotation', () => {
  it('compiles a bare square as a pawn move', () => {
    const predicate = tryCompileLiteralNotation('c3')
    expect(predicate).toEqual({
      tag: 'and',
      all: [
        { tag: 'piece', roles: ['pawn'] },
        {
          tag: 'to',
          region: {
            files: { from: 'c', to: 'c' },
            ranks: { from: 3, to: 3 },
            absolute: true,
          },
        },
      ],
    })
  })

  it('does not match knights for a bare square', () => {
    const predicate = tryCompileLiteralNotation('c3')
    expect(predicate).not.toBeNull()
    const sans = matchingMoves(Chess.default(), predicate!).map((m) => m.san)
    expect(sans).toEqual(['c3'])
    expect(sans).not.toContain('Nc3')
  })

  it('compiles piece-square notation', () => {
    expect(tryCompileLiteralNotation('Nf3')).toEqual({
      tag: 'and',
      all: [
        { tag: 'piece', roles: ['knight'] },
        {
          tag: 'to',
          region: {
            files: { from: 'f', to: 'f' },
            ranks: { from: 3, to: 3 },
            absolute: true,
          },
        },
      ],
    })
  })

  it('compiles pawn captures', () => {
    expect(tryCompileLiteralNotation('exd5')).toEqual({
      tag: 'and',
      all: [
        { tag: 'piece', roles: ['pawn'] },
        { tag: 'captures' },
        { tag: 'from', region: { files: { from: 'e', to: 'e' } } },
        {
          tag: 'to',
          region: {
            files: { from: 'd', to: 'd' },
            ranks: { from: 5, to: 5 },
            absolute: true,
          },
        },
      ],
    })
  })

  it('compiles piece captures', () => {
    expect(tryCompileLiteralNotation('Bxc4')).toEqual({
      tag: 'and',
      all: [
        { tag: 'piece', roles: ['bishop'] },
        { tag: 'captures' },
        {
          tag: 'to',
          region: {
            files: { from: 'c', to: 'c' },
            ranks: { from: 4, to: 4 },
            absolute: true,
          },
        },
      ],
    })
  })

  it('compiles castling', () => {
    expect(tryCompileLiteralNotation('O-O')).toEqual({ tag: 'castles' })
    expect(tryCompileLiteralNotation('0-0-0')).toEqual({ tag: 'castles' })
  })

  it('compiles pxp as pawn captures pawn', () => {
    expect(tryCompileLiteralNotation('pxp')).toEqual({
      tag: 'and',
      all: [
        { tag: 'piece', roles: ['pawn'] },
        { tag: 'captures', roles: ['pawn'] },
      ],
    })
  })

  it('compiles UCI moves', () => {
    expect(tryCompileLiteralNotation('e2e4')).toEqual({
      tag: 'and',
      all: [
        {
          tag: 'from',
          region: {
            files: { from: 'e', to: 'e' },
            ranks: { from: 2, to: 2 },
            absolute: true,
          },
        },
        {
          tag: 'to',
          region: {
            files: { from: 'e', to: 'e' },
            ranks: { from: 4, to: 4 },
            absolute: true,
          },
        },
      ],
    })
  })

  it('matches the Sicilian for black after 1.e4', () => {
    const position = positionFromFen(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    )
    const predicate = tryCompileLiteralNotation('c5')
    expect(predicate).not.toBeNull()
    expect(
      matchingMoves(position, predicate!).map((match) => match.san),
    ).toEqual(['c5'])
  })

  it('matches ...e5 for black after 1.e4', () => {
    const position = positionFromFen(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    )
    const predicate = tryCompileLiteralNotation('e5')
    expect(predicate).not.toBeNull()
    expect(
      matchingMoves(position, predicate!).map((match) => match.san),
    ).toEqual(['e5'])
  })

  it('returns null for natural-language commands', () => {
    expect(tryCompileLiteralNotation('all knights advance')).toBeNull()
    expect(tryCompileLiteralNotation('take the queen')).toBeNull()
  })
})
