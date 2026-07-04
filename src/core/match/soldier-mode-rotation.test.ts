import { describe, expect, it } from 'vitest'
import type { SoldierMode } from './model'
import { initMatch } from './model'
import {
  STAGGERED_SCHEDULE_DWELL_TURNS,
  effectiveSoldierMode,
  initSoldierModeRotation,
} from './soldier-mode-rotation'

describe('soldier mode rotation strategies', () => {
  it('static strategy keeps birth modes on every turn', () => {
    const spec = { tag: 'static' as const }
    for (const birthMode of [0, 1, 2, 3] as const) {
      const [mode, rng] = effectiveSoldierMode(spec, 7, birthMode, 1, 42)
      expect(mode).toBe(birthMode)
      expect(rng).toBe(42)
      const [lateMode, lateRng] = effectiveSoldierMode(
        spec,
        7,
        birthMode,
        99,
        42,
      )
      expect(lateMode).toBe(birthMode)
      expect(lateRng).toBe(42)
    }
  })

  it('per-turn random draws a fresh mode and advances the rng', () => {
    const spec = { tag: 'per-turn-random' as const }
    const [firstMode, afterFirst] = effectiveSoldierMode(spec, 0, 0, 1, 99)
    const [secondMode, afterSecond] = effectiveSoldierMode(
      spec,
      1,
      0,
      1,
      afterFirst,
    )
    expect(firstMode).toBeGreaterThanOrEqual(0)
    expect(firstMode).toBeLessThanOrEqual(3)
    expect(secondMode).toBeGreaterThanOrEqual(0)
    expect(secondMode).toBeLessThanOrEqual(3)
    expect(afterSecond).not.toBe(99)
    expect(afterSecond).not.toBe(afterFirst)
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
    const [beforeFlip] = effectiveSoldierMode(
      spec,
      gameId,
      birthModes[gameId]!,
      dwell,
      0,
    )
    const [afterFlip] = effectiveSoldierMode(
      spec,
      gameId,
      birthModes[gameId]!,
      dwell + 1,
      0,
    )
    expect(beforeFlip).toBe(perm[0])
    expect(afterFlip).toBe(perm[1])
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
      const [beforeFlip] = effectiveSoldierMode(
        spec,
        gameId,
        birth,
        flipsAtTurn(gameId) - 1,
        0,
      )
      const [afterFlip] = effectiveSoldierMode(
        spec,
        gameId,
        birth,
        flipsAtTurn(gameId),
        0,
      )
      expect(beforeFlip).toBe(perm[0])
      expect(afterFlip).toBe(perm[1])
    }
  })

  it('initMatch uses per-turn random by default', () => {
    const match = initMatch(42, { gameCount: 4 })
    expect(match.soldierModeRotation).toEqual({ tag: 'per-turn-random' })
  })

  it('initMatch accepts a static rotation override for tests', () => {
    const match = initMatch(42, {
      gameCount: 4,
      soldierModeRotation: 'static',
    })
    expect(match.soldierModeRotation).toEqual({ tag: 'static' })
  })

  it('initMatch can still opt into staggered schedule', () => {
    const match = initMatch(42, {
      gameCount: 4,
      soldierModeRotation: 'staggered-schedule',
    })
    if (match.soldierModeRotation.tag !== 'staggered-schedule') {
      throw new Error('expected staggered schedule')
    }
    expect(match.soldierModeRotation.dwellTurns).toBe(
      STAGGERED_SCHEDULE_DWELL_TURNS,
    )
    expect(match.soldierModeRotation.permutations).toHaveLength(4)
  })
})
