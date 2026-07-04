import {
  MATE_THRESHOLD_CP,
  type MatchGame,
  type MatchState,
  type PlayerId,
} from './model'

/** Half-pawn width for each histogram bin (centipawns). */
export const MICRO_PAWN_HISTOGRAM_BIN_CP = 50

/** Symmetric bins around even; extremes clamp to the outer bars. */
export const MICRO_PAWN_HISTOGRAM_BIN_COUNT = 7

export interface MicroPawnAggregate {
  readonly activeGames: number
  /** Mean centipawns from `viewer`'s perspective across active games. */
  readonly averageCp: number
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

function clampCpForHistogram(cp: number): number {
  if (cp >= MATE_THRESHOLD_CP) {
    return (
      (Math.floor(MICRO_PAWN_HISTOGRAM_BIN_COUNT / 2) + 2) *
      MICRO_PAWN_HISTOGRAM_BIN_CP
    )
  }
  if (cp <= -MATE_THRESHOLD_CP) {
    return (
      -(Math.floor(MICRO_PAWN_HISTOGRAM_BIN_COUNT / 2) + 2) *
      MICRO_PAWN_HISTOGRAM_BIN_CP
    )
  }
  return cp
}

/**
 * Bucket active games by viewer-relative eval into a symmetric histogram.
 * The center bin is roughly even; outer bins clamp extreme scores.
 */
export function microPawnHistogram(
  match: MatchState,
  viewer: PlayerId,
  binCount: number = MICRO_PAWN_HISTOGRAM_BIN_COUNT,
): readonly number[] {
  const bins = Array.from({ length: binCount }, () => 0)
  const center = Math.floor(binCount / 2)
  for (const game of match.games) {
    if (game.status.tag !== 'active') {
      continue
    }
    const cp = clampCpForHistogram(evalForPlayer(game, viewer))
    const offset = Math.round(cp / MICRO_PAWN_HISTOGRAM_BIN_CP)
    const index = Math.max(0, Math.min(binCount - 1, center + offset))
    bins[index] = (bins[index] ?? 0) + 1
  }
  return bins
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
  for (const game of match.games) {
    if (game.status.tag !== 'active') {
      continue
    }
    activeGames += 1
    sum += evalForPlayer(game, viewer)
  }
  return {
    activeGames,
    averageCp: activeGames === 0 ? 0 : sum / activeGames,
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

/** Accessible label for the positional histogram. */
export function microPawnHistogramLabel(
  match: MatchState,
  viewer: PlayerId,
): string {
  const stats = aggregateMicroPawnStats(match, viewer)
  if (stats.activeGames === 0) {
    return 'No active games'
  }
  const bins = microPawnHistogram(match, viewer)
  const center = Math.floor(bins.length / 2)
  const behind = bins
    .slice(0, center)
    .reduce((total, count) => total + count, 0)
  const ahead = bins
    .slice(center + 1)
    .reduce((total, count) => total + count, 0)
  const even = bins[center] ?? 0
  return `Average position ${formatMicroPawns(stats.averageCp)} pawns across ${stats.activeGames} games; ${ahead} ahead, ${even} even, ${behind} behind`
}
