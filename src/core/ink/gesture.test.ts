import { describe, expect, it } from 'vitest'
import { type BoardPoint, recognizeDrawing } from './gesture'

function line(from: BoardPoint, to: BoardPoint, steps = 12): BoardPoint[] {
  const points: BoardPoint[] = []
  for (let index = 0; index <= steps; index++) {
    const t = index / steps
    points.push({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    })
  }
  return points
}

function chevron(tip: BoardPoint, back: BoardPoint): BoardPoint[] {
  const dx = tip.x - back.x
  const dy = tip.y - back.y
  const length = Math.hypot(dx, dy) || 1
  const px = -dy / length
  const py = dx / length
  return [
    { x: back.x + px * 0.4, y: back.y + py * 0.4 },
    tip,
    { x: back.x - px * 0.4, y: back.y - py * 0.4 },
  ]
}

describe('structural drawing recognition', () => {
  it('reads a shaft plus a head as one arrow, in either order', () => {
    const shaft = line({ x: 1.2, y: 2 }, { x: 5.2, y: 2 })
    const head = chevron({ x: 5.2, y: 2 }, { x: 4.5, y: 2 })
    const forward = recognizeDrawing([shaft, head])
    const backward = recognizeDrawing([head, shaft])
    expect(forward).toHaveLength(1)
    expect(backward).toHaveLength(1)
    expect(forward[0]?.name).toBe('arrow')
    expect(backward[0]?.name).toBe('arrow')
    if (forward[0]?.mark.tag !== 'arrow' || backward[0]?.mark.tag !== 'arrow') {
      return
    }
    expect(forward[0].mark.head.x).toBeGreaterThan(forward[0].mark.tail.x)
    expect(backward[0].mark.head.x).toBeGreaterThan(backward[0].mark.tail.x)
  })

  it('does not call a small curve a circle', () => {
    const curve: BoardPoint[] = []
    for (let index = 0; index <= 16; index++) {
      const angle = 0.2 + (index / 16) * 1.3
      curve.push({
        x: 4 + Math.cos(angle) * 0.45,
        y: 4 + Math.sin(angle) * 0.45,
      })
    }
    expect(recognizeDrawing([curve])[0]?.name).toBe('scribble')
  })

  it('reads a loop about a square across as a circle and leaves a distant arrow', () => {
    const circle: BoardPoint[] = []
    for (let index = 0; index <= 24; index++) {
      const angle = (index / 24) * Math.PI * 2
      circle.push({
        x: 2 + Math.cos(angle) * 1.2,
        y: 6 + Math.sin(angle) * 1.2,
      })
    }
    const names = recognizeDrawing([
      circle,
      line({ x: 5, y: 1 }, { x: 7, y: 1 }),
      chevron({ x: 7, y: 1 }, { x: 6.4, y: 1 }),
    ])
      .map((gesture) => gesture.name)
      .sort()
    expect(names).toEqual(['arrow', 'circle'])
  })

  it('reads a cross as a scribble', () => {
    const cross = recognizeDrawing([
      line({ x: 1, y: 1 }, { x: 3, y: 3 }),
      line({ x: 1, y: 3 }, { x: 3, y: 1 }),
    ])
    expect(cross[0]?.name).toBe('scribble')
  })
})
