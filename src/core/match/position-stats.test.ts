import { describe, expect, it } from 'vitest'
import { initMatch } from './model'
import { aggregatePositionStats } from './position-stats'

describe('aggregatePositionStats', () => {
  it('counts queens and pawn ranks from the viewer perspective', () => {
    const match = initMatch(1, { gameCount: 2, whitePlayer: 1 })
    const stats = aggregatePositionStats(match, 1)
    expect(stats.activeGames).toBe(2)
    expect(stats.queens).toBe(2)
    expect(stats.averagePawnRank).toBe(2)
    expect(stats.gamesInCheck).toBe(0)
    expect(stats.castlesAvailable).toBe(2)
    expect(stats.promotionsAvailable).toBe(0)
  })
})
