import { describe, expect, it } from 'vitest'
import { rankWeights } from './curve'
import { temperamentCurve, temperamentWeights } from './temperament'

describe('rank curve', () => {
  it('sums to one', () => {
    const weights = rankWeights(0.85, 0, 10)
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    expect(total).toBeCloseTo(1, 8)
  })

  it('leans toward the best ranks when lean is positive', () => {
    const weights = temperamentCurve('strong')
    expect(weights[0]).toBeGreaterThan(weights[1] ?? 0)
    expect(weights[1]).toBeGreaterThan(weights[9] ?? 0)
    expect(weights[0]).toBeGreaterThan(0.18)
    expect(weights[0]).toBeLessThan(0.5)
  })

  it('mirrors that lean for weak soldiers', () => {
    const strong = temperamentCurve('strong')
    const weak = temperamentCurve('weak')
    for (let rank = 0; rank < strong.length; rank++) {
      expect(weak[rank]).toBeCloseTo(strong[strong.length - 1 - rank] ?? 0, 8)
    }
  })

  it('peaks in the middle for steady soldiers and at the ends for swingy ones', () => {
    const steady = temperamentCurve('steady')
    const swingy = temperamentCurve('swingy')
    expect(steady[4]).toBeGreaterThan(steady[0] ?? 0)
    expect(steady[5]).toBeGreaterThan(steady[9] ?? 0)
    expect(swingy[0]).toBeGreaterThan(swingy[4] ?? 0)
    expect(swingy[9]).toBeGreaterThan(swingy[5] ?? 0)
  })

  it('renormalizes the same family onto a shorter list', () => {
    const weights = temperamentWeights('strong', 3)
    expect(weights).toHaveLength(3)
    expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 8)
    expect(weights[0]).toBeGreaterThan(weights[2] ?? 0)
  })
})
