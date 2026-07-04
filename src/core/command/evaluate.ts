import { attacks } from 'chessops/attacks'
import type { Chess } from 'chessops/chess'
import { makeSan } from 'chessops/san'
import type { Color, NormalMove, Square } from 'chessops/types'
import { opposite, squareFile, squareRank } from 'chessops/util'
import {
  type CommandPredicate,
  FILE_LETTERS,
  type FileLetter,
  type PieceRole,
  type SquareRegion,
} from './model'
import { isSquareSafeAfterMove } from './safety'

/**
 * Rank as seen from the mover's side: 1 is the mover's back rank, 8 the
 * promotion rank. This is what makes region and direction predicates mean
 * the same positional idea for both colors.
 */
function relativeRank(square: Square, mover: Color): number {
  const rank = squareRank(square)
  return mover === 'white' ? rank + 1 : 8 - rank
}

/** Standard board rank (1 = White's back rank, 8 = Black's back rank). */
function boardRank(square: Square): number {
  return squareRank(square) + 1
}

function fileIndex(letter: FileLetter): number {
  return FILE_LETTERS.indexOf(letter)
}

function squareInRegion(
  square: Square,
  region: SquareRegion,
  mover: Color,
): boolean {
  if (region.files !== undefined) {
    const file = squareFile(square)
    if (
      file < fileIndex(region.files.from) ||
      file > fileIndex(region.files.to)
    ) {
      return false
    }
  }
  if (region.ranks !== undefined) {
    const rank =
      region.absolute === true ? boardRank(square) : relativeRank(square, mover)
    if (rank < region.ranks.from || rank > region.ranks.to) {
      return false
    }
  }
  return true
}

function isCastlingMove(position: Chess, move: NormalMove): boolean {
  const piece = position.board.get(move.from)
  if (piece === undefined || piece.role !== 'king') {
    return false
  }
  const target = position.board.get(move.to)
  if (target !== undefined && target.color === piece.color) {
    // King "takes" its own rook: chessops' canonical castling encoding.
    return target.role === 'rook'
  }
  return Math.abs(squareFile(move.to) - squareFile(move.from)) >= 2
}

function capturedRole(position: Chess, move: NormalMove): PieceRole | null {
  const mover = position.turn
  const target = position.board.get(move.to)
  if (target !== undefined) {
    return target.color === mover ? null : target.role
  }
  const piece = position.board.get(move.from)
  if (
    piece !== undefined &&
    piece.role === 'pawn' &&
    position.epSquare === move.to
  ) {
    return 'pawn'
  }
  return null
}

/** The square the moved piece actually occupies after the move. */
function finalSquare(position: Chess, move: NormalMove): Square {
  if (!isCastlingMove(position, move)) {
    return move.to
  }
  const rankStart = squareRank(move.from) * 8
  return squareFile(move.to) > squareFile(move.from)
    ? rankStart + 6
    : rankStart + 2
}

function movedPieceAttacksRole(
  position: Chess,
  move: NormalMove,
  roles: readonly PieceRole[],
): boolean {
  const mover = position.turn
  const after = position.clone()
  after.play(move)
  const square = finalSquare(position, move)
  const piece = after.board.get(square)
  if (piece === undefined || piece.color !== mover) {
    return false
  }
  const reach = attacks(piece, square, after.board.occupied)
  for (const role of roles) {
    if (reach.intersects(after.board.pieces(opposite(mover), role))) {
      return true
    }
  }
  return false
}

/**
 * Whether one candidate move in `position` satisfies the predicate. The
 * move is not required to be legal — callers enumerate legal moves — but
 * `from` must hold a piece of the side to move.
 */
