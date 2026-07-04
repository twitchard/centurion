import { Chess } from 'chessops/chess'
import { makeFen, parseFen } from 'chessops/fen'
import type { Color } from 'chessops/types'
import type { CommandPredicate } from '../command/model'
import { type RngState, pickIndex, seedRng } from '../rng'
import {
  DEFAULT_SOLDIER_MODE_ROTATION_TAG,
  type SoldierModeRotationSpec,
  type SoldierModeRotationTag,
  initSoldierModeRotation,
  isSoldierModeRotationSpec,
} from './soldier-mode-rotation'

export type PlayerId = 1 | 2

/** Board square index, a1 = 0 .. h8 = 63 (chessops convention). */
export type BoardSquare = number

/**
 * One issued natural-language command: the player's words, the predicate
 * they compiled to, and the turn it steered. Commands act only on the
 * half-move of the turn they are issued; the history is kept so both
 * players can read the running order log.
 */
export interface IssuedCommand {
  readonly turn: number
  readonly owner: PlayerId
  readonly text: string
  readonly predicate: CommandPredicate
  /** Active games whose soldier followed this order on the issuing turn. */
  readonly commandMoves: number
}

export type DrawReason =
  | 'stalemate'
  | 'insufficient-material'
  | 'fifty-move-rule'
  | 'threefold-repetition'

export type GameStatus =
  | { readonly tag: 'pending' }
  | { readonly tag: 'active' }
  | { readonly tag: 'won'; readonly by: PlayerId }
  | { readonly tag: 'drawn'; readonly reason: DrawReason }

/**
 * Whether a half-move followed the turn's command ('command') or was the
 * soldier's own unled choice ('free').
 */
export type MoveSource = 'command' | 'free'

export interface RecordedMove {
  readonly uci: string
  readonly source: MoveSource
  /** Which player's command steered this move; only set for 'command'. */
  readonly commandOwner?: PlayerId
}

/**
 * How the two players' soldiers play in this game. Each quadrant is
 * assigned to ~25% of games at match start:
 *   0 — P1 best, P2 best
 *   1 — P1 best, P2 worst
 *   2 — P1 worst, P2 best
 *   3 — P1 worst, P2 worst
 * "Worst" is capped at one pawn below the position's best move.
 */
export type SoldierMode = 0 | 1 | 2 | 3

export interface MatchGame {
  readonly id: number
  readonly whiteOwner: PlayerId
  /** Half-move number when this game enters the match (wave start). */
  readonly activationTurn: number
  /** FEN at the start of this game (for PGN export and replay). */
  readonly startingFen: string
  readonly position: Chess
  readonly repetition: ReadonlyMap<string, number>
  readonly status: GameStatus
  /** Half-moves played from `startingFen`, with resolution source. */
  readonly moves: readonly RecordedMove[]
  readonly soldierMode: SoldierMode
  /** Centipawns from white's perspective after the last resolved half-move. */
  readonly evalCp: number
}

export type {
  SoldierModeRotationSpec,
  SoldierModeRotationTag,
} from './soldier-mode-rotation'
export {
  DEFAULT_SOLDIER_MODE_ROTATION_TAG,
  effectiveSoldierMode,
} from './soldier-mode-rotation'

export interface ResolutionSummary {
  readonly turn: number
  readonly commandMoves: number
  readonly freeMoves: number
  readonly p1Wins: number
  readonly p2Wins: number
  readonly draws: number
}

export type MatchPhase =
  | { readonly tag: 'active' }
  | { readonly tag: 'finished'; readonly winner: PlayerId | 'draw' }

export interface MatchState {
  readonly gameCount: number
  readonly games: readonly MatchGame[]
  /** Every command issued so far, oldest first. */
  readonly commands: readonly IssuedCommand[]
  readonly turn: number
  readonly firstPlacer: PlayerId
  readonly scores: { readonly p1: number; readonly p2: number }
  readonly rng: RngState
  readonly soldierModeRotation: SoldierModeRotationSpec
  readonly phase: MatchPhase
  readonly lastResolution: ResolutionSummary | null
}

export const DEFAULT_GAME_COUNT = 100

/** How many fresh games join the match each turn until the full set is live. */
export const GAMES_PER_WAVE = 2

/** Turn when the last wave of games enters (2 × 50 = 100). */
export const LAST_WAVE_TURN = DEFAULT_GAME_COUNT / GAMES_PER_WAVE

/** After this turn number, players can no longer issue commands; the match auto-plays out. */
export const COMMAND_LAST_TURN = 100

/** The turn on which a game id first becomes playable. */
export function activationTurnForGame(gameId: number): number {
  return Math.floor(gameId / GAMES_PER_WAVE) + 1
}

/**
 * When a soldier is told to play its worst move, it never blunders more
 * than this many centipawns below the position's best allowed move.
 */
export const SOLDIER_WORST_BLUNDER_CAP_CP = 100

/**
 * Ranked-move scores at or above this magnitude encode forced mates
 * (the adapter maps `score mate N` to ±(MATE_CP - N)). A soldier who
 * can see a forced mate takes it — games must end.
 */
export const MATE_CP = 100_000

export const MATE_THRESHOLD_CP = 90_000

export function canIssueCommands(match: MatchState): boolean {
  return match.phase.tag === 'active' && match.turn <= COMMAND_LAST_TURN
}

