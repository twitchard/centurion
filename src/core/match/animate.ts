import { parseUci } from 'chessops/util'
import { buildSuperpositionRenderModel } from '../superposition/build-render-model'
import type {
  FenBoardPosition,
  FenPieceSymbol,
  PieceMoveOverlay,
  PiecePlacement,
  SuperpositionRenderModel,
} from '../superposition/types'
import type { BoardSquare, MatchState, MoveSource, PlayerId } from './model'
import {
  gameVisualPieces,
  matchArrowSegments,
  squareToCoordinate,
  visualPieceSymbol,
  visualSquare,
} from './render'

/**
 * One game's half-move scheduled on the resolution timeline. Squares
 * are in the viewer's visual frame; times are offsets from the start
 * of the animation.
 */
export interface PlannedAnimationMove {
  readonly gameId: number
  readonly piece: FenPieceSymbol
  readonly from: BoardSquare
  readonly to: BoardSquare
  readonly source: MoveSource
  readonly startMs: number
  readonly durationMs: number
}

export interface ResolutionAnimationPlan {
  readonly totalMs: number
  readonly moves: readonly PlannedAnimationMove[]
  readonly before: MatchState
  readonly after: MatchState
  readonly viewer: PlayerId
}

export interface ResolutionAnimationFrame {
  readonly model: SuperpositionRenderModel
  readonly overlays: readonly PieceMoveOverlay[]
  readonly done: boolean
}

/** Fraction of the timeline given to arrow slides when fades follow. */
const SLIDE_PHASE_SHARE = 0.45
const SLIDE_MAX_MS = 420
const FADE_MAX_MS = 450
const MOVE_MIN_MS = 140

interface UnscheduledMove {
  readonly gameId: number
  readonly piece: FenPieceSymbol
  readonly from: BoardSquare
  readonly to: BoardSquare
  readonly source: MoveSource
}

/**
 * Stagger a batch of moves across a window: each move keeps a readable
 * individual duration while start times spread so the batch reads as
 * pieces moving one after another, finishing together at the window end.
 */
function schedule(
  moves: readonly UnscheduledMove[],
  offsetMs: number,
  windowMs: number,
  maxDurationMs: number,
): PlannedAnimationMove[] {
  if (moves.length === 0 || windowMs <= 0) {
    return []
  }
  const duration = Math.max(
    MOVE_MIN_MS,
    Math.min(maxDurationMs, Math.round(windowMs * 0.6)),
  )
  const step =
    moves.length === 1 ? 0 : (windowMs - duration) / (moves.length - 1)
  return moves.map((move, index) => ({
    ...move,
    startMs: offsetMs + Math.round(index * step),
    durationMs: duration,
  }))
}

/**
 * Diff two consecutive match states into an animation timeline: the
 * half-move each game played this turn, arrow-driven moves first as
 * emphasized slides, then every engine move as a staggered fade.
 * Returns null when the states are not a single-turn step or nothing
 * moved.
 */
export function planResolutionAnimation(
  before: MatchState,
  after: MatchState,
  viewer: PlayerId,
  totalMs: number,
): ResolutionAnimationPlan | null {
  if (
    totalMs <= 0 ||
    after.turn !== before.turn + 1 ||
    after.gameCount !== before.gameCount
  ) {
    return null
  }

  const beforeById = new Map(before.games.map((game) => [game.id, game]))
  const slides: UnscheduledMove[] = []
  const fades: UnscheduledMove[] = []

  for (const game of after.games) {
    const previous = beforeById.get(game.id)
    if (previous === undefined || previous.status.tag !== 'active') {
      continue
    }
    if (game.moves.length !== previous.moves.length + 1) {
      continue
    }
    const recorded = game.moves[game.moves.length - 1]
    if (recorded === undefined) {
      continue
    }
    const move = parseUci(recorded.uci)
    if (move === undefined || !('from' in move)) {
      continue
    }
    const piece = previous.position.board.get(move.from)
    if (piece === undefined) {
      continue
    }
    const planned: UnscheduledMove = {
      gameId: game.id,
      piece: visualPieceSymbol(piece, game.whiteOwner, viewer),
      from: visualSquare(move.from, game.whiteOwner, viewer),
      to: visualSquare(move.to, game.whiteOwner, viewer),
      source: recorded.source,
    }
    if (recorded.source === 'arrow') {
      slides.push(planned)
    } else {
      fades.push(planned)
    }
  }

  if (slides.length === 0 && fades.length === 0) {
    return null
  }

  const slideWindow =
    slides.length === 0
      ? 0
      : fades.length === 0
        ? totalMs
        : Math.round(totalMs * SLIDE_PHASE_SHARE)
  const moves = [
    ...schedule(slides, 0, slideWindow, SLIDE_MAX_MS),
    ...schedule(fades, slideWindow, totalMs - slideWindow, FADE_MAX_MS),
  ]
  return { totalMs, moves, before, after, viewer }
}

/** Drop one occurrence of the moving piece from its origin square. */
function withoutMovingPiece(
  pieces: readonly PiecePlacement[],
  move: PlannedAnimationMove,
): PiecePlacement[] {
  const index = pieces.findIndex(
    (placement) =>
      placement.square === move.from && placement.piece === move.piece,
  )
  if (index < 0) {
    return [...pieces]
  }
  return [...pieces.slice(0, index), ...pieces.slice(index + 1)]
}

/**
 * The board as it looks `elapsedMs` into the animation: games whose
 * move has not started yet still show their old position, finished
 * ones their new position, and in-flight pieces are lifted off the
 * aggregated board into overlays for the renderer to draw on top.
 */
export function resolutionAnimationFrame(
  plan: ResolutionAnimationPlan,
  elapsedMs: number,
  selected: BoardSquare | null = null,
): ResolutionAnimationFrame {
  const moveByGame = new Map(plan.moves.map((move) => [move.gameId, move]))
  const afterById = new Map(plan.after.games.map((game) => [game.id, game]))
  const positions: FenBoardPosition[] = []
  const overlays: PieceMoveOverlay[] = []

  for (const game of plan.before.games) {
    if (game.status.tag !== 'active') {
      continue
    }
    const move = moveByGame.get(game.id)
    const settled = afterById.get(game.id)
    if (move === undefined) {
      // The game did not advance this turn; show its settled state.
      if (settled !== undefined && settled.status.tag === 'active') {
        positions.push({ pieces: gameVisualPieces(settled, plan.viewer) })
      }
      continue
    }
    if (elapsedMs < move.startMs) {
      positions.push({ pieces: gameVisualPieces(game, plan.viewer) })
      continue
    }
    if (elapsedMs >= move.startMs + move.durationMs) {
      // Games that ended this turn leave the board with their move.
      if (settled !== undefined && settled.status.tag === 'active') {
        positions.push({ pieces: gameVisualPieces(settled, plan.viewer) })
      }
      continue
    }
    positions.push({
      pieces: withoutMovingPiece(gameVisualPieces(game, plan.viewer), move),
    })
    overlays.push({
      piece: move.piece,
      from: squareToCoordinate(move.from),
      to: squareToCoordinate(move.to),
      progress: (elapsedMs - move.startMs) / move.durationMs,
      kind: move.source === 'arrow' ? 'slide' : 'fade',
    })
  }

  const base = buildSuperpositionRenderModel(
    positions,
    matchArrowSegments(plan.after, plan.viewer),
  )
  const withViewer = { ...base, viewerPlayer: plan.viewer }
  const model =
    selected === null
      ? withViewer
      : { ...withViewer, highlight: squareToCoordinate(selected) }
  return { model, overlays, done: elapsedMs >= plan.totalMs }
}
