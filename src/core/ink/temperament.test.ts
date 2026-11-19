import { describe, expect, it } from 'vitest'
import { seedRng } from '../rng'
import { dealTemperaments, deckCounts, temperamentCurve } from './temperament'

describe('temperament deck', () => {
  it('deals 25 of each temperament to a fair army of 100', () => {
    expect(deckCounts(100, 'fair')).toEqual({
      strong: 25,
      weak: 25,
      steady: 25,
      swingy: 25,
    })
    const [deck] = dealTemperaments(deckCounts(100, 'fair'), seedRng(7))
    expect(deck).toHaveLength(100)
    expect(deck.filter((id) => id === 'strong')).toHaveLength(25)
    expect(deck.filter((id) => id === 'weak')).toHaveLength(25)
    expect(deck.filter((id) => id === 'steady')).toHaveLength(25)
    expect(deck.filter((id) => id === 'swingy')).toHaveLength(25)
  })

  it('gives a hard computer half strong soldiers and no weak ones', () => {
    expect(deckCounts(100, 'hard')).toEqual({
      strong: 50,
      weak: 0,
      steady: 25,
      swingy: 25,
    })
  })

  it('shuffles deterministically from the seed', () => {
    const counts = deckCounts(8, 'fair')
    const [first] = dealTemperaments(counts, seedRng(3))
    const [again] = dealTemperaments(counts, seedRng(3))
    expect(first).toEqual(again)
    expect(new Set(first).size).toBeGreaterThan(1)
  })

  it('keeps every curve explainable as a single shape', () => {
    for (const id of ['strong', 'weak', 'steady', 'swingy'] as const) {
      const curve = temperamentCurve(id)
      expect(curve.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 8)
    }
  })
})
