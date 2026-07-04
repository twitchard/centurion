import {
  MATE_THRESHOLD_CP,
  type MatchGame,
  type MatchState,
  type PlayerId,
} from './model'

/** A quarter-pawn band counts as "even" when bucketing games. */
export const MICRO_PAWN_EVEN_THRESHOLD_CP = 25

export interface MicroPawnAggregate {
  readonly activeGames: number
  /** Mean centipawns from `viewer`'s perspective across active games. */
  readonly averageCp: number
  readonly ahead: number
  readonly behind: number
  readonly even: number
}

/** Centipawns from white's perspective after the last resolved half-move. */
export function evalFromWhiteAfterMove(
  moverIsWhite: boolean,
  moveCp: number,
): number {
  return moverIsWhite ? moveCp : -moveCp
}

/** Position evaluation from one player's perspective in a single game. */
export function evalForPlayer(game: MatchGame, player: PlayerId): number {
  return game.whiteOwner === player ? game.evalCp : -game.evalCp
}

function bucketCp(cp: number): 'ahead' | 'behind' | 'even' {
  if (cp > MICRO_PAWN_EVEN_THRESHOLD_CP) {
    return 'ahead'
  }
  if (cp < -MICRO_PAWN_EVEN_THRESHOLD_CP) {
    return 'behind'
  }
  return 'even'
}

/**
 * Summarise how far `viewer` is ahead across every still-active game,
 * using each game's stored micro-pawn evaluation.
 */
export function aggregateMicroPawnStats(
  match: MatchState,
  viewer: PlayerId,
): MicroPawnAggregate {
  let sum = 0
  let activeGames = 0
  let ahead = 0
  let behind = 0
  let even = 0
  for (const game of match.games) {
    if (game.status.tag !== 'active') {
      continue
    }
    activeGames += 1
    const cp = evalForPlayer(game, viewer)
    sum += cp
    switch (bucketCp(cp)) {
      case 'ahead':
        ahead += 1
        break
      case 'behind':
        behind += 1
        break
      case 'even':
        even += 1
        break
      default:
        break
    }
  }
  return {
    activeGames,
    averageCp: activeGames === 0 ? 0 : sum / activeGames,
    ahead,
    behind,
    even,
  }
}

/** Format centipawns as a signed pawn fraction, e.g. "+0.35". */
export function formatMicroPawns(cp: number): string {
  if (cp >= MATE_THRESHOLD_CP) {
    return '#'
  }
  if (cp <= -MATE_THRESHOLD_CP) {
    return '−#'
  }
  const pawns = cp / 100
  if (Math.abs(pawns) < 0.005) {
    return '0.00'
  }
  const sign = pawns > 0 ? '+' : '−'
  return `${sign}${Math.abs(pawns).toFixed(2)}`
}

/** One-line summary for the match chrome. */
export function microPawnSummaryText(
  match: MatchState,
  viewer: PlayerId,
): string | null {
  const stats = aggregateMicroPawnStats(match, viewer)
  if (stats.activeGames === 0) {
    return null
  }
  const avg = formatMicroPawns(stats.averageCp)
  return `${avg} pawn avg · ${stats.ahead}↑ ${stats.even}= ${stats.behind}↓`
}
