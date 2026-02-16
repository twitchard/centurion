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
}
