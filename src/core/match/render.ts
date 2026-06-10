import type { Role } from 'chessops/types'
import { buildSuperpositionRenderModel } from '../superposition/build-render-model'
import type {
  ArrowCoordinate,
  ArrowSegment,
  FenBoardPosition,
  FenPieceSymbol,
  PiecePlacement,
  SuperpositionRenderModel,
} from '../superposition/types'
import type { BoardSquare, MatchState, PlayerId } from './model'
import { flipSquare } from './resolve'

const WHITE_SYMBOLS: Record<Role, FenPieceSymbol> = {
  pawn: 'P',
  knight: 'N',
  bishop: 'B',
  rook: 'R',
  queen: 'Q',
  king: 'K',
}

const BLACK_SYMBOLS: Record<Role, FenPieceSymbol> = {
  pawn: 'p',
  knight: 'n',
  bishop: 'b',
  rook: 'r',
  queen: 'q',
  king: 'k',
}

/**
 * Convert between a viewer's visual square and the canonical (player 1)
 * frame. Player 2 sees the board rank-flipped; the transform is its own
 * inverse, so this works in both directions.
 */
export function toCanonicalSquare(
  viewer: PlayerId,
  square: BoardSquare,
): BoardSquare {
  return viewer === 1 ? square : flipSquare(square)
}

export function squareToCoordinate(square: BoardSquare): ArrowCoordinate {
  return { col: square & 7, row: square >> 3 }
}

export function squareName(square: BoardSquare): string {
  return `${String.fromCharCode(97 + (square & 7))}${(square >> 3) + 1}`
}

function visualSquare(
  actual: BoardSquare,
  whiteOwner: PlayerId,
  viewer: PlayerId,
): BoardSquare {
  const canonical = whiteOwner === 1 ? actual : flipSquare(actual)
  return viewer === 1 ? canonical : flipSquare(canonical)
}

/**
 * Project the live match onto the unified superposition board as seen by
 * one player: their white games render as-is and their black games render
 * rank-flipped, so their own pieces are always closest to them.
 */
export function matchRenderModel(
  match: MatchState,
  viewer: PlayerId,
  selected: BoardSquare | null,
): SuperpositionRenderModel {
  const positions: FenBoardPosition[] = []
  for (const game of match.games) {
    if (game.status.tag !== 'active') {
      continue
    }
    const pieces: PiecePlacement[] = []
    for (const [square, piece] of game.position.board) {
      pieces.push({
        square: visualSquare(square, game.whiteOwner, viewer),
        piece:
          piece.color === 'white'
            ? WHITE_SYMBOLS[piece.role]
            : BLACK_SYMBOLS[piece.role],
      })
    }
    positions.push({ pieces })
  }

  const arrows: ArrowSegment[] = match.arrows.map((placed) => ({
    from: squareToCoordinate(toCanonicalSquare(viewer, placed.arrow.from)),
    to: squareToCoordinate(toCanonicalSquare(viewer, placed.arrow.to)),
  }))

  const base = buildSuperpositionRenderModel(positions, arrows)
  if (selected === null) {
    return base
  }
  return { ...base, highlight: squareToCoordinate(selected) }
}
