import { describe, expect, it } from 'vitest'
import {
  type SavedDrawing,
  confirmedExpect,
  correctionExpect,
  decodeSavedDrawing,
  drawingLogEndpoint,
  drawingLogEntryEndpoint,
  encodeNewDrawing,
  exportRecordings,
} from './drawing-log'
import { parseStrokeExport } from './stroke-fixtures'

const STROKES = [
  [
    { x: 1, y: 2 },
    { x: 1, y: 4 },
  ],
] as const

describe('drawing log endpoints', () => {
  it('writes under the subtree the database rules already allow', () => {
    expect(drawingLogEndpoint('https://db.example.com/')).toBe(
      'https://db.example.com/__trystero__/centurion-drawings.json',
    )
    expect(drawingLogEntryEndpoint('https://db.example.com', '-Nabc')).toBe(
      'https://db.example.com/__trystero__/centurion-drawings/-Nabc.json',
    )
  })
})

describe('encode and decode', () => {
  it('omits expect until a correction and stamps the server time', () => {
    expect(
      encodeNewDrawing({
        author: 'owner',
        strokes: STROKES,
        recognized: ['arrow'],
        readings: ['Arrow b2 → b4'],
        build: 'abc1234',
      }),
    ).toEqual({
      author: 'owner',
      strokes: STROKES,
      recognized: ['arrow'],
      readings: ['Arrow b2 → b4'],
      at: { '.sv': 'timestamp' },
      build: 'abc1234',
      corrected: false,
    })
  })

  it('reads a record back, including Firebase array-as-object form', () => {
    const decoded = decodeSavedDrawing('-Nabc', {
      author: 'owner',
      strokes: { 0: { 0: { x: 1, y: 2 }, 1: { x: 1.5, y: 4 } } },
      recognized: { 0: 'arrow', 1: 'circle' },
      readings: ['Arrow b2 → b4', 'Circle on e4'],
      at: 1_700_000_000_000,
      build: 'abc1234',
      corrected: false,
    })
    expect(decoded).toMatchObject({
      id: '-Nabc',
      author: 'owner',
      expect: null,
      recognized: ['arrow', 'circle'],
      corrected: false,
    })
    expect(decoded?.strokes).toEqual([
      [
        { x: 1, y: 2 },
        { x: 1.5, y: 4 },
      ],
    ])
  })

  it('rejects junk and a correction that is not a label list', () => {
    expect(decodeSavedDrawing('id', { author: 'stranger' })).toBeNull()
    expect(
      decodeSavedDrawing('id', {
        author: 'owner',
        strokes: STROKES,
        recognized: ['arrow'],
        readings: ['Arrow'],
        at: 1,
        build: 'dev',
        corrected: true,
        expect: ['nope'],
      }),
    ).toBeNull()
  })
})

describe('corrections and export', () => {
  const saved: SavedDrawing = {
    id: '-Nabc',
    author: 'owner',
    expect: null,
    strokes: STROKES,
    recognized: ['arrow', 'circle'],
    readings: ['Arrow b2 → b4', 'Circle on e4'],
    at: 10,
    build: 'abc1234',
    corrected: false,
  }

  it('leaves an uncorrected drawing implicitly confirmed', () => {
    expect(correctionExpect(['arrow', 'circle'], [null, null])).toBeNull()
    expect(confirmedExpect(saved)).toEqual(['arrow', 'circle'])
  })

  it('keeps the other shapes when one is corrected', () => {
    expect(correctionExpect(['arrow', 'circle'], ['scribble', null])).toEqual([
      'scribble',
      'circle',
    ])
    expect(correctionExpect(['arrow'], ['ignore'])).toEqual(['ignore'])
  })

  it('exports uncorrected drawings with the recognizer as expect', () => {
    const corrected: SavedDrawing = {
      ...saved,
      id: '-Ndef',
      expect: ['x', 'circle'],
      corrected: true,
    }
    const exported = exportRecordings([saved, corrected])
    expect(exported[0]?.expect).toEqual(['arrow', 'circle'])
    expect(exported[0]?.corrected).toBe(false)
    expect(exported[1]?.expect).toEqual(['x', 'circle'])
    const parsed = parseStrokeExport(
      JSON.stringify({ recordings: [exported[0]] }),
    )
    expect(parsed[0]?.expect).toEqual(['arrow', 'circle'])
    expect(parsed[0]?.author).toBe('owner')
  })
})
