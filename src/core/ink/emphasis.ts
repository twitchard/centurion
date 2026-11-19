import { type BoardPoint, type InkMark, distance } from './gesture'

/** Log-space gain on a move's temperament weight. exp(±GAIN) is the soft cap. */
export const EMPHASIS_GAIN = 1.35

export function squareCenter(square: number): BoardPoint {
  return { x: (square & 7) + 0.5, y: (square >> 3) + 0.5 }
}

/**
 * Signed emphasis in [-1, 1]. Positive raises the move's weight in the
 * soldier's draw; negative (a scribble or an X) lowers it. Several strokes
 * stack with diminishing return, and nothing is ever removed.
 */
export function emphasisPull(
  marks: readonly InkMark[],
  from: number,
  to: number,
): number {
  let positive = 0
  let negative = 0
  for (const mark of marks) {
    switch (mark.tag) {
      case 'arrow':
        positive += arrowScore(mark.tail, mark.head, from, to)
        break
      case 'circle':
        positive += circleScore(mark.outline, to)
        break
      case 'scribble':
        negative += coveredScore(mark.points, to)
        break
      case 'x':
        negative += coveredScore(mark.strokes.flat(), to)
        break
    }
  }
  const boost = 1 - Math.exp(-2.2 * positive)
  const cut = 1 - Math.exp(-2.2 * negative)
  return boost - cut
}

/** Multiplier applied to a temperament weight. Always finite and positive. */
export function emphasisFactor(
  marks: readonly InkMark[],
  from: number,
  to: number,
): number {
  return Math.exp(EMPHASIS_GAIN * emphasisPull(marks, from, to))
}

function arrowScore(
  tail: BoardPoint,
  head: BoardPoint,
  from: number,
  to: number,
): number {
  const origin = squareCenter(from)
  const dest = squareCenter(to)
  const moveX = dest.x - origin.x
  const moveY = dest.y - origin.y
  const arrowX = head.x - tail.x
  const arrowY = head.y - tail.y
  const moveLen = Math.hypot(moveX, moveY)
  const arrowLen = Math.hypot(arrowX, arrowY)
  if (moveLen < 1e-6 || arrowLen < 1e-6) {
    return 0
  }
  const cos = (moveX * arrowX + moveY * arrowY) / (moveLen * arrowLen)
  if (cos <= 0) {
    return 0
  }
  const tailDist = distance(origin, tail)
  const tailNear = Math.exp(-(tailDist * tailDist) / (2 * 1.5 * 1.5))
  const shaftDist = pointSegmentDistance(origin, tail, head)
  const shaftNear = Math.exp(-(shaftDist * shaftDist) / (2 * 1.1 * 1.1))
  const proximity = Math.max(tailNear, shaftNear * 0.45)
  return cos * proximity
}

/** 1 when the destination square's center sits inside the drawn outline. */
function circleScore(outline: readonly BoardPoint[], to: number): number {
  if (outline.length < 3) {
    return 0
  }
  return pointInPolygon(squareCenter(to), outline) ? 1 : 0
}

/** 1 when the ink actually enters the destination square. */
function coveredScore(points: readonly BoardPoint[], to: number): number {
  return coversSquare(points, to) ? 1 : 0
}

function coversSquare(points: readonly BoardPoint[], square: number): boolean {
  const file = square & 7
  const rank = square >> 3
  for (let index = 0; index < points.length; index++) {
    const point = points[index]
    if (point === undefined) {
      continue
    }
    if (pointInSquare(point, file, rank)) {
      return true
    }
    const previous = points[index - 1]
    if (
      previous !== undefined &&
      segmentHitsSquare(previous, point, file, rank)
    ) {
      return true
    }
  }
  return false
}

function pointInSquare(point: BoardPoint, file: number, rank: number): boolean {
  const x1 = file === 7 ? 8.001 : file + 1
  const y1 = rank === 7 ? 8.001 : rank + 1
  return point.x >= file && point.x < x1 && point.y >= rank && point.y < y1
}

function segmentHitsSquare(
  a: BoardPoint,
  b: BoardPoint,
  file: number,
  rank: number,
): boolean {
  const x0 = file
  const y0 = rank
  const x1 = file + 1
  const y1 = rank + 1
  return (
    segmentsCross(a, b, { x: x0, y: y0 }, { x: x1, y: y0 }) ||
    segmentsCross(a, b, { x: x1, y: y0 }, { x: x1, y: y1 }) ||
    segmentsCross(a, b, { x: x1, y: y1 }, { x: x0, y: y1 }) ||
    segmentsCross(a, b, { x: x0, y: y1 }, { x: x0, y: y0 })
  )
}

function segmentsCross(
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

function pointInPolygon(
  point: BoardPoint,
  polygon: readonly BoardPoint[],
): boolean {
  let inside = false
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index++
  ) {
    const current = polygon[index]
    const prior = polygon[previous]
    if (current === undefined || prior === undefined) {
      continue
    }
    const crosses =
      current.y > point.y !== prior.y > point.y &&
      point.x <
        ((prior.x - current.x) * (point.y - current.y)) /
          (prior.y - current.y) +
          current.x
    if (crosses) {
      inside = !inside
    }
  }
  return inside
}

function pointSegmentDistance(
  point: BoardPoint,
  start: BoardPoint,
  end: BoardPoint,
): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-9) {
    return distance(point, start)
  }
  const t = Math.min(
    1,
    Math.max(0, ((point.x - start.x) * dx + (point.y - start.y) * dy) / len2),
  )
  return distance(point, { x: start.x + t * dx, y: start.y + t * dy })
}
