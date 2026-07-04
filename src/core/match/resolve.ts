import type { Chess } from 'chessops/chess'
import { makeFen } from 'chessops/fen'
import { type NormalMove, isNormal } from 'chessops/types'
import { makeUci, parseUci } from 'chessops/util'
import { moveMatches } from '../command/evaluate'
import type { CommandPredicate } from '../command/model'
import {
  type GameStatus,
  MATE_THRESHOLD_CP,
  type MatchGame,
  type MatchPhase,
  type MatchState,
  type PlayerId,
  type RecordedMove,
  SOLDIER_WORST_BLUNDER_CAP_CP,
  type SoldierMode,
  activePlacer,
  canIssueCommands,
  otherPlayer,
  positionKey,
} from './model'

export function flipSquare(square: number): number {
  return square ^ 56
}

/** Search depth for the soldiers' ranked search, per the game spec. */
export const ENGINE_DEPTH = 5

/**
 * One root move with its evaluation in centipawns from the mover's
 * perspective. Forced mates are mapped to ±(MATE_CP - plies) by the
 * engine adapter so they sort above/below every real evaluation.
 */
export interface RankedMove {
  readonly uci: string
  readonly cp: number
}

export interface PendingEngineGame {
  readonly gameId: number
  readonly fen: string
}

export interface PendingCommand {
  readonly turn: number
  readonly owner: PlayerId
  readonly text: string
  readonly predicate: CommandPredicate
}

/**
 * The state of a turn between issuing a command and receiving the
 * soldiers' ranked move lists. `base` is the match as it was before the
 * turn, so a failed engine run can be abandoned without committing
 * anything. Every active game needs a ranked search every turn — the
 * soldiers' sampling is what moves unled games.
 */
export interface PendingResolution {
  readonly base: MatchState
  readonly command: PendingCommand | null
  readonly pending: readonly PendingEngineGame[]
}

export interface CommandInput {
  readonly text: string
  readonly predicate: CommandPredicate
}

/**
 * Phase one of a turn: record the command (if any) and list every active
 * game for the ranked search. Commands are only accepted through
 * COMMAND_LAST_TURN and always belong to this turn's active player.
 */
export function beginResolution(
  match: MatchState,
  command: CommandInput | null,
): PendingResolution | null {
  if (match.phase.tag === 'finished') {
    return null
  }
  if (command !== null && !canIssueCommands(match)) {
    return null
  }
  const pending: PendingEngineGame[] = []
  for (const game of match.games) {
    if (game.status.tag !== 'active') {
      continue
    }
    pending.push({
      gameId: game.id,
      fen: makeFen(game.position.toSetup()),
    })
  }
  if (pending.length === 0) {
    return null
  }
  const issued: PendingCommand | null =
    command === null
      ? null
      : {
          turn: match.turn,
          owner: activePlacer(match),
          text: command.text,
          predicate: command.predicate,
        }
  return { base: match, command: issued, pending }
}

/** Advance one ply with no command: the soldiers play unled. */
export function beginAutoResolution(
  match: MatchState,
): PendingResolution | null {
  return beginResolution(match, null)
}

function statusAfterMove(
  game: MatchGame,
  position: Chess,
  repetitionCount: number,
): GameStatus {
  const outcome = position.outcome()
  if (outcome !== undefined) {
    if (outcome.winner !== undefined) {
      const winner: PlayerId =
        outcome.winner === 'white'
          ? game.whiteOwner
          : otherPlayer(game.whiteOwner)
      return { tag: 'won', by: winner }
    }
    return {
      tag: 'drawn',
      reason: position.isStalemate() ? 'stalemate' : 'insufficient-material',
    }
  }
  if (position.halfmoves >= 100) {
    return { tag: 'drawn', reason: 'fifty-move-rule' }
  }
  if (repetitionCount >= 3) {
    return { tag: 'drawn', reason: 'threefold-repetition' }
  }
  return { tag: 'active' }
}

function applyMoveToGame(
  game: MatchGame,
  recorded: RecordedMove,
  evalCp: number,
): MatchGame {
  const move = parseUci(recorded.uci)
  if (move === undefined || !isNormal(move)) {
    throw new Error(`Unplayable move ${recorded.uci}`)
  }
  const position = game.position.clone()
  position.play(move)
  const key = positionKey(position)
  const repetition = new Map(game.repetition)
  const count = (repetition.get(key) ?? 0) + 1
  repetition.set(key, count)
  return {
    ...game,
    position,
    repetition,
    status: statusAfterMove(game, position, count),
    moves: [...game.moves, recorded],
    evalCp,
  }
}

function matchPhaseFor(
  games: readonly MatchGame[],
  scores: { readonly p1: number; readonly p2: number },
): MatchPhase {
  const active = games.filter((game) => game.status.tag === 'active').length
  if (active === 0) {
    if (scores.p1 === scores.p2) {
      return { tag: 'finished', winner: 'draw' }
    }
    return { tag: 'finished', winner: scores.p1 > scores.p2 ? 1 : 2 }
  }
  if (Math.abs(scores.p1 - scores.p2) > active) {
    return { tag: 'finished', winner: scores.p1 > scores.p2 ? 1 : 2 }
  }
  return { tag: 'active' }
}

interface LegalRankedMove {
  readonly move: NormalMove
  readonly uci: string
  readonly cp: number
}

function legalRankedMoves(
  position: Chess,
  ranked: readonly RankedMove[],
): LegalRankedMove[] {
  const legal: LegalRankedMove[] = []
  for (const entry of ranked) {
    const move = parseUci(entry.uci)
    if (move === undefined || !isNormal(move) || !position.isLegal(move)) {
      continue
    }
    // Normalise to the exact uci we will replay (promotion spelled out).
    legal.push({ move, uci: makeUci(move), cp: entry.cp })
  }
  return legal
}

