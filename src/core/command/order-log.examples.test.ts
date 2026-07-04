import { Chess } from 'chessops/chess'
import { parseFen } from 'chessops/fen'
import { describe, expect, it } from 'vitest'
import { describeCommandPredicate } from './describe'
import { matchingMoves } from './evaluate'
import type { CommandPredicate } from './model'
import { tryCompileLiteralNotation } from './parse-notation'

/**
 * Canonical predicates for commands that appear in the order log UI.
 *
 * These are the *intended* NL→predicate mappings (see prompt few-shots and
 * compile-eval phrases). Unit tests lock down evaluation semantics on concrete
 * positions; the live LLM compiler is exercised separately via `command:eval`.
 */

function positionFromFen(fen: string): Chess {
  return Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
}

function sans(position: Chess, predicate: CommandPredicate): string[] {
  return matchingMoves(position, predicate).map((match) => match.san)
}

/** Occupying or landing on the central d/e files around the fourth rank. */
const CONTROL_THE_CENTER: CommandPredicate = {
  tag: 'to',
  region: {
    files: { from: 'd', to: 'e' },
    ranks: { from: 4, to: 5 },
  },
}

const ADVANCE_A_PAWN: CommandPredicate = {
  tag: 'and',
  all: [{ tag: 'piece', roles: ['pawn'] }, { tag: 'advances' }],
}

const DEVELOP_A_KNIGHT: CommandPredicate = {
  tag: 'and',
  all: [
    { tag: 'piece', roles: ['knight'] },
    { tag: 'from', region: { ranks: { from: 1, to: 1 } } },
    { tag: 'advances' },
  ],
}

const DEVELOP_A_KNIGHT_TOWARDS_THE_CENTER: CommandPredicate = {
  tag: 'and',
  all: [
    { tag: 'piece', roles: ['knight'] },
    { tag: 'from', region: { ranks: { from: 1, to: 1 } } },
    { tag: 'advances' },
    { tag: 'to', region: { files: { from: 'c', to: 'f' } } },
  ],
}

const CAPTURE_A_MAJOR_PIECE: CommandPredicate = {
  tag: 'captures',
  roles: ['queen', 'rook'],
}

/** Flat OR — the DSL has no priority / "or else" fallback ordering. */
const CAPTURE_QUEEN_OR_ELSE_KNIGHT: CommandPredicate = {
  tag: 'or',
  any: [
    { tag: 'captures', roles: ['queen'] },
    { tag: 'captures', roles: ['knight'] },
  ],
}

const CASTLE_OR_CAPTURE: CommandPredicate = {
  tag: 'or',
  any: [{ tag: 'castles' }, { tag: 'captures' }],
}

const DEVELOP_BISHOP_OR_CHECK: CommandPredicate = {
  tag: 'or',
  any: [
    {
      tag: 'and',
      all: [
        { tag: 'piece', roles: ['bishop'] },
        { tag: 'from', region: { ranks: { from: 1, to: 1 } } },
        { tag: 'advances' },
      ],
    },
    { tag: 'gives-check' },
  ],
}

const ALL_KNIGHTS_ADVANCE: CommandPredicate = {
  tag: 'and',
  all: [{ tag: 'piece', roles: ['knight'] }, { tag: 'advances' }],
}

