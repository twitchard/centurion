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
  type BoardArrow,
  type BoardSquare,
  type MatchGame,
  type MatchState,
  type PlayerId,
  arrowPullWeight,
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

export function visualSquare(
  actual: BoardSquare,
  whiteOwner: PlayerId,
  viewer: PlayerId,
): BoardSquare {
  const canonical = whiteOwner === 1 ? actual : flipSquare(actual)
  return viewer === 1 ? canonical : flipSquare(canonical)
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

/** The arrow layer for the viewer, weighted at the match's current turn. */
export function matchArrowSegments(
  match: MatchState,
  viewer: PlayerId,
  placedArrows: readonly BoardArrow[] = match.arrows,
): ArrowSegment[] {
  const arrows: ArrowSegment[] = []
  for (const boardArrow of placedArrows) {
    const weight = arrowPullWeight(
      boardArrow.cardinality,
      boardArrow.placedTurn,
      match.turn,
    )
    if (weight === 0) {
      continue
    }
    arrows.push({
      from: squareToCoordinate(toCanonicalSquare(viewer, boardArrow.from)),
      to: squareToCoordinate(toCanonicalSquare(viewer, boardArrow.to)),
      owner: boardArrow.owner,
      count: weight,
    })
  }
  return arrows
}

/**
 * Project the live match onto the unified superposition board as seen by
 * one player. The white owner's games render in the canonical frame; the
 * black owner's games render rank-flipped, so each player's own pieces
 * are always closest to them.
 *
 * Pieces are colored by ownership, not by chess color: the viewer's
 * pieces always render white and the opponent's black.
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
    positions.push({ pieces: gameVisualPieces(game, viewer) })
  }

  const arrows = matchArrowSegments(match, viewer, placedArrows)

  const base = buildSuperpositionRenderModel(positions, arrows)
  if (selected === null) {
    return { ...base, viewerPlayer: viewer }
  }
  return {
    ...base,
    viewerPlayer: viewer,
    highlight: squareToCoordinate(selected),
  }
}
