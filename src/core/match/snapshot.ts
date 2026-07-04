import { Chess } from 'chessops/chess'
import { makeFen, parseFen } from 'chessops/fen'
import { decodeCommandPredicate } from '../command/decode'
import type { CommandPredicate } from '../command/model'
import type {
  DrawReason,
  GameStatus,
  IssuedCommand,
  MatchGame,
  MatchPhase,
  MatchState,
  MoveSource,
  PlayerId,
  RecordedMove,
  ResolutionSummary,
  SoldierMode,
} from './model'

export interface GameStatusSnapshot {
  readonly tag: 'active' | 'won' | 'drawn'
  readonly by?: PlayerId
  readonly reason?: DrawReason
}

export interface RecordedMoveSnapshot {
  readonly uci: string
  readonly source: MoveSource
  readonly commandOwner?: PlayerId
}

export interface GameSnapshot {
  readonly id: number
  readonly whiteOwner: PlayerId
  readonly startingFen: string
  readonly fen: string
  readonly repetition: readonly (readonly [string, number])[]
  readonly status: GameStatusSnapshot
  readonly moves: readonly RecordedMoveSnapshot[]
  readonly soldierMode: 0 | 1 | 2 | 3
}

export interface IssuedCommandSnapshot {
  readonly turn: number
  readonly owner: PlayerId
  readonly text: string
  readonly predicate: unknown
}

export interface MatchSnapshot {
  readonly gameCount: number
  readonly games: readonly GameSnapshot[]
  readonly commands: readonly IssuedCommandSnapshot[]
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

function isSoldierMode(value: unknown): value is SoldierMode {
  return value === 0 || value === 1 || value === 2 || value === 3
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
      move.commandOwner === undefined
        ? { uci: move.uci, source: move.source }
        : {
            uci: move.uci,
            source: move.source,
            commandOwner: move.commandOwner,
          },
    ),
    soldierMode: game.soldierMode,
  }
}

function decodeGame(snapshot: GameSnapshot): MatchGame | null {
  if (snapshot.whiteOwner !== 1 && snapshot.whiteOwner !== 2) {
    return null
  }
  if (!isSoldierMode(snapshot.soldierMode)) {
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
      (move.source !== 'command' && move.source !== 'free') ||
      (move.commandOwner !== undefined &&
        move.commandOwner !== 1 &&
        move.commandOwner !== 2)
    ) {
      return null
    }
    moves.push(
      move.commandOwner === undefined
        ? { uci: move.uci, source: move.source }
        : {
            uci: move.uci,
            source: move.source,
            commandOwner: move.commandOwner,
          },
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
    soldierMode: snapshot.soldierMode,
  }
}

export function encodeMatchState(match: MatchState): MatchSnapshot {
  return {
    gameCount: match.gameCount,
    games: match.games.map(encodeGame),
    commands: match.commands.map((command) => ({
      turn: command.turn,
      owner: command.owner,
      text: command.text,
      predicate: command.predicate,
    })),
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

function decodeIssuedCommand(value: unknown): IssuedCommand | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const raw = value as IssuedCommandSnapshot
  if (
    typeof raw.turn !== 'number' ||
    !isPlayerId(raw.owner) ||
    typeof raw.text !== 'string'
  ) {
    return null
  }
  // The predicate crosses the wire as plain JSON; run it back through
  // the codec so a hostile or corrupted room record cannot smuggle an
  // unchecked term into match state.
  const predicate = decodeCommandPredicate(raw.predicate)
  if (predicate.tag === 'invalid') {
    return null
  }
  const decoded: CommandPredicate = predicate.value
  return {
    turn: raw.turn,
    owner: raw.owner,
    text: raw.text,
    predicate: decoded,
  }
}

function isResolutionSummary(value: unknown): value is ResolutionSummary {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const summary = value as ResolutionSummary
  return (
    typeof summary.turn === 'number' &&
    typeof summary.commandMoves === 'number' &&
    typeof summary.freeMoves === 'number' &&
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
    !Array.isArray(raw.commands) ||
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
  const commands: IssuedCommand[] = []
  for (const entry of raw.commands) {
    const command = decodeIssuedCommand(entry)
    if (command === null) {
      return null
    }
    commands.push(command)
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
    commands,
    turn: raw.turn,
    firstPlacer: raw.firstPlacer,
    scores: { p1: raw.scores.p1, p2: raw.scores.p2 },
    rng: raw.rng >>> 0,
    phase: raw.phase,
    lastResolution: raw.lastResolution,
  }
}
