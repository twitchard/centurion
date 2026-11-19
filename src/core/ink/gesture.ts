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
      readonly ink: number
    }
  | {
      readonly tag: 'circle'
      readonly center: BoardPoint
      readonly radius: number
      readonly ink: number
    }
  | {
      readonly tag: 'scribble'
      readonly points: readonly BoardPoint[]
      readonly ink: number
    }

export type StrokeResult =
  | { readonly tag: 'mark'; readonly mark: InkMark }
  | { readonly tag: 'reject'; readonly reason: string }

/** One board-width of stroke per turn. Emphasis is a budget, not a brush. */
export const INK_BUDGET = 8

const MIN_LENGTH = 0.45

export function inkUsed(marks: readonly InkMark[]): number {
  let total = 0
  for (const mark of marks) {
    total += mark.ink
  }
  return total
}

export function classifyStroke(
  points: readonly BoardPoint[],
  inkRemaining: number,
): StrokeResult {
  const path = downsample(points, 48)
  if (path.length < 2) {
    return { tag: 'reject', reason: 'Stroke too short' }
  }
  const length = pathLength(path)
  if (length < MIN_LENGTH) {
    return { tag: 'reject', reason: 'Stroke too short' }
  }
  if (length > inkRemaining + 1e-9) {
    return { tag: 'reject', reason: 'Not enough ink' }
  }

  const start = path[0]!
  const end = path[path.length - 1]!
  const chord = distance(start, end)
  const straightness = chord / length
  const closed = chord < Math.max(0.55, length * 0.22)
  const centroid = averagePoint(path)
  const area = Math.abs(shoelace(path))
  const radii = path.map((point) => distance(point, centroid))
  const meanR = average(radii)
  const variance = average(radii.map((radius) => (radius - meanR) ** 2))
  const spread = meanR > 1e-6 ? Math.sqrt(variance) / meanR : 1
  const crosses = selfIntersects(path)

  if (
    closed &&
    !crosses &&
    area > 0.45 &&
    meanR >= 0.45 &&
    meanR <= 3.6 &&
    spread < 0.42 &&
    length >= 1.6
  ) {
    return {
      tag: 'mark',
      mark: { tag: 'circle', center: centroid, radius: meanR, ink: length },
    }
  }
  if (!crosses && straightness >= 0.72 && chord >= 0.6) {
    return {
      tag: 'mark',
      mark: { tag: 'arrow', tail: start, head: end, ink: length },
    }
  }
  return { tag: 'mark', mark: { tag: 'scribble', points: path, ink: length } }
}

/**
 * A stroke that crosses an existing arrow is a cross: drop those arrows
 * and keep one scribble covering the ink already spent plus the new stroke.
 */
export function integrateMark(
  marks: readonly InkMark[],
  mark: InkMark,
): readonly InkMark[] {
  if (mark.tag === 'circle') {
    return [...marks, mark]
  }
  const stroke = mark.tag === 'arrow' ? [mark.tail, mark.head] : mark.points
  const crossed: InkMark[] = []
  for (const existing of marks) {
    if (existing.tag !== 'arrow') {
      continue
    }
    if (polylinesIntersect(stroke, [existing.tail, existing.head])) {
      crossed.push(existing)
    }
  }
  if (crossed.length === 0) {
    return [...marks, mark]
  }
  const points: BoardPoint[] = [...stroke]
  let ink = mark.ink
  for (const arrow of crossed) {
    if (arrow.tag !== 'arrow') {
      continue
    }
    points.push(arrow.tail, arrow.head)
    ink += arrow.ink
  }
  const scribble: InkMark = { tag: 'scribble', points, ink }
  const drop = new Set(crossed)
  return [...marks.filter((existing) => !drop.has(existing)), scribble]
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
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0
  }
  let total = 0
  for (const value of values) {
    total += value
  }
  return total / values.length
}

function averagePoint(points: readonly BoardPoint[]): BoardPoint {
  let x = 0
  let y = 0
  for (const point of points) {
    x += point.x
    y += point.y
  }
  return { x: x / points.length, y: y / points.length }
}

function pathLength(points: readonly BoardPoint[]): number {
  let total = 0
  for (let index = 1; index < points.length; index++) {
    total += distance(points[index - 1]!, points[index]!)
  }
  return total
}

function shoelace(points: readonly BoardPoint[]): number {
  let sum = 0
  for (let index = 0; index < points.length; index++) {
    const next = points[(index + 1) % points.length]!
    const current = points[index]!
    sum += current.x * next.y - next.x * current.y
  }
  return sum / 2
}

function downsample(points: readonly BoardPoint[], max: number): BoardPoint[] {
  if (points.length <= max) {
    return [...points]
  }
  const sampled: BoardPoint[] = []
  const last = points.length - 1
  for (let index = 0; index < max; index++) {
    const source = Math.round((index / (max - 1)) * last)
    sampled.push(points[source]!)
  }
  return sampled
}

function selfIntersects(points: readonly BoardPoint[]): boolean {
  return polylinesIntersect(points, points, true)
}

function polylinesIntersect(
  left: readonly BoardPoint[],
  right: readonly BoardPoint[],
  skipNear = false,
): boolean {
  for (let i = 1; i < left.length; i++) {
    for (let j = 1; j < right.length; j++) {
      if (skipNear && Math.abs(i - j) <= 1) {
        continue
      }
      if (segmentsIntersect(left[i - 1]!, left[i]!, right[j - 1]!, right[j]!)) {
        return true
      }
    }
  }
  return false
}

function segmentsIntersect(
  a: BoardPoint,
  b: BoardPoint,
  c: BoardPoint,
  d: BoardPoint,
): boolean {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const cdx = d.x - c.x
  const cdy = d.y - c.y
  const denom = abx * cdy - aby * cdx
  if (Math.abs(denom) < 1e-9) {
    return false
  }
  const acx = c.x - a.x
  const acy = c.y - a.y
  const t = (acx * cdy - acy * cdx) / denom
  const u = (acx * aby - acy * abx) / denom
  const eps = 1e-6
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps
}