/** Which player owns the side to move in this game. */
export function movingOwner(game: MatchGame): PlayerId {
  return game.position.turn === 'white'
    ? game.whiteOwner
    : otherPlayer(game.whiteOwner)
}

/** Best or worst play for one owner in this game's soldier mode. */
export function soldierStyle(
  mode: SoldierMode,
  owner: PlayerId,
): 'best' | 'worst' {
  switch (mode) {
    case 0:
      return 'best'
    case 1:
      return owner === 1 ? 'best' : 'worst'
    case 2:
      return owner === 1 ? 'worst' : 'best'
    case 3:
      return 'worst'
  }
}

function pickByStyle(
  allowed: readonly LegalRankedMove[],
  style: 'best' | 'worst',
  bestCp: number,
): LegalRankedMove {
  if (style === 'best') {
    return allowed.reduce((best, entry) => (entry.cp > best.cp ? entry : best))
  }
  const floorCp = bestCp - SOLDIER_WORST_BLUNDER_CAP_CP
  const capped = allowed.filter((entry) => entry.cp >= floorCp)
  const pool = capped.length > 0 ? capped : allowed
  return pool.reduce((worst, entry) => (entry.cp < worst.cp ? entry : worst))
}

interface SoldierChoice {
  readonly recorded: RecordedMove
  /** Centipawns from the mover's perspective for the played move. */
  readonly moveCp: number
}

/**
 * One soldier's move: filter the ranked legal moves through the command
 * (falling back to all moves when nothing matches), then play the best or
 * worst move this game's mode assigns to the mover. Worst is capped at one
 * pawn below the position's best allowed move. A soldier who can see a
 * forced mate takes the top move instead — games must end.
 */
function chooseSoldierMove(
  game: MatchGame,
  ranked: readonly RankedMove[],
  command: PendingCommand | null,
): SoldierChoice | null {
  const moves = legalRankedMoves(game.position, ranked)
  if (moves.length === 0) {
    return null
  }
  const bestCp = Math.max(...moves.map((entry) => entry.cp))

  if (bestCp >= MATE_THRESHOLD_CP) {
    const best = moves.find((entry) => entry.cp === bestCp)
    if (best === undefined) {
      return null
    }
    return { recorded: { uci: best.uci, source: 'free' }, moveCp: best.cp }
  }

  let allowed = moves
  let source: RecordedMove['source'] = 'free'
  if (command !== null) {
    const matched = moves.filter((entry) =>
      moveMatches(game.position, entry.move, command.predicate),
    )
    if (matched.length > 0) {
      allowed = matched
      source = 'command'
    }
  }

  const style = soldierStyle(game.soldierMode, movingOwner(game))
  const chosen = pickByStyle(allowed, style, bestCp)
  const recorded: RecordedMove =
    source === 'command' && command !== null
      ? { uci: chosen.uci, source, commandOwner: command.owner }
      : { uci: chosen.uci, source: 'free' }
  return { recorded, moveCp: chosen.cp }
}

/**
 * Phase two of a turn: apply one soldier move to every active game using
 * game using the ranked lists (aligned with `resolution.pending`), then
 * score newly decided games and check the match end conditions.
 *
 * Returns null if the ranked lists do not fit (wrong count or a game
 * with no playable move) — the caller treats that as an engine failure
 * and keeps the pre-turn state.
 */
export function completeResolution(
  resolution: PendingResolution,
  ranked: readonly (readonly RankedMove[])[],
): MatchState | null {
  if (ranked.length !== resolution.pending.length) {
    return null
  }

  const base = resolution.base
  const games = [...base.games]
  let commandMoves = 0
  let freeMoves = 0

  for (let index = 0; index < resolution.pending.length; index++) {
    const entry = resolution.pending[index]
    const list = ranked[index]
    if (entry === undefined || list === undefined) {
      return null
    }
    const gameIndex = games.findIndex((game) => game.id === entry.gameId)
    const game = games[gameIndex]
    if (game === undefined || game.status.tag !== 'active') {
      return null
    }
    const choice = chooseSoldierMove(game, list, resolution.command)
    if (choice === null) {
      return null
    }
    const moverIsWhite = game.position.turn === 'white'
    const evalCp = moverIsWhite ? choice.moveCp : -choice.moveCp
    games[gameIndex] = applyMoveToGame(game, choice.recorded, evalCp)
    if (choice.recorded.source === 'command') {
      commandMoves += 1
    } else {
      freeMoves += 1
    }
  }

  let p1Wins = 0
  let p2Wins = 0
  let draws = 0
  for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
    const before = base.games[gameIndex]
    const after = games[gameIndex]
    if (
      before === undefined ||
      after === undefined ||
      before.status.tag !== 'active' ||
      after.status.tag === 'active'
    ) {
      continue
    }
    if (after.status.tag === 'won') {
      if (after.status.by === 1) {
        p1Wins += 1
      } else {
        p2Wins += 1
      }
    } else {
      draws += 1
    }
  }

  const scores = {
    p1: base.scores.p1 + p1Wins,
    p2: base.scores.p2 + p2Wins,
  }

  return {
    ...base,
    games,
    commands:
      resolution.command === null
        ? base.commands
        : [...base.commands, { ...resolution.command, commandMoves }],
    turn: base.turn + 1,
    scores,
    rng: base.rng,
    phase: matchPhaseFor(games, scores),
    lastResolution: {
      turn: base.turn,
      commandMoves,
      freeMoves,
      p1Wins,
      p2Wins,
      draws,
    },
  }
}
