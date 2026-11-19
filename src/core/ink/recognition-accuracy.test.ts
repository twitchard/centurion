import { describe, expect, it } from 'vitest'
import { recognizeDrawing } from './gesture'
import {
  AGENT_RECORDINGS,
  OWNER_RECORDINGS,
  type StrokeRecording,
  parseStrokeExport,
} from './stroke-fixtures'

function labelOf(sample: StrokeRecording): string {
  const names = recognizeDrawing(sample.strokes).map((gesture) => gesture.name)
  return names.length === 1 ? (names[0] ?? 'split') : 'split'
}

describe('recognition against realistic recordings', () => {
  it('matches every agent recording and has no owner recordings yet', () => {
    expect(OWNER_RECORDINGS).toEqual([])
    const misses = AGENT_RECORDINGS.filter(
      (sample) => sample.expect !== null && labelOf(sample) !== sample.expect,
    ).map(
      (sample) =>
        `${sample.id}: expected ${sample.expect}, got ${labelOf(sample)}`,
    )
    expect(misses).toEqual([])
    expect(AGENT_RECORDINGS.length).toBeGreaterThanOrEqual(10)
  })

  it('round-trips an exported recording into the same reading', () => {
    const exported = JSON.stringify({ recordings: AGENT_RECORDINGS })
    const parsed = parseStrokeExport(exported)
    expect(parsed).toHaveLength(AGENT_RECORDINGS.length)
    for (const sample of parsed) {
      if (sample.expect === null) {
        continue
      }
      expect(labelOf(sample)).toBe(sample.expect)
    }
  })
})
