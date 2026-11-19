import type { BoardPoint } from './gesture'
import { OWNER_RECORDING_DATA } from './owner-recordings'

export type StrokeAuthor = 'agent' | 'owner'
export type StrokeLabel = 'arrow' | 'circle' | 'scribble' | 'x'

export interface StrokeRecording {
  readonly id: string
  readonly author: StrokeAuthor
  readonly expect: readonly StrokeLabel[] | null
  readonly strokes: readonly (readonly BoardPoint[])[]
}

/**
 * Recordings made while building the structural reader. None of these
 * were drawn by the owner. A closed loop counts as a circle down to well
 * under a square; only a dot does not. An open curve stays a scribble.
 */
export const AGENT_RECORDINGS: readonly StrokeRecording[] = [
  recording(
    'agent-shaft-then-v',
    ['arrow'],
    [wobble(line(1.4, 2, 5.2, 2.15), 3), vHead(5.2, 2.15, 4.55, 2.05)],
  ),
  recording(
    'agent-v-then-shaft',
    ['arrow'],
    [vHead(3.1, 6.4, 3.05, 5.7), wobble(line(3.05, 2.2, 3.1, 6.4), 5)],
  ),
  recording(
    'agent-single-line-head',
    ['arrow'],
    [wobble(line(1.2, 5.1, 4.8, 5.3), 7), line(4.75, 5.25, 4.15, 5.7)],
  ),
  recording(
    'agent-curved-shaft',
    ['arrow'],
    [bow(1.3, 1.2, 4.6, 1.5, 0.35), vHead(4.6, 1.5, 4.05, 1.35)],
  ),
  recording(
    'agent-short-arrow',
    ['arrow'],
    [line(2, 3, 3.15, 3.15), vHead(3.15, 3.15, 2.7, 3.05)],
  ),
  recording(
    'agent-two-square-arrow',
    ['arrow'],
    [wobble(line(4, 4, 6.1, 4.2), 9), line(6.05, 4.15, 5.45, 4.65)],
  ),
  recording('agent-hooked-shaft', ['arrow'], [hooked(1.5, 4, 4.4, 4.2)]),
  recording(
    'agent-real-circle',
    ['circle'],
    [loop(4, 4, 1.35, 0, Math.PI * 2)],
  ),
  recording(
    'agent-two-semicircles',
    ['circle'],
    [
      loop(4.2, 3.8, 1.2, 0.15, Math.PI),
      loop(4.2, 3.8, 1.2, Math.PI, Math.PI * 2.05),
    ],
  ),
  recording('agent-small-curve', ['scribble'], [loop(2, 6, 0.45, 0.2, 1.5)]),
  recording('agent-tiny-loop', ['circle'], [loop(6, 2, 0.35, 0, Math.PI * 2)]),
  recording('agent-dot', ['scribble'], [loop(6.4, 1.2, 0.12, 0, Math.PI * 2)]),
  recording(
    'agent-cross',
    ['x'],
    [line(1, 1, 2.4, 2.5), line(1.1, 2.4, 2.5, 1)],
  ),
]

/** The owner's recorded drawings, with the labels he described. */
export const OWNER_RECORDINGS: readonly StrokeRecording[] =
  OWNER_RECORDING_DATA.map((row) => ({
    id: row.id,
    author: 'owner' as const,
    expect: row.expect,
    strokes: row.strokes,
  }))

export function parseStrokeExport(raw: string): readonly StrokeRecording[] {
  const parsed: unknown = JSON.parse(raw)
  const wrapped = prop(parsed, 'recordings')
  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(wrapped)
      ? wrapped
      : null
  if (rows === null) {
    throw new Error('Stroke export must be an array or { recordings: [] }')
  }
  return rows.map((row, index) => recordingFromUnknown(row, index))
}

function recording(
  id: string,
  expect: readonly StrokeLabel[],
  strokes: readonly (readonly BoardPoint[])[],
): StrokeRecording {
  return { id, author: 'agent', expect, strokes }
}

