import { Chess } from 'chessops/chess'
import { describe, expect, it } from 'vitest'
import { matchingMoves } from './evaluate'
import { tryCompileLiteralNotation } from './parse-notation'

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
          },
        },
        {
          tag: 'to',
          region: {
            files: { from: 'e', to: 'e' },
            ranks: { from: 4, to: 4 },
          },
        },
      ],
    })
  })

  it('returns null for natural-language commands', () => {
    expect(tryCompileLiteralNotation('all knights advance')).toBeNull()
    expect(tryCompileLiteralNotation('take the queen')).toBeNull()
  })
})
