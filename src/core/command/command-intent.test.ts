import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { describe, expect, it } from 'vitest'
import { describeCommandPredicate } from './describe'
import { matchingMoves } from './evaluate'
import type { CommandPredicate } from './model'
import { tryCompileLiteralNotation } from './parse-notation'

/**
 * Catalog of player command phrases and the predicates that capture their
 * intent. Each block documents what the player means, the canonical encoding,
 * any remaining approximation, and concrete positions where behavior is
 * checkable.
 */

function positionFromFen(fen: string): Chess {
  return Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
}

function sans(position: Chess, predicate: CommandPredicate): string[] {
  return matchingMoves(position, predicate).map((match) => match.san)
}

const KINGSIDE_CASTLE: CommandPredicate = {
  tag: 'and',
  all: [
    { tag: 'castles' },
    { tag: 'to', region: { files: { from: 'g', to: 'g' } } },
  ],
}

const QUEENSIDE_CASTLE: CommandPredicate = {
  tag: 'and',
  all: [
    { tag: 'castles' },
    { tag: 'to', region: { files: { from: 'c', to: 'c' } } },
  ],
}

interface IntentExample {
  readonly phrase: string
  readonly intent: string
  readonly predicate: CommandPredicate
  readonly gap?: string
}

const ORDER_LOG: readonly IntentExample[] = [
  {
    phrase: 'e4',
    intent: 'Pawn to the absolute square e4 (literal notation).',
    predicate: tryCompileLiteralNotation('e4')!,
  },
  {
    phrase: 'Nf3',
    intent: 'Knight to the absolute square f3 (literal notation).',
    predicate: tryCompileLiteralNotation('Nf3')!,
  },
  {
    phrase: 'advance a pawn',
    intent: 'Any pawn push forward one or two squares.',
    predicate: {
      tag: 'and',
      all: [{ tag: 'piece', roles: ['pawn'] }, { tag: 'advances' }],
    },
  },
  {
    phrase: 'control the center',
    intent: 'Land on central d/e files around the fourth rank.',
    predicate: {
      tag: 'to',
      region: {
        files: { from: 'd', to: 'e' },
        ranks: { from: 4, to: 5 },
      },
    },
    gap: 'No occupancy or long-range control — region landing only.',
  },
  {
    phrase: 'capture',
    intent: 'Any capture.',
    predicate: { tag: 'captures' },
  },
  {
    phrase: 'develop a knight',
    intent: 'A back-rank knight that advances.',
    predicate: {
      tag: 'and',
      all: [
        { tag: 'piece', roles: ['knight'] },
        { tag: 'from', region: { ranks: { from: 1, to: 1 } } },
        { tag: 'advances' },
      ],
    },
  },
  {
    phrase: 'all knights advance',
    intent: 'One knight move that advances (not every knight).',
    predicate: {
      tag: 'and',
      all: [{ tag: 'piece', roles: ['knight'] }, { tag: 'advances' }],
    },
    gap: '"All" is not a cross-piece quantifier.',
  },
  {
    phrase: 'capture a queen or else a knight',
    intent: 'Capture a queen when possible, otherwise capture a knight.',
    predicate: {
      tag: 'prefer',
      options: [
        { tag: 'captures', roles: ['queen'] },
        { tag: 'captures', roles: ['knight'] },
      ],
    },
  },
  {
    phrase: 'castle or capture',
    intent: 'Castle or make any capture.',
    predicate: {
      tag: 'or',
      any: [{ tag: 'castles' }, { tag: 'captures' }],
    },
  },
]

const ADVANCED: readonly IntentExample[] = [
  {
    phrase: 'move the queen to safety',
    intent: 'Move the queen to a square that passes the safe heuristic.',
    predicate: {
      tag: 'and',
      all: [{ tag: 'piece', roles: ['queen'] }, { tag: 'safe' }],
    },
    gap: 'Does not require retreat — any safe queen move qualifies.',
  },
  {
    phrase: 'fork with knight if safe',
    intent: 'Knight fork on queen and king that lands safe.',
    predicate: {
      tag: 'and',
      all: [
        { tag: 'piece', roles: ['knight'] },
        { tag: 'attacks', roles: ['queen'] },
        { tag: 'attacks', roles: ['king'] },
        { tag: 'safe' },
      ],
    },
    gap: 'Full phrase exceeds 40 chars — shortened form for compile.',
  },
  {
    phrase: 'advance the rightmost pawn you can',
    intent: 'Prefer the h-pawn advance, then g, f, …',
    predicate: {
      tag: 'prefer',
      options: [
        {
          tag: 'and',
          all: [
            { tag: 'piece', roles: ['pawn'] },
            { tag: 'advances' },
            { tag: 'from', region: { files: { from: 'h', to: 'h' } } },
          ],
        },
        {
          tag: 'and',
          all: [
            { tag: 'piece', roles: ['pawn'] },
            { tag: 'advances' },
            { tag: 'from', region: { files: { from: 'g', to: 'g' } } },
          ],
        },
      ],
    },
    gap: "Absolute files — h-file is White's rightmost; full h→a chain truncated for node budget.",
  },
  {
    phrase: 'promote if safe',
    intent: 'Pawn promotion that lands safe.',
    predicate: {
      tag: 'and',
      all: [{ tag: 'promotes' }, { tag: 'safe' }],
    },
  },
  {
    phrase: 'force the trade to double up pawns',
    intent: 'Capture with a pawn to provoke a recapture.',
    predicate: {
      tag: 'and',
      all: [{ tag: 'piece', roles: ['pawn'] }, { tag: 'captures' }],
    },
    gap: 'Cannot express doubled-pawn structure or forcing recapture.',
  },
  {
    phrase: 'sacrifice the rook',
    intent: 'Rook move that captures (exchange sacrifice heuristic).',
    predicate: {
      tag: 'and',
      all: [{ tag: 'piece', roles: ['rook'] }, { tag: 'captures' }],
    },
    gap: 'True material sacrifice (hanging rook) is not modeled.',
  },
  {
    phrase: 'castle preferring kingside',
    intent: 'Kingside castle when legal, otherwise queenside.',
    predicate: {
      tag: 'prefer',
      options: [KINGSIDE_CASTLE, QUEENSIDE_CASTLE],
    },
  },
]

