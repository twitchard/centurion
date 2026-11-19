/** A point on the board in square units. (0, 0) is the a1 corner; (8, 8) is h8. */
export interface BoardPoint {
  readonly x: number
  readonly y: number
}

export type InkMark =
  | {
      readonly tag: 'arrow'
      readonly tail: BoardPoint
      readonly head: BoardPoint
    }
  | {
      readonly tag: 'circle'
      readonly center: BoardPoint
      readonly radius: number
    }
  | {
      readonly tag: 'scribble'
      readonly points: readonly BoardPoint[]
    }

export type GestureName = 'arrow' | 'circle' | 'scribble'

/**
 * After the last stroke, wait this long with no new stroke, then read
 * the drawing and send it. Two seconds leaves room to add a head or undo.
 */
export const COMMIT_IDLE_MS = 2000

/** How long the cleaned shapes stay on the board as the turn is sent. */
export const REVEAL_MS = 650

/**
 * Structural reading of a drawing, in board squares. Strokes that touch
 * are one gesture. An arrow is a long, mostly straight shaft with a head
 * at one end: other short strokes sitting on that end, or a hook in the
 * shaft itself. A circle is ink that closes around an area at least about
 * a square across. Anything else, including a short curve, is a scribble.
 */
const MIN_STROKE_LENGTH = 0.15
const GROUP_DISTANCE = 0.9
const MIN_SHAFT_LENGTH = 0.85
const SHAFT_STRAIGHTNESS = 0.75
const HEAD_REACH = 0.75
const MAX_HEAD_LENGTH = 1.7
const HOOK_TURN = 0.5
const MIN_CIRCLE_RADIUS = 0.75
const MIN_CIRCLE_COVERAGE = 0.7

export interface RecognizedGesture {
  readonly name: GestureName
  readonly mark: InkMark
}

export function recognizeDrawing(
  strokes: readonly (readonly BoardPoint[])[],
): readonly RecognizedGesture[] {
  const usable = strokes.filter(
    (stroke) => pathLength(stroke) >= MIN_STROKE_LENGTH,
  )
  return groupStrokes(usable).map((group) => {
    const mark = classifyGroup(group)
    return { name: mark.tag, mark }
  })
}

export function interpretDrawing(
  strokes: readonly (readonly BoardPoint[])[],
): readonly InkMark[] {
  return recognizeDrawing(strokes).map((gesture) => gesture.mark)
}

export function describeMark(mark: InkMark): string {
  switch (mark.tag) {
    case 'arrow': {
      const from = squareNameAt(mark.tail)
      const to = squareNameAt(mark.head)
      return from === to ? `Arrow on ${from}` : `Arrow ${from} → ${to}`
    }
    case 'circle':
      return `Circle on ${squareNameAt(mark.center)}`
    case 'scribble': {
      const mid = mark.points[Math.floor(mark.points.length / 2)]
      return mid === undefined ? 'Scribble' : `Scribble on ${squareNameAt(mid)}`
    }
  }
}

export function squareNameAt(point: BoardPoint): string {
  const file = Math.min(7, Math.max(0, Math.floor(point.x)))
  const rank = Math.min(7, Math.max(0, Math.floor(point.y)))
  return `${String.fromCharCode(97 + file)}${rank + 1}`
}

