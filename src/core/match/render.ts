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
import {
  type BoardSquare,
  type MatchState,
  type PlayerId,
  otherPlayer,
} from './model'
import { type PendingResolution, flipSquare } from './resolve'

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
 *
 * Pieces are colored by ownership, not by each game's chess color: the
 * viewer's pieces always render white and the opponent's black. Without
 * this, a board that mixes the viewer's white and black games would make
 * ownership invisible.
 *
 * While a turn is mid-resolution (Stockfish still computing), pass the
 * pending resolution so the just-placed arrow and any games it already
 * moved appear immediately instead of after the engine finishes.
 */
export function matchRenderModel(
  match: MatchState,
  viewer: PlayerId,
  selected: BoardSquare | null,
  resolving: PendingResolution | null = null,
): SuperpositionRenderModel {
  const games = resolving === null ? match.games : resolving.games
  const placedArrows = resolving === null ? match.arrows : resolving.arrows

  const positions: FenBoardPosition[] = []
  for (const game of games) {
    if (game.status.tag !== 'active') {
      continue
    }
    const pieces: PiecePlacement[] = []
    for (const [square, piece] of game.position.board) {
      const owner =
        piece.color === 'white' ? game.whiteOwner : otherPlayer(game.whiteOwner)
      pieces.push({
        square: visualSquare(square, game.whiteOwner, viewer),
        piece:
          owner === viewer
            ? WHITE_SYMBOLS[piece.role]
            : BLACK_SYMBOLS[piece.role],
      })
    }
    positions.push({ pieces })
  }

  // Collapse stacked copies (same squares, same player) into one segment
  // with a count; a re-placed arrow moves to the end of the order so the
  // whole stack renders as fresh as its newest copy.
  const stacks = new Map<string, ArrowSegment>()
  for (const placed of placedArrows) {
    const key = `${placed.arrow.from}-${placed.arrow.to}-${placed.placedBy}`
    const existing = stacks.get(key)
    if (existing !== undefined) {
      stacks.delete(key)
      stacks.set(key, { ...existing, count: (existing.count ?? 1) + 1 })
      continue
    }
    stacks.set(key, {
      from: squareToCoordinate(toCanonicalSquare(viewer, placed.arrow.from)),
      to: squareToCoordinate(toCanonicalSquare(viewer, placed.arrow.to)),
      owner: placed.placedBy,
      count: 1,
    })
  }
  const arrows: ArrowSegment[] = [...stacks.values()]

  const base = buildSuperpositionRenderModel(positions, arrows)
  if (selected === null) {
    return base
  }
  return { ...base, highlight: squareToCoordinate(selected) }
}
