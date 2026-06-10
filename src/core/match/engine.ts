import type { Chess } from 'chessops/chess'
import type { NormalMove, Role } from 'chessops/types'
import { squareFile, squareRank } from 'chessops/util'
import { type RngState, pickIndex } from '../rng'
import { type MatchGame, positionKey } from './model'

const PIECE_VALUES: Record<Role, number> = {
  pawn: 1,
  knight: 3,
  bishop: 3.1,
  rook: 5,
  queen: 9,
  king: 0,
}

const MATE_SCORE = 1000
const QUEEN_PROMOTION_GAIN = PIECE_VALUES.queen - PIECE_VALUES.pawn
const SCORE_EPSILON = 1e-9

function legalNormalMoves(position: Chess): NormalMove[] {
  const moves: NormalMove[] = []
  for (const [from, dests] of position.allDests()) {
    const isPawn = position.board.getRole(from) === 'pawn'
    for (const to of dests) {
      const toRank = squareRank(to)
      if (isPawn && (toRank === 0 || toRank === 7)) {
        // Match rules: pawns always promote to queens.
        moves.push({ from, to, promotion: 'queen' })
      } else {
        moves.push({ from, to })
      }
    }
  }
  return moves
}

function captureValue(position: Chess, move: NormalMove): number {
  const captured = position.board.getRole(move.to)
  let value = captured === undefined ? 0 : PIECE_VALUES[captured]
  if (position.board.getRole(move.from) === 'pawn' && captured === undefined) {
    // En passant: the destination square is empty but a pawn is taken.
    if (move.to === position.epSquare) {
      value += PIECE_VALUES.pawn
    }
  }
  if (move.promotion !== undefined) {
    value += QUEEN_PROMOTION_GAIN
  }
  return value
}

function bestReplyGain(position: Chess): number {
  let best = 0
  for (const [from, dests] of position.allDests()) {
    const isPawn = position.board.getRole(from) === 'pawn'
    for (const to of dests) {
      const captured = position.board.getRole(to)
      let gain = captured === undefined ? 0 : PIECE_VALUES[captured]
      if (isPawn && captured === undefined && to === position.epSquare) {
        gain += PIECE_VALUES.pawn
      }
      if (isPawn && (squareRank(to) === 0 || squareRank(to) === 7)) {
        gain += QUEEN_PROMOTION_GAIN
      }
      if (gain > best) {
        best = gain
      }
    }
  }
  return best
}

function materialOf(position: Chess, color: 'white' | 'black'): number {
  let total = 0
  for (const [, piece] of position.board) {
    if (piece.color === color) {
      total += PIECE_VALUES[piece.role]
    }
  }
  return total
}

function centerCloseness(square: number): number {
  const file = squareFile(square)
  const rank = squareRank(square)
  return 3.5 - Math.abs(file - 3.5) + (3.5 - Math.abs(rank - 3.5))
}

/**
 * When far ahead in material, reward squeezing the enemy king toward the
 * edge and bringing our own king closer, so games actually reach mate
 * instead of shuffling into fifty-move draws.
 */
function matingDriveBonus(after: Chess, mover: 'white' | 'black'): number {
  const opponent = mover === 'white' ? 'black' : 'white'
  const myMaterial = materialOf(after, mover)
  const theirMaterial = materialOf(after, opponent)
  if (myMaterial - theirMaterial < 4 || theirMaterial > 3) {
    return 0
  }
  const myKing = after.board.kingOf(mover)
  const theirKing = after.board.kingOf(opponent)
  if (myKing === undefined || theirKing === undefined) {
    return 0
  }
  const kingDistance =
    Math.abs(squareFile(myKing) - squareFile(theirKing)) +
    Math.abs(squareRank(myKing) - squareRank(theirKing))
  return (7 - centerCloseness(theirKing)) * 0.2 + (14 - kingDistance) * 0.1
}

function scoreMove(game: MatchGame, move: NormalMove): number {
  const position = game.position
  const mover = position.turn
  const after = position.clone()
  after.play(move)

  if (after.isCheckmate()) {
    return MATE_SCORE
  }
  if (after.isStalemate() || after.isInsufficientMaterial()) {
    // A dead draw is only attractive when behind on material.
    return (
      materialOf(position, mover === 'white' ? 'black' : 'white') -
      materialOf(position, mover)
    )
  }

  let score = captureValue(position, move) - bestReplyGain(after)
  score += (centerCloseness(move.to) - centerCloseness(move.from)) * 0.02
  score += matingDriveBonus(after, mover)

  const seen = game.repetition.get(positionKey(after)) ?? 0
  if (seen >= 2) {
    score -= 3
  } else if (seen >= 1) {
    score -= 0.3
  }
  return score
}

/**
 * Deterministic fallback engine: shallow material search with a mating
 * drive heuristic. Determinism (same position + same rng state => same
 * move) is what keeps two peers' simulations in lockstep.
 */
export function chooseEngineMove(
  game: MatchGame,
  rng: RngState,
): readonly [NormalMove, RngState] {
  const moves = legalNormalMoves(game.position)
  if (moves.length === 0) {
    throw new Error('chooseEngineMove called on a finished game')
  }

  let bestScore = Number.NEGATIVE_INFINITY
  let bestMoves: NormalMove[] = []
  for (const move of moves) {
    const score = scoreMove(game, move)
    if (score > bestScore + SCORE_EPSILON) {
      bestScore = score
      bestMoves = [move]
    } else if (score > bestScore - SCORE_EPSILON) {
      bestMoves.push(move)
    }
  }

  const [pick, nextRng] = pickIndex(rng, bestMoves.length)
  const chosen = bestMoves[pick]
  if (chosen === undefined) {
    throw new Error('Engine move selection failed')
  }
  return [chosen, nextRng]
}
