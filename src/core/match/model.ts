import { Chess } from 'chessops/chess'
import { makeFen, parseFen } from 'chessops/fen'
import type { Color } from 'chessops/types'
import { type RngState, pickIndex, seedRng } from '../rng'

export type PlayerId = 1 | 2

/** Board square index, a1 = 0 .. h8 = 63 (chessops convention). */
export type BoardSquare = number

/**
 * A placement input: origin and destination in the canonical frame
 * (player 1's point of view). Player 2 sees the board rank-flipped.
 */
export interface Arrow {
  readonly from: BoardSquare
  readonly to: BoardSquare
}

/**
 * A persistent arrow on the board: a square pair, its owner, how much
 * pull weight it carries (increases when stacked), and the turn it was
 * last placed or refreshed.
 */
export interface BoardArrow {
  readonly from: BoardSquare
  readonly to: BoardSquare
  readonly owner: PlayerId
  readonly cardinality: number
  readonly placedTurn: number
}

export type DrawReason =
  | 'stalemate'
  | 'insufficient-material'
  | 'fifty-move-rule'
  | 'threefold-repetition'

export type GameStatus =
  | { readonly tag: 'active' }
  | { readonly tag: 'won'; readonly by: PlayerId }
  | { readonly tag: 'drawn'; readonly reason: DrawReason }

/** Whether a half-move followed a board arrow or Stockfish's choice. */
export type MoveSource = 'arrow' | 'engine'

export interface RecordedMove {
  readonly uci: string
  readonly source: MoveSource
  /** Which player's arrow pulled this move; only set when source is 'arrow'. */
  readonly arrowOwner?: PlayerId
}

export interface MatchGame {
  readonly id: number
  readonly whiteOwner: PlayerId
  /** FEN at the start of this game (for PGN export and replay). */
  readonly startingFen: string
  readonly position: Chess
  readonly repetition: ReadonlyMap<string, number>
  readonly status: GameStatus
  /** Half-moves played from `startingFen`, with resolution source. */
  readonly moves: readonly RecordedMove[]
}

export interface ResolutionSummary {
  readonly turn: number
  readonly arrowMoves: number
  readonly engineMoves: number
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
  readonly arrows: readonly BoardArrow[]
  readonly turn: number
  readonly firstPlacer: PlayerId
  readonly scores: { readonly p1: number; readonly p2: number }
  readonly rng: RngState
  readonly phase: MatchPhase
  readonly lastResolution: ResolutionSummary | null
}

export const DEFAULT_GAME_COUNT = 100

/** How many games a freshly placed arrow can pull on its placement turn. */
export const ARROW_DECAY_INITIAL = 8

/** After this turn number, players can no longer place arrows; the match auto-plays out. */
export const ARROW_PLACEMENT_LAST_TURN = 100

/**
 * How many games an arrow can pull on a given turn. Cardinality halves
 * once per full round (two half-moves) from the turn it was last placed
 * or stacked, so a fresh arrow pulls at full strength on its placement
 * turn and the opponent's reply, then half that around the owner's next
 * arrow: 8, 8, 4, 4, 2, 2, 1, 1, gone. At zero the arrow is removed.
 */
export function arrowPullWeight(
  cardinality: number,
  placedTurn: number,
  currentTurn: number,
): number {
  const age = currentTurn - placedTurn
  if (age < 0) {
    return 0
  }
  return cardinality >> (age >> 1)
}

/** Add or stack an arrow, moving a refreshed stack to the end of the list. */
export function addBoardArrow(
  arrows: readonly BoardArrow[],
  arrow: Arrow,
  owner: PlayerId,
  turn: number,
): BoardArrow[] {
  const index = arrows.findIndex(
    (entry) =>
      entry.from === arrow.from &&
      entry.to === arrow.to &&
      entry.owner === owner,
  )
  if (index >= 0) {
    const existing = arrows[index]
    if (existing === undefined) {
      throw new Error('missing stacked arrow')
    }
    const refreshed: BoardArrow = {
      ...existing,
      cardinality: existing.cardinality + ARROW_DECAY_INITIAL,
      placedTurn: turn,
    }
    return [...arrows.slice(0, index), ...arrows.slice(index + 1), refreshed]
  }
  return [
    ...arrows,
    {
      from: arrow.from,
      to: arrow.to,
      owner,
      cardinality: ARROW_DECAY_INITIAL,
      placedTurn: turn,
    },
  ]
}

export function canPlaceArrows(match: MatchState): boolean {
  return match.phase.tag === 'active' && match.turn <= ARROW_PLACEMENT_LAST_TURN
}

export interface MatchOptions {
  readonly gameCount?: number
  /** Custom starting FENs, mainly for tests. Length overrides gameCount. */
  readonly fens?: readonly string[]
  /** Fix who owns white instead of drawing it from the seed. */
  readonly whitePlayer?: PlayerId
  /** Fix who places first instead of drawing it from the seed. */
  readonly firstPlacer?: PlayerId
}

export function otherPlayer(player: PlayerId): PlayerId {
  return player === 1 ? 2 : 1
}

export function sideToMove(match: MatchState): Color {
  return match.turn % 2 === 1 ? 'white' : 'black'
}

export function activePlacer(match: MatchState): PlayerId {
  return match.turn % 2 === 1
    ? match.firstPlacer
    : otherPlayer(match.firstPlacer)
}

export function activeGameCount(match: MatchState): number {
  return match.games.filter((game) => game.status.tag === 'active').length
}

export function positionKey(position: Chess): string {
  return makeFen(position.toSetup()).split(' ').slice(0, 4).join(' ')
}

function positionFromFen(fen: string): Chess {
  const setup = parseFen(fen).unwrap()
  return Chess.fromSetup(setup).unwrap()
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

  const games: MatchGame[] = []
  for (let id = 0; id < gameCount; id++) {
    const fen = fens?.[id]
    const position = fen === undefined ? Chess.default() : positionFromFen(fen)
    const repetition = new Map<string, number>()
    repetition.set(positionKey(position), 1)
    games.push({
      id,
      whiteOwner: whitePlayer,
      startingFen: makeFen(position.toSetup()),
      position,
      repetition,
      status: { tag: 'active' },
      moves: [],
    })
  }

  // Turn 1 resolves white's half-move in every game, so unless a mode
  // overrides it (solo does), the white owner also places the first
  // arrow: one draw decides both who moves first and who places first.
  const firstPlacer: PlayerId = options?.firstPlacer ?? whitePlayer

  return {
    gameCount,
    games,
    arrows: [],
    turn: 1,
    firstPlacer,
    scores: { p1: 0, p2: 0 },
    rng,
    phase: { tag: 'active' },
    lastResolution: null,
  }
}