export interface MatchOptions {
  readonly gameCount?: number
  /** Custom starting FENs, mainly for tests. Length overrides gameCount. */
  readonly fens?: readonly string[]
  /** Fix who owns white instead of drawing it from the seed. */
  readonly whitePlayer?: PlayerId
  /** Fix who commands first instead of drawing it from the seed. */
  readonly firstPlacer?: PlayerId
  /** Fix soldier modes per game instead of drawing them from the seed. */
  readonly soldierModes?: readonly SoldierMode[]
  /**
   * Which rotation policy assigns effective soldier modes over time.
   * Pass a tag to draw fresh state from the seed, or a full spec to fix it.
   */
  readonly soldierModeRotation?:
    | SoldierModeRotationTag
    | SoldierModeRotationSpec
}

export function otherPlayer(player: PlayerId): PlayerId {
  return player === 1 ? 2 : 1
}

export function sideToMove(match: MatchState): Color {
  return match.turn % 2 === 1 ? 'white' : 'black'
}

/** The player whose half-move (and command window) this turn is. */
export function activePlacer(match: MatchState): PlayerId {
  return match.turn % 2 === 1
    ? match.firstPlacer
    : otherPlayer(match.firstPlacer)
}

export function activeGameCount(match: MatchState): number {
  return match.games.filter((game) => game.status.tag === 'active').length
}

/** Games that have entered the match (active or finished). */
export function startedGameCount(match: MatchState): number {
  return match.games.filter((game) => game.status.tag !== 'pending').length
}

export function positionKey(position: Chess): string {
  return makeFen(position.toSetup()).split(' ').slice(0, 4).join(' ')
}

function positionFromFen(fen: string): Chess {
  const setup = parseFen(fen).unwrap()
  return Chess.fromSetup(setup).unwrap()
}

function shuffledSoldierModes(
  gameCount: number,
  _rng: RngState,
): readonly [readonly SoldierMode[], RngState] {
  // With staggered waves, every soldier plays its worst move (capped at one
  // pawn below best). Mode 3 is worst for both players.
  const modes: SoldierMode[] = Array.from({ length: gameCount }, () => 3)
  return [modes, _rng]
}

export function initMatch(seed: number, options?: MatchOptions): MatchState {
  const fens = options?.fens
  const gameCount =
    fens !== undefined
      ? fens.length
      : (options?.gameCount ?? DEFAULT_GAME_COUNT)
  if (gameCount < 1) {
    throw new Error('A match needs at least one game')
  }

  let rng = seedRng(seed)
  let whitePlayer: PlayerId
  if (options?.whitePlayer !== undefined) {
    whitePlayer = options.whitePlayer
  } else {
    const [pick, nextRng] = pickIndex(rng, 2)
    rng = nextRng
    whitePlayer = pick === 0 ? 1 : 2
  }

  let soldierModes: readonly SoldierMode[]
  if (options?.soldierModes !== undefined) {
    if (options.soldierModes.length !== gameCount) {
      throw new Error('soldierModes length must match game count')
    }
    soldierModes = options.soldierModes
  } else {
    const [drawn, nextRng] = shuffledSoldierModes(gameCount, rng)
    rng = nextRng
    soldierModes = drawn
  }

  const games: MatchGame[] = []
  for (let id = 0; id < gameCount; id++) {
    const fen = fens?.[id]
    const position = fen === undefined ? Chess.default() : positionFromFen(fen)
    const repetition = new Map<string, number>()
    repetition.set(positionKey(position), 1)
    const mode = soldierModes[id]
    if (mode === undefined) {
      throw new Error(`missing soldier mode for game ${id}`)
    }
    const activationTurn = activationTurnForGame(id)
    games.push({
      id,
      whiteOwner: whitePlayer,
      activationTurn,
      startingFen: makeFen(position.toSetup()),
      position,
      repetition,
      status: activationTurn === 1 ? { tag: 'active' } : { tag: 'pending' },
      moves: [],
      soldierMode: mode,
      evalCp: 0,
    })
  }

  let soldierModeRotation: SoldierModeRotationSpec
  if (options?.soldierModeRotation !== undefined) {
    if (isSoldierModeRotationSpec(options.soldierModeRotation)) {
      soldierModeRotation = options.soldierModeRotation
    } else {
      const [drawn, nextRng] = initSoldierModeRotation(
        options.soldierModeRotation,
        gameCount,
        soldierModes,
        rng,
      )
      rng = nextRng
      soldierModeRotation = drawn
    }
  } else {
    const [drawn, nextRng] = initSoldierModeRotation(
      DEFAULT_SOLDIER_MODE_ROTATION_TAG,
      gameCount,
      soldierModes,
      rng,
    )
    rng = nextRng
    soldierModeRotation = drawn
  }

  // Turn 1 resolves white's half-move in every game, so unless a mode
  // overrides it (solo does), the white owner also commands first: one
  // draw decides both who moves first and who commands first.
  const firstPlacer: PlayerId = options?.firstPlacer ?? whitePlayer

  return {
    gameCount,
    games,
    commands: [],
    turn: 1,
    firstPlacer,
    scores: { p1: 0, p2: 0 },
    rng,
    soldierModeRotation,
    phase: { tag: 'active' },
    lastResolution: null,
  }
}
