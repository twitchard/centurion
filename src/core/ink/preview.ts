import type { RankedMove } from '../match/resolve'
import { type InkMark, describeMark } from './gesture'
import type { InkMatch } from './match'
import { inkSearchTargets } from './match'
import { legalTopMoves, soldierDraw } from './sample'
import { TEMPERAMENT_IDS, type TemperamentId } from './temperament'

export interface InkPreview {
  readonly games: number
  readonly shifted: number
  readonly byTemperament: Readonly<Record<TemperamentId, number>>
  /** Sum of per-game expected centipawns versus the unled draw. */
  readonly expectedCpDelta: number
  readonly markLabels: readonly string[]
}

/**
 * How this ink would move each soldier's favorite, before anyone commits.
 * Empty ink shifts nothing. Mate stays forced, so it never counts as a shift.
 */
export function previewInk(
  match: InkMatch,
  ranked: readonly (readonly RankedMove[])[],
  marks: readonly InkMark[],
): InkPreview | null {
  const targets = inkSearchTargets(match)
  if (ranked.length !== targets.gameIds.length) {
    return null
  }
  const byTemperament: Record<TemperamentId, number> = {
    strong: 0,
    weak: 0,
    steady: 0,
    swingy: 0,
  }
  let shifted = 0
  let expectedCpDelta = 0
  let games = 0

  for (let index = 0; index < targets.gameIds.length; index++) {
    const gameId = targets.gameIds[index]
    const list = ranked[index]
    if (gameId === undefined || list === undefined) {
      return null
    }
    const game = match.games.find((entry) => entry.id === gameId)
    if (game === undefined || game.status.tag !== 'active') {
      return null
    }
    const candidates = legalTopMoves(game.position, list)
    if (candidates.length === 0) {
      return null
    }
    const draw = soldierDraw(game.playerTemperament, candidates, marks)
    games += 1
    expectedCpDelta += draw.expectedCpDelta
    if (draw.favoriteBase !== draw.favoriteBiased) {
      shifted += 1
      byTemperament[game.playerTemperament] += 1
    }
  }

  return {
    games,
    shifted,
    byTemperament,
    expectedCpDelta,
    markLabels: marks.map((mark) => describeMark(mark)),
  }
}

export function previewShiftLine(preview: InkPreview): string {
  if (preview.markLabels.length === 0) {
    return 'No ink yet. Soldiers will draw on their own.'
  }
  const parts = TEMPERAMENT_IDS.filter(
    (id) => (preview.byTemperament[id] ?? 0) > 0,
  ).map((id) => `${id} ${preview.byTemperament[id]}`)
  const who = parts.length === 0 ? '' : ` (${parts.join(', ')})`
  return `Shifts the favorite in ${preview.shifted} of ${preview.games} games${who}.`
}