export function distance(a: BoardPoint, b: BoardPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function classifyGroup(strokes: readonly (readonly BoardPoint[])[]): InkMark {
  const arrow = asArrow(strokes)
  if (arrow !== null) {
    return arrow
  }
  const circle = asCircle(strokes)
  if (circle !== null) {
    return circle
  }
  return { tag: 'scribble', points: strokes.flat() }
}

function asArrow(strokes: readonly (readonly BoardPoint[])[]): InkMark | null {
  let shaftIndex = -1
  let shaftLength = 0
  for (let index = 0; index < strokes.length; index++) {
    const stroke = strokes[index] ?? []
    const length = pathLength(stroke)
    if (
      length >= MIN_SHAFT_LENGTH &&
      straightness(stroke) >= SHAFT_STRAIGHTNESS &&
      length > shaftLength
    ) {
      shaftLength = length
      shaftIndex = index
    }
  }
  if (shaftIndex < 0) {
    return strokes.length === 1 ? hookedArrow(strokes[0] ?? []) : null
  }
  const shaft = strokes[shaftIndex] ?? []
  const start = shaft[0]
  const end = shaft[shaft.length - 1]
  if (start === undefined || end === undefined) {
    return null
  }
  const others = strokes.filter((_, index) => index !== shaftIndex)
  if (others.length === 0) {
    return hookedArrow(shaft)
  }
  const atStart = others.filter(
    (stroke) =>
      isHead(stroke, shaftLength) && closerEnd(stroke, start, end) === 'tip',
  )
  const atEnd = others.filter(
    (stroke) =>
      isHead(stroke, shaftLength) && closerEnd(stroke, end, start) === 'tip',
  )
  const startInk = atStart.reduce((sum, stroke) => sum + pathLength(stroke), 0)
  const endInk = atEnd.reduce((sum, stroke) => sum + pathLength(stroke), 0)
  if (startInk === 0 && endInk === 0) {
    return null
  }
  if (
    startInk > 0 &&
    endInk > 0 &&
    startInk < endInk * 2 &&
    endInk < startInk * 2
  ) {
    return null
  }
  if (endInk >= startInk) {
    return { tag: 'arrow', tail: start, head: end }
  }
  return { tag: 'arrow', tail: end, head: start }
}

function isHead(stroke: readonly BoardPoint[], shaftLength: number): boolean {
  const length = pathLength(stroke)
  if (length > MAX_HEAD_LENGTH) {
    return false
  }
  return !(length >= shaftLength && straightness(stroke) >= SHAFT_STRAIGHTNESS)
}

function closerEnd(
  stroke: readonly BoardPoint[],
  end: BoardPoint,
  other: BoardPoint,
): 'tip' | 'neither' {
  let nearest = Number.POSITIVE_INFINITY
  for (const point of stroke) {
    nearest = Math.min(nearest, distance(point, end))
  }
  if (nearest > HEAD_REACH) {
    return 'neither'
  }
  const center = averagePoint(stroke)
  return distance(center, end) <= distance(center, other) ? 'tip' : 'neither'
}

function hookedArrow(shaft: readonly BoardPoint[]): InkMark | null {
  if (shaft.length < 6) {
    return null
  }
  const split = Math.max(2, Math.floor(shaft.length * 0.72))
  const body = shaft.slice(0, split + 1)
  const hook = shaft.slice(split)
  const bodyLength = pathLength(body)
  const hookLength = pathLength(hook)
  if (bodyLength < MIN_SHAFT_LENGTH || hookLength < 0.2 || hookLength > 1.3) {
    return null
  }
  if (straightness(body) < SHAFT_STRAIGHTNESS) {
    return null
  }
  const turn = turnAngle(
    body[0] ?? hook[0] ?? { x: 0, y: 0 },
    body[body.length - 1] ?? { x: 0, y: 0 },
    hook[0] ?? { x: 0, y: 0 },
    hook[hook.length - 1] ?? { x: 0, y: 0 },
  )
  if (turn < HOOK_TURN) {
    return null
  }
  const tail = body[0]
  const head = body[body.length - 1]
  if (tail === undefined || head === undefined) {
    return null
  }
  return { tag: 'arrow', tail, head }
}

function asCircle(strokes: readonly (readonly BoardPoint[])[]): InkMark | null {
  const points = strokes.flat()
  if (points.length < 8) {
    return null
  }
  const center = averagePoint(points)
  let radiusSum = 0
  const sectors = 12
  const filled = new Set<number>()
  for (const point of points) {
    const dx = point.x - center.x
    const dy = point.y - center.y
    radiusSum += Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx)
    const sector =
      Math.floor(((angle + Math.PI) / (Math.PI * 2)) * sectors) % sectors
    filled.add(sector)
  }
  const radius = radiusSum / points.length
  const coverage = filled.size / sectors
  const length = strokes.reduce((sum, stroke) => sum + pathLength(stroke), 0)
  if (radius < MIN_CIRCLE_RADIUS || coverage < MIN_CIRCLE_COVERAGE) {
    return null
  }
  if (length < Math.PI * 2 * radius * 0.65) {
    return null
  }
  return { tag: 'circle', center, radius }
}

function groupStrokes(
  strokes: readonly (readonly BoardPoint[])[],
): (readonly BoardPoint[])[][] {
  const parent = strokes.map((_, index) => index)
  const find = (index: number): number => {
    let cursor = index
    while (parent[cursor] !== cursor) {
      cursor = parent[cursor] ?? cursor
    }
    return cursor
  }
  for (let left = 0; left < strokes.length; left++) {
    for (let right = left + 1; right < strokes.length; right++) {
      if (strokesAreClose(strokes[left] ?? [], strokes[right] ?? [])) {
        const a = find(left)
        const b = find(right)
        if (a !== b) {
          parent[b] = a
        }
      }
    }
  }
  const groups = new Map<number, BoardPoint[][]>()
  for (let index = 0; index < strokes.length; index++) {
    const root = find(index)
    const group = groups.get(root) ?? []
    group.push([...(strokes[index] ?? [])])
    groups.set(root, group)
  }
  return [...groups.values()]
}

function strokesAreClose(
  left: readonly BoardPoint[],
  right: readonly BoardPoint[],
): boolean {
  for (const a of left) {
    for (const b of right) {
      if (distance(a, b) <= GROUP_DISTANCE) {
        return true
      }
    }
  }
  return false
}

function straightness(points: readonly BoardPoint[]): number {
  const length = pathLength(points)
  const start = points[0]
  const end = points[points.length - 1]
  if (length < 1e-6 || start === undefined || end === undefined) {
    return 0
  }
  return distance(start, end) / length
}

function turnAngle(
  a: BoardPoint,
  b: BoardPoint,
  c: BoardPoint,
  d: BoardPoint,
): number {
  const ax = b.x - a.x
  const ay = b.y - a.y
  const bx = d.x - c.x
  const by = d.y - c.y
  const am = Math.hypot(ax, ay)
  const bm = Math.hypot(bx, by)
  if (am < 1e-6 || bm < 1e-6) {
    return 0
  }
  const cos = Math.min(1, Math.max(-1, (ax * bx + ay * by) / (am * bm)))
  return Math.acos(cos)
}

export function pathLength(points: readonly BoardPoint[]): number {
  let length = 0
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1]
    const current = points[index]
    if (previous === undefined || current === undefined) {
      continue
    }
    length += distance(previous, current)
  }
  return length
}

function averagePoint(points: readonly BoardPoint[]): BoardPoint {
  if (points.length === 0) {
    return { x: 0, y: 0 }
  }
  let x = 0
  let y = 0
  for (const point of points) {
    x += point.x
    y += point.y
  }
  return { x: x / points.length, y: y / points.length }
}
