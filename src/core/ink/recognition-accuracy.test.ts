import { describe, expect, it } from 'vitest'
import { emphasisPull, squareCenter } from './emphasis'
import { distance, interpretDrawing, recognizeDrawing } from './gesture'
import {
  AGENT_RECORDINGS,
  OWNER_RECORDINGS,
  type StrokeRecording,
  parseStrokeExport,
} from './stroke-fixtures'

function labelsOf(sample: StrokeRecording): string {
  return recognizeDrawing(sample.strokes)
    .map((gesture) => gesture.name)
    .join('+')
}

function expectedOf(sample: StrokeRecording): string {
  return (sample.expect ?? []).join('+')
}

describe('recognition against realistic recordings', () => {
  it('matches every agent recording', () => {
    const misses = AGENT_RECORDINGS.filter(
      (sample) =>
        sample.expect !== null && labelsOf(sample) !== expectedOf(sample),
    ).map(
      (sample) =>
        `${sample.id}: expected ${expectedOf(sample)}, got ${labelsOf(sample)}`,
    )
    expect(misses).toEqual([])
    expect(AGENT_RECORDINGS.length).toBeGreaterThanOrEqual(10)
  })

  it('matches every owner recording', () => {
    expect(OWNER_RECORDINGS.length).toBe(16)
    const misses = OWNER_RECORDINGS.filter(
      (sample) => labelsOf(sample) !== expectedOf(sample),
    ).map(
      (sample) =>
        `${sample.id}: expected ${expectedOf(sample)}, got ${labelsOf(sample)}`,
    )
    expect(misses).toEqual([])
    for (const sample of OWNER_RECORDINGS) {
      expect(sample.author).toBe('owner')
    }
  })

  it('points the owner arrows toward the head', () => {
    const byId = new Map(OWNER_RECORDINGS.map((sample) => [sample.id, sample]))
    const direction = (id: string) => {
      const sample = byId.get(id)
      const mark =
        sample === undefined ? undefined : interpretDrawing(sample.strokes)[0]
      if (mark === undefined || mark.tag !== 'arrow') {
        return 0
      }
      return mark.head.y - mark.tail.y
    }
    expect(direction('recording-1')).toBeGreaterThan(1)
    expect(direction('recording-2')).toBeLessThan(-1)
    expect(direction('recording-5')).toBeGreaterThan(1)
  })

  it('emphasizes the fence interior rather than a fitted disk', () => {
    const fence = OWNER_RECORDINGS.find(
      (sample) => sample.id === 'recording-11',
    )
    if (fence === undefined) {
      throw new Error('recording-11 missing')
    }
    const marks = interpretDrawing(fence.strokes)
    const outline = marks[0]?.tag === 'circle' ? marks[0].outline : []
    expect(outline.length).toBeGreaterThan(8)
    let x = 0
    let y = 0
    for (const point of outline) {
      x += point.x
      y += point.y
    }
    const center = { x: x / outline.length, y: y / outline.length }
    let radius = 0
    for (const point of outline) {
      radius += distance(point, center)
    }
    radius /= outline.length
    let inside = 0
    let diskOnly = 0
    for (let square = 0; square < 64; square++) {
      const pull = emphasisPull(marks, 0, square)
      if (pull > 0) {
        inside += 1
        continue
      }
      if (distance(squareCenter(square), center) < radius - 0.2) {
        diskOnly += 1
      }
    }
    expect(inside).toBeGreaterThan(3)
    expect(diskOnly).toBeGreaterThan(0)
  })

  it('round-trips an exported recording into the same reading', () => {
    const exported = JSON.stringify({ recordings: AGENT_RECORDINGS })
    const parsed = parseStrokeExport(exported)
    expect(parsed).toHaveLength(AGENT_RECORDINGS.length)
    for (const sample of parsed) {
      if (sample.expect === null) {
        continue
      }
      expect(labelsOf(sample)).toBe(expectedOf(sample))
    }
  })
})
