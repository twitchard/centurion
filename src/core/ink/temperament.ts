import { type RngState, pickIndex } from '../rng'
import { rankWeights } from './curve'

/** How many of Stockfish's ranked moves a soldier draws from. */
export const TOP_MOVE_COUNT = 10

export type TemperamentId = 'strong' | 'weak' | 'steady' | 'swingy'

export interface Temperament {
  readonly id: TemperamentId
  readonly label: string
  readonly blurb: string
  /** Positive leans toward the best rank, negative toward the worst. */
  readonly lean: number
  /** Positive peaks at both extremes, negative peaks in the middle. */
  readonly curve: number
}

/**
 * Four points in the lean/curve family, dealt as a deck.
 * Strong mostly draws the best ranks, weak the worst, steady the middle,
 * swingy the best or the worst and rarely the middle.
 */
export const TEMPERAMENTS: Record<TemperamentId, Temperament> = {
  strong: {
    id: 'strong',
    label: 'Strong',
    blurb: 'Mostly the best ranks',
    lean: 0.85,
    curve: 0,
  },
  weak: {
    id: 'weak',
    label: 'Weak',
    blurb: 'Mostly the worst ranks',
    lean: -0.85,
    curve: 0,
  },
  steady: {
    id: 'steady',
    label: 'Steady',
    blurb: 'Mostly the middle ranks',
    lean: 0,
    curve: -1.15,
  },
  swingy: {
    id: 'swingy',
    label: 'Swingy',
    blurb: 'Best or worst, rarely the middle',
    lean: 0,
    curve: 1.15,
  },
}

export const TEMPERAMENT_IDS: readonly TemperamentId[] = [
  'strong',
  'weak',
  'steady',
  'swingy',
]

const CURVES: Record<TemperamentId, readonly number[]> = {
  strong: rankWeights(
    TEMPERAMENTS.strong.lean,
    TEMPERAMENTS.strong.curve,
    TOP_MOVE_COUNT,
  ),
  weak: rankWeights(
    TEMPERAMENTS.weak.lean,
    TEMPERAMENTS.weak.curve,
    TOP_MOVE_COUNT,
  ),
  steady: rankWeights(
    TEMPERAMENTS.steady.lean,
    TEMPERAMENTS.steady.curve,
    TOP_MOVE_COUNT,
  ),
  swingy: rankWeights(
    TEMPERAMENTS.swingy.lean,
    TEMPERAMENTS.swingy.curve,
    TOP_MOVE_COUNT,
  ),
}

/** Discrete draw over `count` ranks (fewer than ten when the position is short). */
export function temperamentWeights(
  id: TemperamentId,
  count: number,
): readonly number[] {
  if (count === TOP_MOVE_COUNT) {
    return CURVES[id]
  }
  const spec = TEMPERAMENTS[id]
  return rankWeights(spec.lean, spec.curve, count)
}

export function temperamentCurve(id: TemperamentId): readonly number[] {
  return CURVES[id]
}

export type DeckCounts = Record<TemperamentId, number>

/** Fair armies are an even split. Hard replaces the weak quarter with strong. */
export function deckCounts(
  gameCount: number,
  difficulty: 'fair' | 'hard',
): DeckCounts {
  if (gameCount < 1) {
    throw new Error('A deck needs at least one soldier')
  }
  if (difficulty === 'hard') {
    const quarter = Math.floor(gameCount / 4)
    const steady = quarter
    const swingy = quarter
    return {
      strong: gameCount - steady - swingy,
      weak: 0,
      steady,
      swingy,
    }
  }
  const base = Math.floor(gameCount / 4)
  let extra = gameCount - base * 4
  const counts: DeckCounts = {
    strong: base,
    weak: base,
    steady: base,
    swingy: base,
  }
  for (const id of TEMPERAMENT_IDS) {
    if (extra === 0) {
      break
    }
    counts[id] += 1
    extra -= 1
  }
  return counts
}

export function dealTemperaments(
  counts: DeckCounts,
  rng: RngState,
): readonly [readonly TemperamentId[], RngState] {
  const deck: TemperamentId[] = []
  for (const id of TEMPERAMENT_IDS) {
    const n = counts[id]
    for (let index = 0; index < n; index++) {
      deck.push(id)
    }
  }
  let state = rng
  for (let index = deck.length - 1; index > 0; index--) {
    const [pick, next] = pickIndex(state, index + 1)
    state = next
    const swap = deck[index]
    deck[index] = deck[pick]!
    deck[pick] = swap!
  }
  return [deck, state]
}
