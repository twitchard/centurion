import { BISHOP, KING, KNIGHT, QUEEN, ROOK } from './types'

/** Material values by piece type index */
export const PIECE_VALUES = [0, 100, 320, 330, 500, 900, 20000]

/** Piece name strings indexed by type */
export const PIECE_NAMES = ['', 'P', 'N', 'B', 'R', 'Q', 'K'] as const

/** Knight move offsets [dFile, dRank] */
export const KNIGHT_DIRS: [number, number][] = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
]

/** King move offsets */
export const KING_DIRS: [number, number][] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
]

/** Rook slide directions */
export const ROOK_DIRS: [number, number][] = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
]

/** Bishop slide directions */
export const BISHOP_DIRS: [number, number][] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

/** Queen slide directions (rook + bishop) */
export const QUEEN_DIRS = [...ROOK_DIRS, ...BISHOP_DIRS]

/** Directions by piece type */
export const SLIDE_DIRS: Record<number, [number, number][]> = {
  [ROOK]: ROOK_DIRS,
  [BISHOP]: BISHOP_DIRS,
  [QUEEN]: QUEEN_DIRS,
}

/** Piece-square tables for evaluation */
export const PST_PAWN = [
  0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, -5, -5, 10, 10, 5, 5, -5, -10, 0, 0, -10,
  -5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, 5, 10, 25, 25, 10, 5, 5, 10, 10, 20, 30,
  30, 20, 10, 10, 50, 50, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 0, 0, 0,
]

export const PST_KNIGHT = [
  -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 5, 5, 0, -20, -40, -30,
  5, 10, 15, 15, 10, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 15, 20, 20,
  15, 5, -30, -30, 0, 10, 15, 15, 10, 0, -30, -40, -20, 0, 0, 0, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
]

export const PST_KING = [
  -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40,
  -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40,
  -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20,
  -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
]

/** Initial back rank piece order */
export const BACK_RANK = [
  ROOK,
  KNIGHT,
  BISHOP,
  QUEEN,
  KING,
  BISHOP,
  KNIGHT,
  ROOK,
]
