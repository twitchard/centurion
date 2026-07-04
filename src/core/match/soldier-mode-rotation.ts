import { type RngState, pickIndex } from '../rng'
import type { SoldierMode } from './model'

/**
 * Serializable rotation configuration for a match. Each tag selects a
 * {@link SoldierModeRotationStrategy} from {@link soldierModeRotationStrategies}.
 */
export type SoldierModeRotationSpec =
  | { readonly tag: 'static' }
  | {
      readonly tag: 'staggered-schedule'
      readonly dwellTurns: number
      /** Per-game visit order through the four soldier modes. */
      readonly permutations: readonly (readonly SoldierMode[])[]
    }

/** How many turns a game keeps one mode before advancing its schedule. */
export const STAGGERED_SCHEDULE_DWELL_TURNS = 25

export const DEFAULT_SOLDIER_MODE_ROTATION_TAG = 'staggered-schedule' as const

export type SoldierModeRotationTag = SoldierModeRotationSpec['tag']

/**
 * Pluggable policy for which soldier mode applies on a given turn.
 * Add a new implementation and register it in
 * {@link soldierModeRotationStrategies} to try a different rotation scheme.
 */
export interface SoldierModeRotationStrategy {
  readonly tag: SoldierModeRotationTag
  init(
    gameCount: number,
    birthModes: readonly SoldierMode[],
    rng: RngState,
  ): readonly [SoldierModeRotationSpec, RngState]
  effectiveMode(
    spec: SoldierModeRotationSpec,
    gameId: number,
    birthMode: SoldierMode,
    turn: number,
  ): SoldierMode
}

const staticStrategy: SoldierModeRotationStrategy = {
  tag: 'static',
  init(_gameCount, _birthModes, rng) {
    return [{ tag: 'static' }, rng]
  },
  effectiveMode(_spec, _gameId, birthMode) {
    return birthMode
  },
}

const staggeredScheduleStrategy: SoldierModeRotationStrategy = {
  tag: 'staggered-schedule',
  init(gameCount, birthModes, rng) {
    const packed: SoldierMode[][] = []
    let state = rng
    for (let gameId = 0; gameId < gameCount; gameId++) {
      const birthMode = birthModes[gameId]
      if (birthMode === undefined) {
        throw new Error(`missing birth soldier mode for game ${gameId}`)
      }
      const [perm, nextState] = shuffledModePermutation(birthMode, state)
      state = nextState
      packed.push([...perm])
    }
    return [
      {
        tag: 'staggered-schedule',
        dwellTurns: STAGGERED_SCHEDULE_DWELL_TURNS,
        permutations: packed,
      },
      state,
    ]
  },
  effectiveMode(spec, gameId, birthMode, turn) {
    if (spec.tag !== 'staggered-schedule') {
      return birthMode
    }
    const perm = spec.permutations[gameId]
    if (perm === undefined || perm.length !== 4) {
      return birthMode
    }
    const offset = gameId % spec.dwellTurns
    const adjustedTurn = turn - 1 - offset
    if (adjustedTurn < 0) {
      return perm[0]!
    }
    const phase = Math.floor(adjustedTurn / spec.dwellTurns)
    return perm[phase % 4]!
  },
}

export const soldierModeRotationStrategies = {
  static: staticStrategy,
  'staggered-schedule': staggeredScheduleStrategy,
} satisfies Record<SoldierModeRotationTag, SoldierModeRotationStrategy>

function strategyForTag(
  tag: SoldierModeRotationTag,
): SoldierModeRotationStrategy {
  return soldierModeRotationStrategies[tag]
}

export function initSoldierModeRotation(
  tag: SoldierModeRotationTag,
  gameCount: number,
  birthModes: readonly SoldierMode[],
  rng: RngState,
): readonly [SoldierModeRotationSpec, RngState] {
  return strategyForTag(tag).init(gameCount, birthModes, rng)
}

export function effectiveSoldierMode(
  spec: SoldierModeRotationSpec,
  gameId: number,
  birthMode: SoldierMode,
  turn: number,
): SoldierMode {
  return strategyForTag(spec.tag).effectiveMode(spec, gameId, birthMode, turn)
}

function shuffledModePermutation(
  birthMode: SoldierMode,
  rng: RngState,
): readonly [readonly SoldierMode[], RngState] {
  const modes: SoldierMode[] = [0, 1, 2, 3]
  let state = rng
  for (let index = modes.length - 1; index > 0; index--) {
    const [pick, nextState] = pickIndex(state, index + 1)
    state = nextState
    const swap = modes[index]
    modes[index] = modes[pick]!
    modes[pick] = swap!
  }
  const start = modes.indexOf(birthMode)
  if (start < 0) {
    throw new Error('birth mode missing from permutation draw')
  }
  const rotated = [...modes.slice(start), ...modes.slice(0, start)]
  return [rotated, state]
}

export function isSoldierModeRotationSpec(
  value: unknown,
): value is SoldierModeRotationSpec {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const raw = value as SoldierModeRotationSpec
  if (raw.tag === 'static') {
    return true
  }
  if (raw.tag !== 'staggered-schedule') {
    return false
  }
  if (
    typeof raw.dwellTurns !== 'number' ||
    raw.dwellTurns < 1 ||
    !Array.isArray(raw.permutations)
  ) {
    return false
  }
  for (const perm of raw.permutations) {
    if (!Array.isArray(perm) || perm.length !== 4) {
      return false
    }
    for (const mode of perm) {
      if (mode !== 0 && mode !== 1 && mode !== 2 && mode !== 3) {
        return false
      }
    }
  }
  return true
}

/** Legacy snapshots without rotation metadata behave as static birth modes. */
export const LEGACY_STATIC_SOLDIER_MODE_ROTATION: SoldierModeRotationSpec = {
  tag: 'static',
}
