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

function loop(center: BoardPoint, radius: number, steps = 28): BoardPoint[] {
  const points: BoardPoint[] = []
  for (let index = 0; index <= steps; index++) {
    const angle = (index / steps) * Math.PI * 2
    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
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
    { x: back.x + px * 0.45, y: back.y + py * 0.45 },
    tip,
    { x: back.x - px * 0.45, y: back.y - py * 0.45 },
  ]
}

describe('$P drawing recognition', () => {
  it('reads a one-stroke line as an arrow in the direction it was drawn', () => {
    const [gesture] = recognizeDrawing([
      line({ x: 4.5, y: 1.4 }, { x: 4.5, y: 3.6 }),
    ])
    expect(gesture?.name).toBe('arrow')
    expect(gesture?.mark.tag).toBe('arrow')
    if (gesture?.mark.tag !== 'arrow') {
      return
    }
    expect(gesture.mark.head.y).toBeGreaterThan(gesture.mark.tail.y)
  })

  it('reads a shaft plus a separate head as one arrow, head last or first', () => {
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

  it('reads a closed loop as a circle and keeps a distant arrow separate', () => {
    const gestures = recognizeDrawing([
      loop({ x: 2, y: 6 }, 1.1),
      line({ x: 5, y: 1 }, { x: 7, y: 1 }),
    ])
    const names = gestures.map((gesture) => gesture.name).sort()
    expect(names).toEqual(['arrow', 'circle'])
  })

  it('reads a crossed pair and a zigzag as scribbles', () => {
    const cross = recognizeDrawing([
      line({ x: 1, y: 1 }, { x: 3, y: 3 }),
      line({ x: 1, y: 3 }, { x: 3, y: 1 }),
    ])
    const messy = recognizeDrawing([
      [
        { x: 4, y: 4 },
        { x: 4.8, y: 5.1 },
        { x: 4.1, y: 5.4 },
        { x: 5.2, y: 6.2 },
        { x: 4.4, y: 5.8 },
        { x: 5.4, y: 6.6 },
      ],
    ])
    expect(cross[0]?.name).toBe('scribble')
    expect(messy[0]?.name).toBe('scribble')
  })
})