export function moveMatches(
  position: Chess,
  move: NormalMove,
  predicate: CommandPredicate,
): boolean {
  const mover = position.turn
  switch (predicate.tag) {
    case 'piece': {
      const piece = position.board.get(move.from)
      return piece !== undefined && predicate.roles.includes(piece.role)
    }
    case 'from':
      return squareInRegion(move.from, predicate.region, mover)
    case 'to':
      return squareInRegion(
        finalSquare(position, move),
        predicate.region,
        mover,
      )
    case 'captures': {
      const captured = capturedRole(position, move)
      if (captured === null) {
        return false
      }
      return predicate.roles === undefined || predicate.roles.includes(captured)
    }
    case 'gives-check': {
      const after = position.clone()
      after.play(move)
      return after.isCheck()
    }
    case 'checkmates': {
      const after = position.clone()
      after.play(move)
      const outcome = after.outcome()
      return outcome !== undefined && outcome.winner === position.turn
    }
    case 'castles':
      return isCastlingMove(position, move)
    case 'promotes': {
      if (move.promotion !== undefined) {
        return true
      }
      const piece = position.board.get(move.from)
      return (
        piece !== undefined &&
        piece.role === 'pawn' &&
        relativeRank(move.to, mover) === 8
      )
    }
    case 'advances':
      return (
        relativeRank(finalSquare(position, move), mover) >
        relativeRank(move.from, mover)
      )
    case 'retreats':
      return (
        relativeRank(finalSquare(position, move), mover) <
        relativeRank(move.from, mover)
      )
    case 'attacks':
      return movedPieceAttacksRole(position, move, predicate.roles)
    case 'escapes':
      return position
        .kingAttackers(move.from, opposite(mover), position.board.occupied)
        .nonEmpty()
    case 'safe':
      return isSquareSafeAfterMove(position, move)
    case 'not':
      return !moveMatches(position, move, predicate.inner)
    case 'and':
      return predicate.all.every((child) => moveMatches(position, move, child))
    case 'or':
      return predicate.any.some((child) => moveMatches(position, move, child))
    case 'prefer':
      return predicate.options.some((child) =>
        moveMatches(position, move, child),
      )
  }
}

export function filterNormalMovesByPredicate(
  position: Chess,
  moves: readonly NormalMove[],
  predicate: CommandPredicate,
): NormalMove[] {
  return filterMovesByPredicate(position, moves, predicate)
}

function moveKey(move: NormalMove): string {
  return `${move.from}:${move.to}:${move.promotion ?? ''}`
}

function filterMovesByPredicate(
  position: Chess,
  moves: readonly NormalMove[],
  predicate: CommandPredicate,
): NormalMove[] {
  switch (predicate.tag) {
    case 'prefer': {
      for (const option of predicate.options) {
        const matched = filterMovesByPredicate(position, moves, option)
        if (matched.length > 0) {
          return matched
        }
      }
      return []
    }
    case 'and':
      return predicate.all.reduce<NormalMove[]>(
        (current, child) => filterMovesByPredicate(position, current, child),
        [...moves],
      )
    case 'or': {
      const seen = new Set<string>()
      const matched: NormalMove[] = []
      for (const child of predicate.any) {
        for (const move of filterMovesByPredicate(position, moves, child)) {
          const key = moveKey(move)
          if (seen.has(key)) {
            continue
          }
          seen.add(key)
          matched.push(move)
        }
      }
      return matched
    }
    case 'not':
      return moves.filter(
        (move) => !moveMatches(position, move, predicate.inner),
      )
    default:
      return moves.filter((move) => moveMatches(position, move, predicate))
  }
}

function legalNormalMoves(position: Chess): NormalMove[] {
  const moves: NormalMove[] = []
  for (const [from, dests] of position.allDests()) {
    const piece = position.board.get(from)
    for (const to of dests) {
      moves.push(
        piece !== undefined &&
          piece.role === 'pawn' &&
          relativeRank(to, position.turn) === 8
          ? { from, to, promotion: 'queen' }
          : { from, to },
      )
    }
  }
  return moves
}

export interface MatchingMove {
  readonly move: NormalMove
  readonly san: string
}

/**
 * All legal moves in `position` satisfying the predicate, deduplicated by
 * SAN (chessops lists castling under both its encodings) and sorted for
 * stable display. Pawn moves to the last rank promote to queen, matching
 * match resolution.
 */
export function matchingMoves(
  position: Chess,
  predicate: CommandPredicate,
): MatchingMove[] {
  const seen = new Set<string>()
  const matches: MatchingMove[] = []
  for (const move of filterMovesByPredicate(
    position,
    legalNormalMoves(position),
    predicate,
  )) {
    const san = makeSan(position, move)
    if (seen.has(san)) {
      continue
    }
    seen.add(san)
    matches.push({ move, san })
  }
  matches.sort((a, b) => a.san.localeCompare(b.san))
  return matches
}
