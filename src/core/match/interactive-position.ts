import type { Chess } from 'chessops/chess'
import { makeSan } from 'chessops/san'
import type { NormalMove, Square } from 'chessops/types'
import { parseSquare, squareRank } from 'chessops/util'
import type { ArrowCoordinate } from '../superposition/types'
import {
  type MatchGame,
  type MatchState,
  type PlayerId,
  activePlacer,
  sideToMove,
} from './model'
import { actualSquare, boardSquareFromCoordinate, squareName } from './render'
import { movingOwner } from './resolve'

/** Active game used to drive two-square command entry on the canvas. */
export function pickInteractiveGame(
  match: MatchState,
  commander: PlayerId,
): MatchGame | null {
  const active = match.games.filter((game) => game.status.tag === 'active')
  if (active.length === 0) {
    return null
  }
  const turn = sideToMove(match)
  const onSide = active.filter(
    (game) => game.position.turn === turn && movingOwner(game) === commander,
  )
  const pool = onSide.length > 0 ? onSide : active
  return pool.reduce((best, game) => (game.id < best.id ? game : best))
}

/** Commander whose half-move canvas taps should target. */
export function interactiveCommander(match: MatchState): PlayerId {
  return activePlacer(match)
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

/** Turn chess squares into command text (SAN, check/mate sigils stripped). */
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

export function squareNameFromVisual(
  visual: ArrowCoordinate,
  game: MatchGame,
  viewer: PlayerId,
): string {
  const boardSquare = boardSquareFromCoordinate(visual)
  return squareName(actualSquare(boardSquare, game.whiteOwner, viewer))
}

/** Map two visual canvas squares to a command for the interactive game. */
export function commandTextForVisualSquares(
  game: MatchGame,
  viewer: PlayerId,
  fromVisual: ArrowCoordinate,
  toVisual: ArrowCoordinate,
): string | null {
  return commandTextForSquares(
    game.position,
    squareNameFromVisual(fromVisual, game, viewer),
    squareNameFromVisual(toVisual, game, viewer),
  )
}

export function coordinatesEqual(
  left: ArrowCoordinate,
  right: ArrowCoordinate,
): boolean {
  return left.col === right.col && left.row === right.row
}

export interface SquareClickResult {
  readonly selected: ArrowCoordinate | null
  readonly command: string | null
}

/** Two-tap move entry: select origin, then destination (or deselect). */
export function handleSquareClick(
  selected: ArrowCoordinate | null,
  clicked: ArrowCoordinate,
  game: MatchGame,
  viewer: PlayerId,
): SquareClickResult {
  if (selected === null) {
    return { selected: clicked, command: null }
  }
  if (coordinatesEqual(selected, clicked)) {
    return { selected: null, command: null }
  }
  return {
    selected: null,
    command: commandTextForVisualSquares(game, viewer, selected, clicked),
  }
}