describe('order log command examples', () => {
  describe('literal notation (no LLM)', () => {
    it('e4 — pawn to the absolute square e4', () => {
      const predicate = tryCompileLiteralNotation('e4')
      expect(predicate).not.toBeNull()
      expect(describeCommandPredicate(predicate!)).toBe(
        'a move by a pawn and ending on e4',
      )
      expect(sans(Chess.default(), predicate!)).toEqual(['e4'])
    })

    it('Nf3 — knight to the absolute square f3', () => {
      const predicate = tryCompileLiteralNotation('Nf3')
      expect(predicate).not.toBeNull()
      expect(sans(Chess.default(), predicate!)).toEqual(['Nf3'])
    })

    it('e5 — pawn to e5 for Black after 1.e4', () => {
      const afterE4 = positionFromFen(
        'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      )
      const predicate = tryCompileLiteralNotation('e5')
      expect(predicate).not.toBeNull()
      expect(sans(afterE4, predicate!)).toEqual(['e5'])
    })
  })

  describe('advance a pawn', () => {
    it('matches every one-square pawn push from the start', () => {
      expect(describeCommandPredicate(ADVANCE_A_PAWN)).toBe(
        'a move by a pawn and that advances',
      )
      expect(sans(Chess.default(), ADVANCE_A_PAWN)).toEqual([
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
  })

  describe('control the center', () => {
    it('approximates center control as landing on d/e around the fourth rank', () => {
      expect(describeCommandPredicate(CONTROL_THE_CENTER)).toBe(
        'a move ending on files d-e and your ranks 4-5',
      )
      const matched = sans(Chess.default(), CONTROL_THE_CENTER)
      expect(matched).toEqual(['d4', 'e4'])
      expect(matched).not.toContain('c4')
    })
  })

  describe('capture', () => {
    it('matches any capture when no role filter is given', () => {
      const position = positionFromFen('7k/8/8/8/8/8/4r3/4R2K w - - 0 1')
      expect(sans(position, { tag: 'captures' })).toEqual(['Rxe2'])
    })
  })

  describe('develop a knight', () => {
    it('requires a back-rank knight that advances', () => {
      expect(sans(Chess.default(), DEVELOP_A_KNIGHT)).toEqual([
        'Na3',
        'Nc3',
        'Nf3',
        'Nh3',
      ])
    })
  })

  describe('develop a knight towards the center', () => {
    it('keeps only central-file knight developments', () => {
      expect(
        sans(Chess.default(), DEVELOP_A_KNIGHT_TOWARDS_THE_CENTER),
      ).toEqual(['Nc3', 'Nf3'])
    })
  })

  describe('capture a major piece', () => {
    it('matches captures of queens and rooks only', () => {
      const position = positionFromFen('7k/8/8/3q4/8/4N3/8/K7 w - - 0 1')
      expect(sans(position, CAPTURE_A_MAJOR_PIECE)).toEqual(['Nxd5'])
    })
  })

  describe('capture a queen or else a knight', () => {
    it('matches a queen capture when one is available', () => {
      const position = positionFromFen('7k/8/8/3q4/8/4N3/8/K7 w - - 0 1')
      expect(sans(position, CAPTURE_QUEEN_OR_ELSE_KNIGHT)).toEqual(['Nxd5'])
    })

    it('matches a knight capture when no queen capture exists', () => {
      const position = positionFromFen('7k/8/8/8/3n4/8/2N5/K7 w - - 0 1')
      expect(sans(position, CAPTURE_QUEEN_OR_ELSE_KNIGHT)).toEqual(['Nxd4'])
    })
  })

  describe('castle or capture', () => {
    it('accepts castling or any capture in the same position', () => {
      const position = positionFromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
      const matched = sans(position, CASTLE_OR_CAPTURE)
      expect(matched).toEqual(['O-O', 'O-O-O', 'Rxa8+', 'Rxh8+'])
    })
  })

  describe('develop a bishop or check the king', () => {
    it('accepts a developing bishop move or any checking move', () => {
      const position = positionFromFen(
        'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
      )
      const matched = sans(position, DEVELOP_BISHOP_OR_CHECK)
      expect(matched).toContain('Bc4')
      expect(matched).toContain('Bb5')
      expect(matched).not.toContain('e5')
    })

    it('accepts a check even when no bishop can develop', () => {
      const position = positionFromFen('7k/8/8/8/8/8/R7/K7 w - - 0 1')
      expect(sans(position, DEVELOP_BISHOP_OR_CHECK)).toEqual(['Ra8+', 'Rh2+'])
    })
  })

  describe('all knights advance', () => {
    it('means one knight move that advances, not every knight at once', () => {
      expect(describeCommandPredicate(ALL_KNIGHTS_ADVANCE)).toBe(
        'a move by a knight and that advances',
      )
      expect(sans(Chess.default(), ALL_KNIGHTS_ADVANCE)).toEqual([
        'Na3',
        'Nc3',
        'Nf3',
        'Nh3',
      ])
    })
  })
})
