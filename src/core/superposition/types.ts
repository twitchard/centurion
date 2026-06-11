export type FenPieceSymbol =
  | 'P'
  | 'N'
  | 'B'
  | 'R'
  | 'Q'
  | 'K'
  | 'p'
  | 'n'
  | 'b'
  | 'r'
  | 'q'
  | 'k'

export interface PiecePlacement {
  readonly square: number
  readonly piece: FenPieceSymbol
}

export interface FenBoardPosition {
  readonly pieces: readonly PiecePlacement[]
}

export interface ArrowCoordinate {
  readonly col: number
  readonly row: number
}

export interface ArrowSegment {
  readonly from: ArrowCoordinate
  readonly to: ArrowCoordinate
  /** Which player placed it (1 = gold, 2 = crimson); unowned arrows render neutral. */
  readonly owner?: 1 | 2
  /** Stack size: how many copies of this arrow have been placed. */
  readonly count?: number
}

/**
 * A single game's piece mid-transition, drawn on top of the aggregated
 * board. Slides glide from origin to destination (arrow-driven moves,
 * with emphasis); fades dissolve at the origin and reappear at the
 * destination (engine moves).
 */
export interface PieceMoveOverlay {
  readonly piece: FenPieceSymbol
  readonly from: ArrowCoordinate
  readonly to: ArrowCoordinate
  /** 0 at the start of this piece's transition, 1 at the end. */
  readonly progress: number
  readonly kind: 'slide' | 'fade'
}

export interface PieceStack {
  readonly piece: FenPieceSymbol
  readonly count: number
}

export interface SquareLayer {
  readonly square: number
  readonly stacks: readonly PieceStack[]
}

export interface SuperpositionRenderModel {
  readonly squareLayers: readonly SquareLayer[]
  readonly arrows: readonly ArrowSegment[]
  readonly positionCount: number
  readonly highlight?: ArrowCoordinate
}
