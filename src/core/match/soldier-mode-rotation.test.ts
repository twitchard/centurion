import { describe, expect, it } from 'vitest'
import type { SoldierMode } from './model'
import { initMatch } from './model'
import {
  STAGGERED_SCHEDULE_DWELL_TURNS,
  effectiveSoldierMode,
  initSoldierModeRotation,
  soldierModeRotationStrategies,
} from './soldier-mode-rotation'

describe('soldier mode rotation strategies', () => {
  it('static strategy keeps birth modes on every turn', () => {
    const spec = { tag: 'static' as const }
    const strategy = soldierModeRotationStrategies.static
    for (const birthMode of [0, 1, 2, 3] as const) {
      expect(strategy.effectiveMode(spec, 7, birthMode, 1)).toBe(birthMode)
      expect(strategy.effectiveMode(spec, 7, birthMode, 99)).toBe(birthMode)
    }
  })

  it('staggered schedule starts on birth mode and advances after dwell turns', () => {
    const birthModes: SoldierMode[] = [1, 2]
    const [spec] = initSoldierModeRotation(
      'staggered-schedule',
      2,
      birthModes,
      42,
    )
    if (spec.tag !== 'staggered-schedule') {
      throw new Error('expected staggered schedule')
    }
    expect(spec.permutations).toHaveLength(2)
    for (let gameId = 0; gameId < 2; gameId++) {
      expect(spec.permutations[gameId]?.[0]).toBe(birthModes[gameId])
    }

    const dwell = spec.dwellTurns
    const gameId = 0
    const perm = spec.permutations[gameId]!
    expect(effectiveSoldierMode(spec, gameId, birthModes[gameId]!, dwell)).toBe(
      perm[0],
    )
    expect(
      effectiveSoldierMode(spec, gameId, birthModes[gameId]!, dwell + 1),
    ).toBe(perm[1])
  })

  it('staggers rotation flips across game ids', () => {
    const birthModes: SoldierMode[] = [0, 1, 2]
    const [spec] = initSoldierModeRotation(
      'staggered-schedule',
      3,
      birthModes,
      99,
    )
    if (spec.tag !== 'staggered-schedule') {
      throw new Error('expected staggered schedule')
    }
    const dwell = spec.dwellTurns
    const flipsAtTurn = (gameId: number): number => dwell + (gameId % dwell) + 1

    for (let gameId = 0; gameId < 3; gameId++) {
      const birth = birthModes[gameId]!
      const perm = spec.permutations[gameId]!
      expect(
        effectiveSoldierMode(spec, gameId, birth, flipsAtTurn(gameId) - 1),
      ).toBe(perm[0])
      expect(
        effectiveSoldierMode(spec, gameId, birth, flipsAtTurn(gameId)),
      ).toBe(perm[1])
    }
  })

  it('initMatch uses staggered schedule by default', () => {
    const match = initMatch(42, { gameCount: 4 })
    expect(match.soldierModeRotation.tag).toBe('staggered-schedule')
    if (match.soldierModeRotation.tag !== 'staggered-schedule') {
      throw new Error('expected staggered schedule')
    }
    expect(match.soldierModeRotation.dwellTurns).toBe(
      STAGGERED_SCHEDULE_DWELL_TURNS,
    )
    expect(match.soldierModeRotation.permutations).toHaveLength(4)
  })

  it('initMatch accepts a static rotation override for tests', () => {
    const match = initMatch(42, {
      gameCount: 4,
      soldierModeRotation: 'static',
    })
    expect(match.soldierModeRotation).toEqual({ tag: 'static' })
  })
})
