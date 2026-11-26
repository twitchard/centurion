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
      readonly outline: readonly BoardPoint[]
    }
  | {
      readonly tag: 'scribble'
      readonly points: readonly BoardPoint[]
    }
  | {
      readonly tag: 'x'
      readonly strokes: readonly (readonly BoardPoint[])[]
    }

export type GestureName = 'arrow' | 'circle' | 'scribble' | 'x'

/**
 * After the last stroke, wait this long with no new stroke, then read
 * the drawing and send it. Two seconds leaves room to add a head or undo.
 */
export const COMMIT_IDLE_MS = 2000

/** How long the cleaned shapes stay on the board as the turn is sent. */
export const REVEAL_MS = 650

/**
 * Structural reading, in board squares. Strokes within about a square of
 * each other are one gesture.
 * An arrow is a stroke drawn out to a tip, with a short stroke meeting
 * that tip or the stroke hooking back from it. It points from the start
 * toward the tip, curved shaft included.
 * A circle is ink that comes back to its start and encloses more than a
 * dot. The shape can be a loop or a fence; the area is that outline.
 * An X is two straight strokes of similar length that cross.
 * Anything else is a scribble.
 */
const MIN_STROKE_LENGTH = 0.15
const GROUP_DISTANCE = 0.9
const MIN_SHAFT_LENGTH = 0.85
const SHAFT_PROGRESS = 0.5
const HEAD_REACH = 0.75
const MAX_HEAD_SPAN = 1.85
const HOOK_TURN = 0.5
const MIN_LOOP_RADIUS = 0.2
const MIN_LOOP_AREA = 0.15
const CLOSE_GAP = 0.8
const MAX_REVERSALS = 3
const MAX_LOOP_WRAPS = 3
const MIN_X_LENGTH = 0.8
const X_LENGTH_RATIO = 0.6
const X_STRAIGHTNESS = 0.85

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
      return `Circle on ${squareNameAt(boxCenter(mark.outline))}`
    case 'scribble':
      return mark.points.length === 0
        ? 'Scribble'
        : `Scribble on ${squareNameAt(boxCenter(mark.points))}`
    case 'x':
      return `X on ${squareNameAt(boxCenter(mark.strokes.flat()))}`
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
  const cross = asX(strokes)
  if (cross !== null) {
    return cross
  }
  const circle = asCircle(strokes)
  if (circle !== null) {
    return circle
  }
  const arrow = asArrow(strokes)
  if (arrow !== null) {
    return arrow
  }
  return { tag: 'scribble', points: strokes.flat() }
}

function asX(strokes: readonly (readonly BoardPoint[])[]): InkMark | null {
  if (strokes.length !== 2) {
    return null
  }
  const left = strokes[0] ?? []
  const right = strokes[1] ?? []
  const leftLength = pathLength(left)
  const rightLength = pathLength(right)
  const shorter = Math.min(leftLength, rightLength)
  const longer = Math.max(leftLength, rightLength)
  if (shorter < MIN_X_LENGTH || shorter / longer < X_LENGTH_RATIO) {
    return null
  }
  if (
    straightness(left) < X_STRAIGHTNESS ||
    straightness(right) < X_STRAIGHTNESS
  ) {
    return null
  }
  if (!crossesInTheMiddle(left, right)) {
    return null
  }
  return { tag: 'x', strokes: [left, right] }
}

function asCircle(strokes: readonly (readonly BoardPoint[])[]): InkMark | null {
  const outline = strokes.flat()
  if (outline.length < 8 || !inkCloses(strokes)) {
    return null
  }
  if (reversalCount(outline) > MAX_REVERSALS) {
    return null
  }
  const center = averagePoint(outline)
  let radius = 0
  for (const point of outline) {
    radius += distance(point, center)
  }
  radius /= outline.length
  if (radius < MIN_LOOP_RADIUS || polygonArea(outline) < MIN_LOOP_AREA) {
    return null
  }
  const length = strokes.reduce((sum, stroke) => sum + pathLength(stroke), 0)
  if (length > Math.PI * 2 * radius * MAX_LOOP_WRAPS) {
    return null
  }
  return { tag: 'circle', outline }
}

