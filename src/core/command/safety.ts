import { attacks } from 'chessops/attacks'
import type { Chess } from 'chessops/chess'
import type { Color, NormalMove, Piece, Square } from 'chessops/types'
import { opposite, squareFile } from 'chessops/util'
import type { PieceRole } from './model'

/** Material weight for the safety cascade heuristic. */
const PIECE_VALUE: Record<PieceRole, number> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 100,
}

function pieceValue(piece: Piece): number {
  return PIECE_VALUE[piece.role]
}

function isCastlingMove(position: Chess, move: NormalMove): boolean {
  const piece = position.board.get(move.from)
  if (piece === undefined || piece.role !== 'king') {
    return false
  }
  const target = position.board.get(move.to)
  if (target !== undefined && target.color === piece.color) {
    return target.role === 'rook'
  }
  return Math.abs(squareFile(move.to) - squareFile(move.from)) >= 2
}

/** Square the moved piece occupies after the move (castling-aware). */
function finalSquare(position: Chess, move: NormalMove): Square {
  if (!isCastlingMove(position, move)) {
    return move.to
  }
  const rankStart = Math.floor(move.from / 8) * 8
  return squareFile(move.to) > squareFile(move.from)
    ? rankStart + 6
    : rankStart + 2
}

function sortedExchangeValues(
  position: Chess,
  square: Square,
  mover: Color,
): { attackers: number[]; defenders: number[] } {
  const opponent = opposite(mover)
  const occupied = position.board.occupied
  const attackers: number[] = []
  const defenders: number[] = []

  for (const attackerSquare of occupied) {
    const piece = position.board.get(attackerSquare)
    if (piece === undefined || piece.color !== opponent) {
      continue
    }
    const reach = attacks(piece, attackerSquare, occupied)
    if (reach.has(square)) {
      attackers.push(pieceValue(piece))
    }
  }

  for (const defenderSquare of occupied) {
    const piece = position.board.get(defenderSquare)
    if (piece === undefined || piece.color !== mover) {
      continue
    }
    const reach = attacks(piece, defenderSquare, occupied)
    if (reach.has(square)) {
      defenders.push(pieceValue(piece))
    }
  }

  attackers.sort((a, b) => a - b)
  defenders.sort((a, b) => a - b)
  return { attackers, defenders }
}

/**
 * Simplified exchange cascade: sides alternately capture with their
 * cheapest remaining piece. Defenders are ahead when they still hold the
 * square after the attacker runs out of capturers.
 */
function defendersAheadInCascade(
  attackers: readonly number[],
  defenders: readonly number[],
): boolean {
  const atk = attackers.slice()
  const def = defenders.slice()
  while (atk.length > 0) {
    atk.shift()
    if (def.length === 0) {
      return false
    }
    def.shift()
  }
  return true
}

/**
 * Heuristic safety after a move: safe when no enemy piece attacks the
 * destination, or when defenders win a simplified exchange cascade on that
 * square (lowest-value pieces trade first; pins and overloads ignored).
 */
export function isSquareSafeAfterMove(
  position: Chess,
  move: NormalMove,
): boolean {
  const after = position.clone()
  after.play(move)
  const mover = position.turn
  const square = finalSquare(position, move)
  const piece = after.board.get(square)
  if (piece === undefined || piece.color !== mover) {
    return false
  }

  const { attackers, defenders } = sortedExchangeValues(after, square, mover)
  if (attackers.length === 0) {
    return true
  }
  return defendersAheadInCascade(attackers, defenders)
}
