import {
  MATE_THRESHOLD_CP,
  type MatchGame,
  type MatchState,
  type PlayerId,
} from './model'

/** Inner histogram bins between the mate clamps (7 total = 2 mate + 5 spread). */
export const MICRO_PAWN_HISTOGRAM_BIN_COUNT = 7

export interface MicroPawnAggregate {
  readonly activeGames: number
  /** Median centipawns from `viewer`'s perspective across active games. */
  readonly medianCp: number
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

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((left, right) => left - right)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
  }
  return sorted[mid] ?? 0
}

function activeEvals(match: MatchState, viewer: PlayerId): number[] {
  const evals: number[] = []
  for (const game of match.games) {
    if (game.status.tag !== 'active') {
      continue
    }
    evals.push(evalForPlayer(game, viewer))
  }
  return evals
}

/**
 * Bucket active games by viewer-relative eval. Mate scores clamp to the
 * outer bars; everything else spreads across the middle bins using the
 * current min/max so the histogram uses its full width.
 */
export function microPawnHistogram(
  match: MatchState,
  viewer: PlayerId,
  binCount: number = MICRO_PAWN_HISTOGRAM_BIN_COUNT,
): readonly number[] {
  const bins = Array.from({ length: binCount }, () => 0)
  if (binCount < 3) {
    return bins
  }
  const evals = activeEvals(match, viewer)
  const matesBehind = evals.filter((cp) => cp <= -MATE_THRESHOLD_CP).length
  const matesAhead = evals.filter((cp) => cp >= MATE_THRESHOLD_CP).length
  const normal = evals.filter(
    (cp) => cp > -MATE_THRESHOLD_CP && cp < MATE_THRESHOLD_CP,
  )

  bins[0] = matesBehind
  bins[binCount - 1] = matesAhead

  if (normal.length === 0) {
    return bins
  }

  const middleBinCount = binCount - 2
  const sorted = [...normal].sort((left, right) => left - right)
  const min = sorted[0] ?? 0
  const max = sorted[sorted.length - 1] ?? 0
  const range = max - min

  for (const cp of normal) {
    if (range === 0) {
      const center = Math.floor(binCount / 2)
      bins[center] = (bins[center] ?? 0) + 1
      continue
    }
    const ratio = (cp - min) / range
    const offset = Math.min(
      middleBinCount - 1,
      Math.max(0, Math.floor(ratio * middleBinCount)),
    )
    bins[1 + offset] = (bins[1 + offset] ?? 0) + 1
  }

  return bins
}

/**
 * Summarise how far `viewer` is ahead across every still-active game,
 * using the median micro-pawn evaluation (robust to lopsided outliers).
 */
export function aggregateMicroPawnStats(
  match: MatchState,
  viewer: PlayerId,
): MicroPawnAggregate {
  const evals = activeEvals(match, viewer)
  return {
    activeGames: evals.length,
    medianCp: median(evals),
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
  return `Median position ${formatMicroPawns(stats.medianCp)} pawns across ${stats.activeGames} games; ${ahead} ahead, ${even} even, ${behind} behind`
}
