import type { Role } from 'chessops/types'
import { buildSuperpositionRenderModel } from '../superposition/build-render-model'
import type {
  ArrowCoordinate,
  FenBoardPosition,
  FenPieceSymbol,
  PiecePlacement,
  SuperpositionRenderModel,
} from '../superposition/types'
import {
  type BoardSquare,
  type MatchGame,
  type MatchState,
  type PlayerId,
  otherPlayer,
} from './model'
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

export function squareName(square: BoardSquare): string {
  return `${String.fromCharCode(97 + (square & 7))}${(square >> 3) + 1}`
}

export function squareToCoordinate(square: BoardSquare): ArrowCoordinate {
  return { col: square & 7, row: square >> 3 }
}

export function visualSquare(
  actual: BoardSquare,
  whiteOwner: PlayerId,
  viewer: PlayerId,
): BoardSquare {
  const canonical = whiteOwner === 1 ? actual : flipSquare(actual)
  return viewer === 1 ? canonical : flipSquare(canonical)
}

/** Inverse of `visualSquare` for mapping canvas taps back to chess squares. */
export function actualSquare(
  visual: BoardSquare,
  whiteOwner: PlayerId,
  viewer: PlayerId,
): BoardSquare {
  const canonical = viewer === 1 ? visual : flipSquare(visual)
  return whiteOwner === 1 ? canonical : flipSquare(canonical)
}

export function boardSquareFromCoordinate(coord: ArrowCoordinate): BoardSquare {
  return ((coord.row << 3) | coord.col) as BoardSquare
}

/**
 * The glyph a piece renders as for one viewer: pieces are colored by
 * ownership, not chess color, so the viewer's pieces are always white
 * symbols and the opponent's black.
 */
export function visualPieceSymbol(
  piece: { readonly color: 'white' | 'black'; readonly role: Role },
  whiteOwner: PlayerId,
  viewer: PlayerId,
): FenPieceSymbol {
  const owner = piece.color === 'white' ? whiteOwner : otherPlayer(whiteOwner)
  return owner === viewer
    ? WHITE_SYMBOLS[piece.role]
    : BLACK_SYMBOLS[piece.role]
}

/** One game's pieces projected onto the viewer's visual board frame. */
export function gameVisualPieces(
  game: MatchGame,
  viewer: PlayerId,
): PiecePlacement[] {
  const pieces: PiecePlacement[] = []
  for (const [square, piece] of game.position.board) {
    pieces.push({
      square: visualSquare(square, game.whiteOwner, viewer),
      piece: visualPieceSymbol(piece, game.whiteOwner, viewer),
    })
  }
  return pieces
}

/**
 * Project the live match onto the unified superposition board as seen by
 * one player. The white owner's games render in the canonical frame; the
 * black owner's games render rank-flipped, so each player's own pieces
 * are always closest to them.
 *
 * Pieces are colored by ownership, not by chess color: the viewer's
 * pieces always render white and the opponent's black.
 */
export function matchRenderModel(
  match: MatchState,
  viewer: PlayerId,
): SuperpositionRenderModel {
  const positions: FenBoardPosition[] = []
  for (const game of match.games) {
    if (game.status.tag !== 'active') {
      continue
    }
    positions.push({ pieces: gameVisualPieces(game, viewer) })
  }
  const base = buildSuperpositionRenderModel(positions, [])
  return { ...base, viewerPlayer: viewer }
}
