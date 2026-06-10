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
