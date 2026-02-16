import type {
  ArrowSegment,
  FenBoardPosition,
  FenPieceSymbol,
  PieceStack,
  SquareLayer,
  SuperpositionRenderModel,
} from './types'

const PIECE_ORDER: Record<FenPieceSymbol, number> = {
  K: 12,
  Q: 11,
  R: 10,
  B: 9,
  N: 8,
  P: 7,
  k: 6,
  q: 5,
  r: 4,
  b: 3,
  n: 2,
  p: 1,
}

export function buildSuperpositionRenderModel(
  positions: readonly FenBoardPosition[],
  arrows: readonly ArrowSegment[],
): SuperpositionRenderModel {
  const bySquare = new Map<number, Map<FenPieceSymbol, number>>()

  for (const position of positions) {
    for (const placement of position.pieces) {
      const pieceMap =
        bySquare.get(placement.square) ?? new Map<FenPieceSymbol, number>()
      bySquare.set(placement.square, pieceMap)
      pieceMap.set(placement.piece, (pieceMap.get(placement.piece) ?? 0) + 1)
    }
  }

  const layers: SquareLayer[] = []
  for (const [square, pieceMap] of bySquare.entries()) {
    const stacks: PieceStack[] = []
    for (const [piece, count] of pieceMap.entries()) {
      stacks.push({ piece, count })
    }
    stacks.sort(
      (left, right) => PIECE_ORDER[right.piece] - PIECE_ORDER[left.piece],
    )
    layers.push({ square, stacks })
  }
  layers.sort((left, right) => left.square - right.square)

  return {
    squareLayers: layers,
    arrows,
    positionCount: positions.length > 0 ? positions.length : 1,
  }
}
