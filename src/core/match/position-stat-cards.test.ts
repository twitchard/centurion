import { describe, expect, it } from 'vitest'
import { initMatch } from './model'
import { positionStatCards } from './position-stat-cards'

describe('positionStatCards', () => {
  it('lists every stat in one grid', () => {
    const match = initMatch(1, { gameCount: 100, whitePlayer: 1 })
    const cards = positionStatCards(match, 1)
    expect(cards.map((card) => card.id)).toEqual([
      'active-games',
      'median-eval',
      'started-games',
      'queens',
      'pawn-rank',
      'in-check',
      'castle',
      'promotion',
    ])
    expect(cards.every((card) => card.icon.length > 0)).toBe(true)
    expect(cards.every((card) => card.tip.length > 10)).toBe(true)
  })
})
