import { describe, expect, it } from 'vitest'
import {
  type BoardPoint,
  classifyStroke,
  describeMark,
  inkUsed,
  integrateMark,
} from './gesture'

function line(from: BoardPoint, to: BoardPoint, steps = 8): BoardPoint[] {
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

function loop(center: BoardPoint, radius: number, steps = 24): BoardPoint[] {
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

describe('stroke classification', () => {
  it('reads a straight stroke as an arrow', () => {
    const result = classifyStroke(
      line({ x: 4.5, y: 1.5 }, { x: 4.5, y: 3.5 }),
      8,
    )
    expect(result.tag).toBe('mark')
    if (result.tag !== 'mark') {
      return
    }
    expect(result.mark.tag).toBe('arrow')
    expect(describeMark(result.mark)).toBe('Arrow e2 → e4')
  })

  it('reads a closed loop as a circle', () => {
    const result = classifyStroke(loop({ x: 4.5, y: 3.5 }, 1.1), 8)
    expect(result.tag).toBe('mark')
    if (result.tag !== 'mark') {
      return
    }
    expect(result.mark.tag).toBe('circle')
    if (result.mark.tag !== 'circle') {
      return
    }
    expect(result.mark.radius).toBeGreaterThan(0.9)
    expect(result.mark.radius).toBeLessThan(1.3)
    expect(describeMark(result.mark)).toBe('Circle on e4')
  })

  it('reads a crossed stroke as a scribble', () => {
    const scribble = [
      { x: 2, y: 2 },
      { x: 4, y: 4 },
      { x: 3, y: 3.2 },
      { x: 4, y: 2 },
      { x: 2, y: 4 },
    ]
    const result = classifyStroke(scribble, 20)
    expect(result.tag).toBe('mark')
    if (result.tag !== 'mark') {
      return
    }
    expect(result.mark.tag).toBe('scribble')
  })

  it('rejects a stroke the ink budget cannot pay for', () => {
    const result = classifyStroke(
      line({ x: 0.2, y: 0.2 }, { x: 7.5, y: 0.4 }),
      2,
    )
    expect(result).toEqual({ tag: 'reject', reason: 'Not enough ink' })
  })

  it('turns a stroke that crosses an arrow into de-emphasis', () => {
    const arrow = classifyStroke(line({ x: 1, y: 1 }, { x: 5, y: 5 }), 8)
    const cross = classifyStroke(line({ x: 1, y: 5 }, { x: 5, y: 1 }), 8)
    if (arrow.tag !== 'mark' || cross.tag !== 'mark') {
      throw new Error('expected marks')
    }
    expect(arrow.mark.tag).toBe('arrow')
    const marks = integrateMark([arrow.mark], cross.mark)
    expect(marks).toHaveLength(1)
    expect(marks[0]?.tag).toBe('scribble')
    expect(inkUsed(marks)).toBeCloseTo(arrow.mark.ink + cross.mark.ink, 6)
  })
})