function asArrow(strokes: readonly (readonly BoardPoint[])[]): InkMark | null {
  let best: { tail: BoardPoint; head: BoardPoint; length: number } | null = null
  for (let index = 0; index < strokes.length; index++) {
    const stroke = strokes[index] ?? []
    const others = strokes.filter((_, other) => other !== index)
    const aimed = arrowAim(stroke, others)
    if (aimed === null) {
      continue
    }
    if (best === null || aimed.length > best.length) {
      best = aimed
    }
  }
  if (best === null) {
    return null
  }
  return { tag: 'arrow', tail: best.tail, head: best.head }
}

function arrowAim(
  stroke: readonly BoardPoint[],
  others: readonly (readonly BoardPoint[])[],
): { tail: BoardPoint; head: BoardPoint; length: number } | null {
  const start = stroke[0]
  if (start === undefined || stroke.length < 2) {
    return null
  }
  let meet: { tail: BoardPoint; head: BoardPoint; length: number } | null = null
  for (const other of others) {
    if (span(other) > MAX_HEAD_SPAN) {
      continue
    }
    const hit = closestPointIndex(stroke, other)
    if (hit.distance > HEAD_REACH) {
      continue
    }
    const prefix = stroke.slice(0, hit.index + 1)
    const length = pathLength(prefix)
    const total = pathLength(stroke)
    if (length < MIN_SHAFT_LENGTH || length < total * 0.55) {
      continue
    }
    if (straightness(prefix) < SHAFT_PROGRESS) {
      continue
    }
    const tip = stroke[hit.index]
    if (tip === undefined) {
      continue
    }
    const center = averagePoint(other)
    if (distance(center, tip) > distance(center, start)) {
      continue
    }
    if (meet === null || length > meet.length) {
      meet = { tail: start, head: tip, length }
    }
  }
  if (meet !== null) {
    return meet
  }
  return hookedAim(stroke, start)
}

function hookedAim(
  stroke: readonly BoardPoint[],
  start: BoardPoint,
): { tail: BoardPoint; head: BoardPoint; length: number } | null {
  let tipIndex = 0
  let tipDistance = 0
  for (let index = 1; index < stroke.length; index++) {
    const point = stroke[index]
    if (point === undefined) {
      continue
    }
    const away = distance(start, point)
    if (away > tipDistance) {
      tipDistance = away
      tipIndex = index
    }
  }
  const tip = stroke[tipIndex]
  if (tip === undefined) {
    return null
  }
  const prefix = stroke.slice(0, tipIndex + 1)
  const length = pathLength(prefix)
  if (length < MIN_SHAFT_LENGTH || straightness(prefix) < SHAFT_PROGRESS) {
    return null
  }
  if (!wingHooksBack(stroke, tipIndex, length)) {
    return null
  }
  return { tail: start, head: tip, length }
}

function closestPointIndex(
  shaft: readonly BoardPoint[],
  other: readonly BoardPoint[],
): { index: number; distance: number } {
  let best = Number.POSITIVE_INFINITY
  let index = 0
  for (let shaftIndex = 0; shaftIndex < shaft.length; shaftIndex++) {
    const point = shaft[shaftIndex]
    if (point === undefined) {
      continue
    }
    for (const sample of other) {
      const gap = distance(point, sample)
      if (gap < best) {
        best = gap
        index = shaftIndex
      }
    }
  }
  return { index, distance: best }
}

function wingHooksBack(
  stroke: readonly BoardPoint[],
  tipIndex: number,
  shaftLength: number,
): boolean {
  if (tipIndex < 2 || tipIndex >= stroke.length - 1) {
    return false
  }
  const start = stroke[0]
  const tip = stroke[tipIndex]
  const end = stroke[stroke.length - 1]
  if (start === undefined || tip === undefined || end === undefined) {
    return false
  }
  const wingLength = pathLength(stroke.slice(tipIndex))
  if (wingLength < 0.25 || wingLength > shaftLength * 0.7) {
    return false
  }
  return turnAngle(start, tip, tip, end) >= HOOK_TURN
}

