import { Chess } from 'chessops/chess'
import { makeFen, parseFen } from 'chessops/fen'
import type {
  BoardArrow,
  DrawReason,
  GameStatus,
  MatchGame,
  MatchPhase,
  MatchState,
  MoveSource,
  PlayerId,
  RecordedMove,
  ResolutionSummary,
} from './model'

export interface GameStatusSnapshot {
  readonly tag: 'active' | 'won' | 'drawn'
  readonly by?: PlayerId
  readonly reason?: DrawReason
}

export interface RecordedMoveSnapshot {
  readonly uci: string
  readonly source: MoveSource
  readonly arrowOwner?: PlayerId
}

export interface GameSnapshot {
  readonly id: number
  readonly whiteOwner: PlayerId
  readonly startingFen: string
  readonly fen: string
  readonly repetition: readonly (readonly [string, number])[]
  readonly status: GameStatusSnapshot
  readonly moves: readonly RecordedMoveSnapshot[]
}

export interface MatchSnapshot {
  readonly gameCount: number
  readonly games: readonly GameSnapshot[]
  readonly arrows: readonly BoardArrow[]
  readonly turn: number
  readonly firstPlacer: PlayerId
  readonly scores: { readonly p1: number; readonly p2: number }
  readonly rng: number
  readonly phase: MatchPhase
  readonly lastResolution: ResolutionSummary | null
}

function encodeGameStatus(status: GameStatus): GameStatusSnapshot {
  if (status.tag === 'active') {
    return { tag: 'active' }
  }
  if (status.tag === 'won') {
    return { tag: 'won', by: status.by }
  }
  return { tag: 'drawn', reason: status.reason }
}

function decodeGameStatus(snapshot: GameStatusSnapshot): GameStatus | null {
  if (snapshot.tag === 'active') {
    return { tag: 'active' }
  }
  if (snapshot.tag === 'won') {
    if (snapshot.by !== 1 && snapshot.by !== 2) {
      return null
    }
    return { tag: 'won', by: snapshot.by }
  }
  if (snapshot.tag !== 'drawn' || snapshot.reason === undefined) {
    return null
  }
  const reasons: DrawReason[] = [
    'stalemate',
    'insufficient-material',
    'fifty-move-rule',
    'threefold-repetition',
  ]
  if (!reasons.includes(snapshot.reason)) {
    return null
  }
  return { tag: 'drawn', reason: snapshot.reason }
}

function encodeGame(game: MatchGame): GameSnapshot {
  return {
    id: game.id,
    whiteOwner: game.whiteOwner,
    startingFen: game.startingFen,
    fen: makeFen(game.position.toSetup()),
    repetition: [...game.repetition.entries()],
    status: encodeGameStatus(game.status),
    moves: game.moves.map((move) =>
      move.arrowOwner === undefined
        ? { uci: move.uci, source: move.source }
        : { uci: move.uci, source: move.source, arrowOwner: move.arrowOwner },
    ),
  }
}

function decodeGame(snapshot: GameSnapshot): MatchGame | null {
  if (snapshot.whiteOwner !== 1 && snapshot.whiteOwner !== 2) {
    return null
  }
  const status = decodeGameStatus(snapshot.status)
  if (status === null) {
    return null
  }
  const setupResult = parseFen(snapshot.fen)
  if (!setupResult.isOk) {
    return null
  }
  const positionResult = Chess.fromSetup(setupResult.value)
  if (!positionResult.isOk) {
    return null
  }
  const position = positionResult.value
  const repetition = new Map<string, number>()
  for (const entry of snapshot.repetition) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== 'string' ||
      typeof entry[1] !== 'number'
    ) {
      return null
    }
    repetition.set(entry[0], entry[1])
  }
  const moves: RecordedMove[] = []
  for (const move of snapshot.moves) {
    if (
      typeof move !== 'object' ||
      move === null ||
      typeof move.uci !== 'string' ||
      (move.source !== 'arrow' && move.source !== 'engine') ||
      (move.arrowOwner !== undefined &&
        move.arrowOwner !== 1 &&
        move.arrowOwner !== 2)
    ) {
      return null
    }
    moves.push(
      move.arrowOwner === undefined
        ? { uci: move.uci, source: move.source }
        : { uci: move.uci, source: move.source, arrowOwner: move.arrowOwner },
    )
  }
  return {
    id: snapshot.id,
    whiteOwner: snapshot.whiteOwner,
    startingFen: snapshot.startingFen,
    position,
    repetition,
    status,
    moves,
  }
}

export function encodeMatchState(match: MatchState): MatchSnapshot {
  return {
    gameCount: match.gameCount,
    games: match.games.map(encodeGame),
    arrows: [...match.arrows],
    turn: match.turn,
    firstPlacer: match.firstPlacer,
    scores: { ...match.scores },
    rng: match.rng,
    phase: match.phase,
    lastResolution: match.lastResolution,
  }
}

function isPlayerId(value: unknown): value is PlayerId {
  return value === 1 || value === 2
}

function isMatchPhase(value: unknown): value is MatchPhase {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const phase = value as { tag?: unknown; winner?: unknown }
  if (phase.tag === 'active') {
    return true
  }
  if (phase.tag !== 'finished') {
    return false
  }
  return phase.winner === 'draw' || phase.winner === 1 || phase.winner === 2
}

function isBoardArrow(value: unknown): value is BoardArrow {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const arrow = value as BoardArrow
  return (
    typeof arrow.from === 'number' &&
    typeof arrow.to === 'number' &&
    isPlayerId(arrow.owner) &&
    typeof arrow.cardinality === 'number' &&
    typeof arrow.placedTurn === 'number'
  )
}

function isResolutionSummary(value: unknown): value is ResolutionSummary {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const summary = value as ResolutionSummary
  return (
    typeof summary.turn === 'number' &&
    typeof summary.arrowMoves === 'number' &&
    typeof summary.engineMoves === 'number' &&
    typeof summary.p1Wins === 'number' &&
    typeof summary.p2Wins === 'number' &&
    typeof summary.draws === 'number'
  )
}

export function decodeMatchSnapshot(snapshot: unknown): MatchState | null {
  if (typeof snapshot !== 'object' || snapshot === null) {
    return null
  }
  const raw = snapshot as MatchSnapshot
  if (
    typeof raw.gameCount !== 'number' ||
    !Array.isArray(raw.games) ||
    !Array.isArray(raw.arrows) ||
    typeof raw.turn !== 'number' ||
    !isPlayerId(raw.firstPlacer) ||
    typeof raw.rng !== 'number' ||
    !isMatchPhase(raw.phase) ||
    (raw.lastResolution !== null && !isResolutionSummary(raw.lastResolution)) ||
    typeof raw.scores !== 'object' ||
    raw.scores === null ||
    typeof raw.scores.p1 !== 'number' ||
    typeof raw.scores.p2 !== 'number'
  ) {
    return null
  }
  if (!raw.arrows.every(isBoardArrow)) {
    return null
  }
  const games: MatchGame[] = []
  for (const gameSnapshot of raw.games) {
    const game = decodeGame(gameSnapshot)
    if (game === null) {
      return null
    }
    games.push(game)
  }
  if (games.length !== raw.gameCount) {
    return null
  }
  return {
    gameCount: raw.gameCount,
    games,
    arrows: raw.arrows,
    turn: raw.turn,
    firstPlacer: raw.firstPlacer,
    scores: { p1: raw.scores.p1, p2: raw.scores.p2 },
    rng: raw.rng >>> 0,
    phase: raw.phase,
    lastResolution: raw.lastResolution,
  }
}
