export type RngState = number

export function seedRng(seed: number): RngState {
  return seed >>> 0
}

export function nextU32(state: RngState): readonly [number, RngState] {
  const nextState = (state + 0x6d2b79f5) >>> 0
  let t = nextState
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = (t ^ (t >>> 14)) >>> 0
  return [value, nextState]
}

export function pickIndex(
  state: RngState,
  length: number,
): readonly [number, RngState] {
  if (length <= 0) {
    throw new Error('pickIndex requires a non-empty range')
  }
  const [value, nextState] = nextU32(state)
  return [value % length, nextState]
}

/**
 * Sample an index proportionally to `weights`. When every weight is zero
 * (or not finite), returns -1 with the state still advanced, so callers
 * can fall back deterministically without forking the rng stream.
 */
export function pickWeighted(
  state: RngState,
  weights: readonly number[],
): readonly [number, RngState] {
  if (weights.length === 0) {
    throw new Error('pickWeighted requires a non-empty range')
  }
  const [value, nextState] = nextU32(state)
  let total = 0
  for (const weight of weights) {
    if (Number.isFinite(weight) && weight > 0) {
      total += weight
    }
  }
  if (total <= 0) {
    return [-1, nextState]
  }
  let remaining = (value / 0x100000000) * total
  for (let index = 0; index < weights.length; index++) {
    const weight = weights[index]
    if (weight === undefined || !Number.isFinite(weight) || weight <= 0) {
      continue
    }
    remaining -= weight
    if (remaining <= 0) {
      return [index, nextState]
    }
  }
  return [weights.length - 1, nextState]
}