function inkCloses(strokes: readonly (readonly BoardPoint[])[]): boolean {
  const first = strokes[0]
  if (first === undefined || first.length === 0) {
    return false
  }
  if (strokes.length === 1) {
    const start = first[0]
    const end = first[first.length - 1]
    return (
      start !== undefined &&
      end !== undefined &&
      distance(start, end) <= CLOSE_GAP
    )
  }
  for (let index = 0; index < strokes.length; index++) {
    const current = strokes[index]
    const next = strokes[(index + 1) % strokes.length]
    const end = current?.[current.length - 1]
    const start = next?.[0]
    if (
      end === undefined ||
      start === undefined ||
      distance(end, start) > CLOSE_GAP
    ) {
      return false
    }
  }
  return true
}

function reversalCount(points: readonly BoardPoint[]): number {
  let reversals = 0
  let previous = 1
  for (let index = 2; index < points.length; index++) {
    const before = points[index - 2]
    const mid = points[index - 1]
    const after = points[index]
    if (before === undefined || mid === undefined || after === undefined) {
      continue
    }
    const ax = mid.x - before.x
    const ay = mid.y - before.y
    const bx = after.x - mid.x
    const by = after.y - mid.y
    const am = Math.hypot(ax, ay)
    const bm = Math.hypot(bx, by)
    if (am < 0.04 || bm < 0.04) {
      continue
    }
    const cos = (ax * bx + ay * by) / (am * bm)
    if (previous >= -0.2 && cos < -0.2) {
      reversals += 1
    }
    previous = cos
  }
  return reversals
}

function polygonArea(points: readonly BoardPoint[]): number {
  let sum = 0
  for (let index = 0; index < points.length; index++) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    if (current === undefined || next === undefined) {
      continue
    }
    sum += current.x * next.y - next.x * current.y
  }
  return Math.abs(sum) / 2
}

function crossesInTheMiddle(
  left: readonly BoardPoint[],
  right: readonly BoardPoint[],
): boolean {
  let best = Number.POSITIVE_INFINITY
  let leftIndex = 0
  let rightIndex = 0
  for (let i = 0; i < left.length; i++) {
    const a = left[i]
    if (a === undefined) {
      continue
    }
    for (let j = 0; j < right.length; j++) {
      const b = right[j]
      if (b === undefined) {
        continue
      }
      const gap = distance(a, b)
      if (gap < best) {
        best = gap
        leftIndex = i
        rightIndex = j
      }
    }
  }
  if (best > 0.35) {
    return segmentsIntersect(left, right)
  }
  const leftFrac = leftIndex / Math.max(1, left.length - 1)
  const rightFrac = rightIndex / Math.max(1, right.length - 1)
  const mid = (frac: number) => frac > 0.15 && frac < 0.85
  return mid(leftFrac) && mid(rightFrac)
}

function segmentsIntersect(
  left: readonly BoardPoint[],
  right: readonly BoardPoint[],
): boolean {
  for (let i = 1; i < left.length; i++) {
    const a = left[i - 1]
    const b = left[i]
    if (a === undefined || b === undefined) {
      continue
    }
    for (let j = 1; j < right.length; j++) {
      const c = right[j - 1]
      const d = right[j]
      if (c === undefined || d === undefined) {
        continue
      }
      if (properCross(a, b, c, d)) {
        return true
      }
    }
  }
  return false
}

function properCross(
  a: BoardPoint,
  b: BoardPoint,
  c: BoardPoint,
  d: BoardPoint,
): boolean {
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  )
}

function cross(origin: BoardPoint, end: BoardPoint, point: BoardPoint): number {
  return (
    (end.x - origin.x) * (point.y - origin.y) -
    (end.y - origin.y) * (point.x - origin.x)
  )
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

function boxCenter(points: readonly BoardPoint[]): BoardPoint {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  if (!Number.isFinite(minX)) {
    return { x: 0, y: 0 }
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}

function span(stroke: readonly BoardPoint[]): number {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const point of stroke) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  if (!Number.isFinite(minX)) {
    return 0
  }
  return Math.hypot(maxX - minX, maxY - minY)
}
