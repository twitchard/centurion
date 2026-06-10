import { Chess } from 'chessops/chess'
import { makeFen, parseFen } from 'chessops/fen'
import type { Color } from 'chessops/types'
import { type RngState, pickIndex, seedRng } from '../rng'

export type PlayerId = 1 | 2

/** Board square index, a1 = 0 .. h8 = 63 (chessops convention). */
export type BoardSquare = number

/**
 * An arrow on the unified board, stored in the canonical frame
 * (player 1's point of view). Player 2 sees the board rank-flipped.
 */
export interface Arrow {
  readonly from: BoardSquare
  readonly to: BoardSquare
}

export interface PlacedArrow {
  readonly arrow: Arrow
  readonly placedBy: PlayerId
  readonly turn: number
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

export interface MatchGame {
  readonly id: number
  readonly whiteOwner: PlayerId
  readonly position: Chess
  readonly repetition: ReadonlyMap<string, number>
  readonly status: GameStatus
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
  readonly arrows: readonly PlacedArrow[]
  readonly turn: number
  readonly firstPlacer: PlayerId
  readonly scores: { readonly p1: number; readonly p2: number }
  readonly rng: RngState
  readonly phase: MatchPhase
  readonly lastResolution: ResolutionSummary | null
}

export const DEFAULT_GAME_COUNT = 100

export interface MatchOptions {
  readonly gameCount?: number
  /** Custom starting FENs, mainly for tests. Length overrides gameCount. */
  readonly fens?: readonly string[]
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

  const p1WhiteCount = Math.ceil(gameCount / 2)
  const games: MatchGame[] = []
  for (let id = 0; id < gameCount; id++) {
    const fen = fens?.[id]
    const position = fen === undefined ? Chess.default() : positionFromFen(fen)
    const repetition = new Map<string, number>()
    repetition.set(positionKey(position), 1)
    games.push({
      id,
      whiteOwner: id < p1WhiteCount ? 1 : 2,
      position,
      repetition,
      status: { tag: 'active' },
    })
  }

  let rng = seedRng(seed)
  let firstPlacer: PlayerId
  if (options?.firstPlacer !== undefined) {
    firstPlacer = options.firstPlacer
  } else if (p1WhiteCount * 2 > gameCount) {
    firstPlacer = 1
  } else {
    const [pick, nextRng] = pickIndex(rng, 2)
    rng = nextRng
    firstPlacer = pick === 0 ? 1 : 2
  }

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
