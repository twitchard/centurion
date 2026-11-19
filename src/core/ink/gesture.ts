import { type CloudPoint, pdollarRecognize } from './pdollar'
import { GESTURE_TEMPLATES, type GestureName } from './templates'

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

/**
 * After the last stroke, wait this long with no new stroke, then send
 * the drawing. Two seconds leaves room to add a head or hit undo.
 */
export const COMMIT_IDLE_MS = 2000

/**
 * Below this $P score the cloud is not a confident arrow or circle,
 * so the strokes de-emphasize the area they cover.
 */
export const RECOGNITION_MIN_SCORE = 0.7

/** Strokes whose closest points are nearer than this belong to one gesture. */
const GROUP_DISTANCE = 0.85

const MIN_STROKE_LENGTH = 0.18

export interface RecognizedGesture {
  readonly name: GestureName
  readonly score: number
  readonly mark: InkMark
}

/**
 * Group every stroke in the drawing by proximity, then classify each
 * group with $P. A shaft and a separate arrowhead become one arrow
 * because they are one point cloud, whatever order they were drawn in.
 */
export function recognizeDrawing(
  strokes: readonly (readonly BoardPoint[])[],
): readonly RecognizedGesture[] {
  const usable = strokes.filter(
    (stroke) => pathLength(stroke) >= MIN_STROKE_LENGTH,
  )
  const groups = groupStrokes(usable)
  const recognized: RecognizedGesture[] = []
  for (const group of groups) {
    const cloud = toCloud(group)
    const match = pdollarRecognize(cloud, GESTURE_TEMPLATES)
    const name = gestureName(match?.name, match?.score ?? 0)
    recognized.push({
      name,
      score: match?.score ?? 0,
      mark: snapMark(name, group),
    })
  }
  return recognized
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

function gestureName(name: string | undefined, score: number): GestureName {
  if (score < RECOGNITION_MIN_SCORE) {
    return 'scribble'
  }
  if (name === 'arrow' || name === 'circle' || name === 'scribble') {
    return name
  }
  return 'scribble'
}

function snapMark(
  name: GestureName,
  strokes: readonly (readonly BoardPoint[])[],
): InkMark {
  if (name === 'arrow') {
    return snapArrow(strokes)
  }
  if (name === 'circle') {
    return snapCircle(strokes)
  }
  return { tag: 'scribble', points: strokes.flat() }
}

function snapArrow(strokes: readonly (readonly BoardPoint[])[]): InkMark {
  if (strokes.length === 1) {
    const stroke = strokes[0] ?? []
    const tail = stroke[0] ?? { x: 0, y: 0 }
    const head = stroke[stroke.length - 1] ?? tail
    return { tag: 'arrow', tail, head }
  }
  let shaft = strokes[0] ?? []
  let shaftLength = pathLength(shaft)
  for (const stroke of strokes) {
    const length = pathLength(stroke)
    if (length > shaftLength) {
      shaft = stroke
      shaftLength = length
    }
  }
  const headPoints = strokes.filter((stroke) => stroke !== shaft).flat()
  const headCenter = averagePoint(headPoints)
  const start = shaft[0] ?? headCenter
  const end = shaft[shaft.length - 1] ?? start
  if (distance(end, headCenter) <= distance(start, headCenter)) {
    return { tag: 'arrow', tail: start, head: end }
  }
  return { tag: 'arrow', tail: end, head: start }
}

function snapCircle(strokes: readonly (readonly BoardPoint[])[]): InkMark {
  const points = strokes.flat()
  const center = averagePoint(points)
  let radius = 0
  for (const point of points) {
    radius += distance(point, center)
  }
  radius = points.length === 0 ? 0 : radius / points.length
  return { tag: 'circle', center, radius: Math.max(radius, 0.35) }
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
  const unite = (left: number, right: number): void => {
    const a = find(left)
    const b = find(right)
    if (a !== b) {
      parent[b] = a
    }
  }
  for (let left = 0; left < strokes.length; left++) {
    for (let right = left + 1; right < strokes.length; right++) {
      if (strokesAreClose(strokes[left] ?? [], strokes[right] ?? [])) {
        unite(left, right)
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
  let best = Number.POSITIVE_INFINITY
  for (const a of left) {
    for (const b of right) {
      const gap = distance(a, b)
      if (gap < best) {
        best = gap
      }
      if (best <= GROUP_DISTANCE) {
        return true
      }
    }
  }
  return best <= GROUP_DISTANCE
}

function toCloud(strokes: readonly (readonly BoardPoint[])[]): CloudPoint[] {
  const points: CloudPoint[] = []
  for (let strokeId = 0; strokeId < strokes.length; strokeId++) {
    for (const point of strokes[strokeId] ?? []) {
      points.push({ x: point.x, y: point.y, strokeId })
    }
  }
  return points
}

function pathLength(points: readonly BoardPoint[]): number {
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