function recordingFromUnknown(row: unknown, index: number): StrokeRecording {
  const strokesRaw = prop(row, 'strokes')
  if (!Array.isArray(strokesRaw)) {
    throw new Error(`Recording ${index} is missing strokes`)
  }
  const authorValue = prop(row, 'author')
  const author = authorValue === 'owner' ? 'owner' : 'agent'
  const expectValue = prop(row, 'expect')
  const expect = labelsFrom(expectValue)
  const idValue = prop(row, 'id')
  const id = typeof idValue === 'string' ? idValue : `recording-${index + 1}`
  const strokes = strokesRaw.map((stroke, strokeIndex) => {
    if (!Array.isArray(stroke)) {
      throw new Error(`Recording ${id} stroke ${strokeIndex} is not a list`)
    }
    return stroke.map((point) => {
      const x = prop(point, 'x')
      const y = prop(point, 'y')
      if (typeof x !== 'number' || typeof y !== 'number') {
        throw new Error(`Recording ${id} has a point that is not {x, y}`)
      }
      return { x, y }
    })
  })
  return { id, author, expect, strokes }
}

function prop(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  return (value as { readonly [key: string]: unknown })[key]
}

function labelsFrom(value: unknown): readonly StrokeLabel[] | null {
  if (isLabel(value)) {
    return [value]
  }
  if (!Array.isArray(value) || value.length === 0 || !value.every(isLabel)) {
    return null
  }
  return value
}

function isLabel(value: unknown): value is StrokeLabel {
  return (
    value === 'arrow' ||
    value === 'circle' ||
    value === 'scribble' ||
    value === 'x'
  )
}

function line(x0: number, y0: number, x1: number, y1: number): BoardPoint[] {
  const points: BoardPoint[] = []
  const steps = 14
  for (let step = 0; step <= steps; step++) {
    const t = step / steps
    points.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t })
  }
  return points
}

function wobble(points: readonly BoardPoint[], seed: number): BoardPoint[] {
  let state = seed
  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) {
      return point
    }
    state = (state * 1664525 + 1013904223) >>> 0
    const jx = (state / 0x100000000 - 0.5) * 0.12
    state = (state * 1664525 + 1013904223) >>> 0
    const jy = (state / 0x100000000 - 0.5) * 0.12
    return { x: point.x + jx, y: point.y + jy }
  })
}

function bow(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  amount: number,
): BoardPoint[] {
  const points = line(x0, y0, x1, y1)
  const dx = y0 - y1
  const dy = x1 - x0
  const length = Math.hypot(dx, dy) || 1
  return points.map((point, index) => {
    const t = index / (points.length - 1)
    const lift = Math.sin(t * Math.PI) * amount
    return {
      x: point.x + (dx / length) * lift,
      y: point.y + (dy / length) * lift,
    }
  })
}

function vHead(
  tipX: number,
  tipY: number,
  backX: number,
  backY: number,
): BoardPoint[] {
  const dx = tipX - backX
  const dy = tipY - backY
  const length = Math.hypot(dx, dy) || 1
  const px = -dy / length
  const py = dx / length
  return [
    { x: backX + px * 0.42, y: backY + py * 0.42 },
    { x: tipX, y: tipY },
    { x: backX - px * 0.38, y: backY - py * 0.38 },
  ]
}

function hooked(x0: number, y0: number, x1: number, y1: number): BoardPoint[] {
  const shaft = line(x0, y0, x1, y1)
  const dx = x1 - x0
  const dy = y1 - y0
  const length = Math.hypot(dx, dy) || 1
  const px = -dy / length
  const py = dx / length
  return [
    ...shaft,
    {
      x: x1 - (dx / length) * 0.15 + px * 0.28,
      y: y1 - (dy / length) * 0.15 + py * 0.28,
    },
    {
      x: x1 - (dx / length) * 0.45 + px * 0.55,
      y: y1 - (dy / length) * 0.45 + py * 0.55,
    },
  ]
}

function loop(
  cx: number,
  cy: number,
  radius: number,
  start: number,
  end: number,
): BoardPoint[] {
  const points: BoardPoint[] = []
  const steps = 22
  for (let step = 0; step <= steps; step++) {
    const angle = start + ((end - start) * step) / steps
    points.push({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    })
  }
  return points
}