describe('command intent catalog', () => {
  describe('order log phrases', () => {
    it('e4 from the starting position', () => {
      expect(sans(Chess.default(), ORDER_LOG[0]!.predicate)).toEqual(['e4'])
    })

    it('Nf3 from the starting position', () => {
      expect(sans(Chess.default(), ORDER_LOG[1]!.predicate)).toEqual(['Nf3'])
    })

    it('advance a pawn — all pawn pushes from the start', () => {
      expect(sans(Chess.default(), ORDER_LOG[2]!.predicate)).toEqual([
        'a3',
        'a4',
        'b3',
        'b4',
        'c3',
        'c4',
        'd3',
        'd4',
        'e3',
        'e4',
        'f3',
        'f4',
        'g3',
        'g4',
        'h3',
        'h4',
      ])
    })

    it('control the center — d4 and e4 from the start', () => {
      expect(sans(Chess.default(), ORDER_LOG[3]!.predicate)).toEqual([
        'd4',
        'e4',
      ])
    })

    it('capture — rook takes rook', () => {
      const position = positionFromFen('7k/8/8/8/8/8/4r3/4R2K w - - 0 1')
      expect(sans(position, ORDER_LOG[4]!.predicate)).toEqual(['Rxe2'])
    })

    it('develop a knight — four knight hops from the start', () => {
      expect(sans(Chess.default(), ORDER_LOG[5]!.predicate)).toEqual([
        'Na3',
        'Nc3',
        'Nf3',
        'Nh3',
      ])
    })

    it('capture queen or else knight — prefers queen capture', () => {
      const position = positionFromFen('7k/8/8/3q4/8/4N3/8/K7 w - - 0 1')
      expect(sans(position, ORDER_LOG[7]!.predicate)).toEqual(['Nxd5'])
    })

    it('capture queen or else knight — falls back to knight capture', () => {
      const position = positionFromFen('7k/8/8/8/3n4/8/2N5/K7 w - - 0 1')
      expect(sans(position, ORDER_LOG[7]!.predicate)).toEqual(['Nxd4'])
    })

    it('castle or capture — both options in one position', () => {
      const position = positionFromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
      expect(sans(position, ORDER_LOG[8]!.predicate)).toEqual([
        'O-O',
        'O-O-O',
        'Rxa8+',
        'Rxh8+',
      ])
    })
  })

  describe('advanced phrases', () => {
    it('move the queen to safety — skips squares that lose material', () => {
      const position = positionFromFen('3r2k1/8/8/8/8/8/8/3Q2K1 w - - 0 1')
      const matched = sans(position, ADVANCED[0]!.predicate)
      expect(matched).toContain('Qc2')
      expect(matched).not.toContain('Qd2')
      expect(matched).not.toContain('Qd4')
    })

    it('promote if safe — only safe promotions', () => {
      const safePromo = positionFromFen('7k/1P6/8/8/8/8/8/K7 w - - 0 1')
      expect(sans(safePromo, ADVANCED[3]!.predicate)).toEqual(['b8=Q+'])
    })

    it('castle preferring kingside — O-O when both sides are legal', () => {
      const position = positionFromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
      expect(sans(position, ADVANCED[6]!.predicate)).toEqual(['O-O'])
    })

    it('castle preferring kingside — O-O-O when kingside is blocked', () => {
      const position = positionFromFen('r3k2r/8/8/8/8/8/8/R3KN1R w KQkq - 0 1')
      expect(sans(position, ADVANCED[6]!.predicate)).toEqual(['O-O-O'])
    })

    it('advance the rightmost pawn you can — h-pawn before g-pawn', () => {
      const position = positionFromFen(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      )
      expect(sans(position, ADVANCED[2]!.predicate)).toEqual(['h3', 'h4'])
    })

    it('advance the rightmost pawn you can — g-pawn when h-pawn is blocked', () => {
      const position = positionFromFen(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPP1/RNBQKBNR w KQkq - 0 1',
      )
      expect(sans(position, ADVANCED[2]!.predicate)).toEqual(['g3', 'g4'])
    })

    it('sacrifice the rook — rook captures only', () => {
      const position = positionFromFen('7k/8/8/8/8/8/4r3/4R2K w - - 0 1')
      expect(sans(position, ADVANCED[5]!.predicate)).toEqual(['Rxe2'])
    })
  })

  it('every catalog entry has a readable description', () => {
    for (const example of [...ORDER_LOG, ...ADVANCED]) {
      expect(describeCommandPredicate(example.predicate)).toMatch(/^a move /)
    }
  })
})
