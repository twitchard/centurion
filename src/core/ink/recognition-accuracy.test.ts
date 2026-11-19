import { describe, expect, it } from 'vitest'
import { type BoardPoint, recognizeDrawing } from './gesture'
import {
  RECORDED_STROKES,
  type StrokeLabel,
  type StrokeRecording,
} from './stroke-fixtures'

function line(from: BoardPoint, to: BoardPoint, steps = 10): BoardPoint[] {
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

function arc(
  center: BoardPoint,
  radius: number,
  start: number,
  end: number,
  steps = 16,
): BoardPoint[] {
  const points: BoardPoint[] = []
  for (let index = 0; index <= steps; index++) {
    const angle = start + ((end - start) * index) / steps
    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    })
  }
  return points
}

const SYNTHETIC: readonly StrokeRecording[] = [
  {
    id: 'synthetic-short-arrow',
    source: 'synthetic',
    expect: 'arrow',
    strokes: [line({ x: 2, y: 2 }, { x: 3.1, y: 2.4 }, 6)],
  },
  {
    id: 'synthetic-clockwise-circle',
    source: 'synthetic',
    expect: 'circle',
    strokes: [arc({ x: 4, y: 4 }, 1.2, 0, -Math.PI * 2, 24)],
  },
  {
    id: 'synthetic-two-stroke-circle',
    source: 'synthetic',
    expect: 'circle',
    strokes: [
      arc({ x: 4, y: 4 }, 1.2, 0.2, Math.PI, 12),
      arc({ x: 4, y: 4 }, 1.2, Math.PI, Math.PI * 2.05, 12),
    ],
  },
  {
    id: 'synthetic-tiny-cross',
    source: 'synthetic',
    expect: 'scribble',
    strokes: [
      line({ x: 5, y: 5 }, { x: 5.9, y: 5.8 }, 5),
      line({ x: 5, y: 5.8 }, { x: 5.9, y: 5 }, 5),
    ],
  },
]

function labelOf(strokes: StrokeRecording['strokes']): StrokeLabel | 'split' {
  const names = recognizeDrawing(strokes).map((gesture) => gesture.name)
  if (names.length !== 1) {
    return 'split'
  }
  return names[0] ?? 'split'
}

describe('$P accuracy on recorded and synthetic strokes', () => {
  const corpus = [...RECORDED_STROKES, ...SYNTHETIC]

  it('classifies every sample as the gesture that was drawn', () => {
    const misses: string[] = []
    for (const sample of corpus) {
      const got = labelOf(sample.strokes)
      if (got !== sample.expect) {
        misses.push(`${sample.id}: expected ${sample.expect}, got ${got}`)
      }
    }
    expect(misses).toEqual([])
  })

  it('keeps the recorded mouse and touch set fully correct', () => {
    const recorded = RECORDED_STROKES.filter(
      (sample) => sample.source === 'mouse' || sample.source === 'touch',
    )
    const correct = recorded.filter(
      (sample) => labelOf(sample.strokes) === sample.expect,
    ).length
    expect(recorded.length).toBeGreaterThanOrEqual(12)
    expect(correct / recorded.length).toBe(1)
  })
})
