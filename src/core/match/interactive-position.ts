import type { Key } from 'chessground/types'
import type { Chess } from 'chessops/chess'
import { makeFen } from 'chessops/fen'
import { makeSan } from 'chessops/san'
import type { Color, NormalMove, Square } from 'chessops/types'
import { makeSquare, parseSquare, squareRank } from 'chessops/util'
import {
  type MatchGame,
  type MatchState,
  type PlayerId,
  sideToMove,
} from './model'
import { movingOwner } from './resolve'

export interface InteractiveBoardSnapshot {
  readonly fen: string
  readonly orientation: Color
  readonly turnColor: Color
  readonly movableColor: Color
}

/** Active game used to drive drag-and-click command entry. */
export function pickInteractiveGame(
  match: MatchState,
  viewer: PlayerId,
): MatchGame | null {
  const active = match.games.filter((game) => game.status.tag === 'active')
  if (active.length === 0) {
    return null
  }
  const turn = sideToMove(match)
  const onSide = active.filter(
    (game) => game.position.turn === turn && movingOwner(game) === viewer,
  )
  const pool = onSide.length > 0 ? onSide : active
  return pool.reduce((best, game) => (game.id < best.id ? game : best))
}

export function viewerOrientation(game: MatchGame, viewer: PlayerId): Color {
  return game.whiteOwner === viewer ? 'white' : 'black'
}

export function interactiveBoardSnapshot(
  match: MatchState,
  viewer: PlayerId,
): InteractiveBoardSnapshot | null {
  const game = pickInteractiveGame(match, viewer)
  if (game === null) {
    return null
  }
  const turnColor = game.position.turn
  return {
    fen: makeFen(game.position.toSetup()),
    orientation: viewerOrientation(game, viewer),
    turnColor,
    movableColor: turnColor,
  }
}

/** Chessground dest map for every legal root move in `position`. */
export function chessgroundDests(position: Chess): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>()
  for (const [from, targets] of position.allDests()) {
    dests.set(
      makeSquare(from) as Key,
      [...targets].map((to) => makeSquare(to) as Key),
    )
  }
  return dests
}

function legalMoveForSquares(
  position: Chess,
  from: Square,
  to: Square,
): NormalMove | null {
  const piece = position.board.get(from)
  if (piece === undefined) {
    return null
  }
  const promotions =
    piece.role === 'pawn' && (squareRank(to) === 0 || squareRank(to) === 7)
      ? (['queen', 'rook', 'bishop', 'knight'] as const)
      : [undefined]
  for (const promotion of promotions) {
    const move: NormalMove =
      promotion === undefined ? { from, to } : { from, to, promotion }
    if (position.isLegal(move)) {
      return move
    }
  }
  return null
}

/** Turn a board interaction into command text (SAN, check/mate sigils stripped). */
export function commandTextForSquares(
  position: Chess,
  orig: string,
  dest: string,
): string | null {
  const from = parseSquare(orig)
  const to = parseSquare(dest)
  if (from === undefined || to === undefined) {
    return null
  }
  const move = legalMoveForSquares(position, from, to)
  if (move === null) {
    return null
  }
  return makeSan(position, move).replace(/[+#]$/, '')
}
