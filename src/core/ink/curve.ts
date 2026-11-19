/**
 * Two-parameter family over the engine's top ranks. Rank 0 is the best
 * move. `lean` pulls toward the best (positive) or the worst (negative).
 * `curve` peaks in the middle when negative and at both extremes when
 * positive. Weights are the softmax of that quadratic, so the shape is
 * easy to read off the two numbers.
 */

export function rankWeights(
  lean: number,
  curve: number,
  count: number,
): number[] {
  if (count < 1) {
    return []
  }
  const raw: number[] = []
  for (let rank = 0; rank < count; rank++) {
    const t = count === 1 ? 0 : rank / (count - 1)
    // -1 at the best rank, +1 at the worst.
    const fromMid = (t - 0.5) / 0.5
    const logW = -lean * fromMid + curve * fromMid * fromMid
    raw.push(Math.exp(logW))
  }
  return normalize(raw)
}

export function normalize(weights: readonly number[]): number[] {
  let total = 0
  for (const weight of weights) {
    if (Number.isFinite(weight) && weight > 0) {
      total += weight
    }
  }
  if (total <= 0) {
    const share = weights.length === 0 ? 0 : 1 / weights.length
    return weights.map(() => share)
  }
  return weights.map((weight) =>
    Number.isFinite(weight) && weight > 0 ? weight / total : 0,
  )
}
