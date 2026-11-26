import { describe, expect, it } from 'vitest'
import { emphasisFactor, emphasisPull } from './emphasis'
import type { BoardPoint, InkMark } from './gesture'
import type { Candidate } from './sample'
import { soldierDraw } from './sample'

const e2 = 12
const e4 = 28
const e6 = 44
const a2 = 8
const b2 = 9

const forwardArrow: InkMark = {
  tag: 'arrow',
  tail: { x: 4.5, y: 1.5 },
  head: { x: 4.5, y: 3.5 },
}

const circleOnE4: InkMark = {
  tag: 'circle',
  outline: loop(4.5, 3.5, 0.7),
}

const fence: InkMark = {
  tag: 'circle',
  outline: [
    { x: 2, y: 2 },
    { x: 6, y: 2 },
    { x: 6, y: 3 },
    { x: 3, y: 3 },
    { x: 3, y: 6 },
    { x: 2, y: 6 },
  ],
}

function loop(cx: number, cy: number, radius: number): BoardPoint[] {
  const points: BoardPoint[] = []
  for (let index = 0; index < 24; index++) {
    const angle = (index / 24) * Math.PI * 2
    points.push({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    })
  }
  return points
}

const scribbleOnE4: InkMark = {
  tag: 'scribble',
  points: [
    { x: 4.2, y: 3.4 },
    { x: 4.8, y: 3.6 },
    { x: 4.3, y: 3.8 },
    { x: 4.7, y: 3.2 },
  ],
}

function candidate(
  uci: string,
  from: number,
  to: number,
  cp: number,
  rank: number,
): Candidate {
  return { uci, from, to, cp, rank }
}

describe('emphasis', () => {
  it('boosts a move traveling with an arrow, most when it starts at the tail', () => {
    const along = emphasisPull([forwardArrow], e2, e4)
    const farther = emphasisPull([forwardArrow], e4, e6)
    const sideways = emphasisPull([forwardArrow], a2, b2)
    expect(along).toBeGreaterThan(0.5)
    expect(farther).toBeGreaterThan(0)
    expect(farther).toBeLessThan(along)
    expect(sideways).toBe(0)
  })

  it('boosts moves that land inside a circle and cuts moves under a scribble', () => {
    expect(emphasisPull([circleOnE4], e2, e4)).toBeGreaterThan(0.8)
    expect(emphasisPull([circleOnE4], a2, b2)).toBe(0)
    expect(emphasisPull([scribbleOnE4], e2, e4)).toBeLessThan(-0.5)
    expect(emphasisPull([scribbleOnE4], e2, e4 - 1)).toBe(0)
  })

  it('emphasizes the squares inside a fence, not the empty corner of its box', () => {
    const insideBottomArm = 4 + 2 * 8
    const emptyCorner = 4 + 4 * 8
    expect(emphasisPull([fence], e2, insideBottomArm)).toBeGreaterThan(0)
    expect(emphasisPull([fence], e2, emptyCorner)).toBe(0)
  })

  it('de-emphasizes the squares under an X', () => {
    const cross: InkMark = {
      tag: 'x',
      strokes: [
        [
          { x: 4.1, y: 3.1 },
          { x: 4.9, y: 3.9 },
        ],
        [
          { x: 4.1, y: 3.9 },
          { x: 4.9, y: 3.1 },
        ],
      ],
    }
    expect(emphasisPull([cross], e2, e4)).toBeLessThan(-0.5)
    expect(emphasisPull([cross], e2, a2)).toBe(0)
  })

  it('never hard-filters: every factor stays positive and finite', () => {
    const marks = [forwardArrow, circleOnE4, scribbleOnE4]
    const factor = emphasisFactor(marks, e2, e4)
    expect(factor).toBeGreaterThan(0)
    expect(Number.isFinite(factor)).toBe(true)
  })

  it('raises expected value for every temperament when ink favors the best move', () => {
    const candidates: Candidate[] = []
    for (let rank = 0; rank < 10; rank++) {
      const from = rank === 0 ? e2 : 8 + (rank % 7)
      const to = rank === 0 ? e4 : 16 + (rank % 7)
      candidates.push(candidate(`m${rank}`, from, to, 40 - rank * 8, rank))
    }
    for (const temperament of ['strong', 'weak', 'steady', 'swingy'] as const) {
      const draw = soldierDraw(temperament, candidates, [circleOnE4])
      expect(draw.expectedCpDelta).toBeGreaterThan(0)
      expect(draw.biased[0]).toBeGreaterThan(draw.base[0] ?? 0)
    }
  })

  it('lowers expected value when ink favors the worst move', () => {
    const candidates: Candidate[] = []
    for (let rank = 0; rank < 10; rank++) {
      const to = rank === 9 ? e4 : 16 + rank
      const from = rank === 9 ? e2 : 8 + rank
      candidates.push(candidate(`m${rank}`, from, to, 40 - rank * 8, rank))
    }
    const draw = soldierDraw('steady', candidates, [circleOnE4])
    expect(draw.expectedCpDelta).toBeLessThan(0)
    expect(draw.favoriteBiased).toBe(9)
  })
})
