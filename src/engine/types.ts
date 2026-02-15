/** Piece type constants (positive = white, negative = black) */
export const PAWN = 1
export const KNIGHT = 2
export const BISHOP = 3
export const ROOK = 4
export const QUEEN = 5
export const KING = 6

export type PieceType = 1 | 2 | 3 | 4 | 5 | 6
export type Color = 1 | -1 // 1 = white, -1 = black

/** A square index 0-63 (rank * 8 + file) */
export type Square = number

export interface Move {
  from: Square
  to: Square
  castle?: 'K' | 'Q'
  isEp?: boolean
  /** Saved state for undo */
  _captured?: number
  _castling?: number
  _ep?: number
  _halfmove?: number
  _promoted?: boolean
  _epCapture?: number
}

/** Game result: 0 = ongoing, 1 = white wins, -1 = black wins, 2 = draw */
export type GameResult = 0 | 1 | -1 | 2
