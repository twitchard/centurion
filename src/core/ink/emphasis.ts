import { type BoardPoint, type InkMark, distance } from './gesture'

/** Log-space gain on a move's temperament weight. exp(±GAIN) is the soft cap. */
export const EMPHASIS_GAIN = 1.35

export function squareCenter(square: number): BoardPoint {
  return { x: (square & 7) + 0.5, y: (square >> 3) + 0.5 }
}

/**
 * Signed emphasis in [-1, 1]. Positive raises the move's weight in the
 * soldier's draw; negative (a scribble) lowers it. Several strokes stack
 * with diminishing return, and nothing is ever removed.
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
        positive += circleScore(mark.center, mark.radius, to)
        break
      case 'scribble':
        negative += scribbleScore(mark.points, to)
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

function circleScore(center: BoardPoint, radius: number, to: number): number {
  if (radius <= 0) {
    return 0
  }
  const dist = distance(squareCenter(to), center)
  if (dist >= radius) {
    return 0
  }
  return 1 - dist / radius
}

function scribbleScore(points: readonly BoardPoint[], to: number): number {
  const reach = 0.75
  const dest = squareCenter(to)
  let nearest = Number.POSITIVE_INFINITY
  for (const point of points) {
    const dist = distance(dest, point)
    if (dist < nearest) {
      nearest = dist
    }
  }
  if (nearest >= reach) {
    return 0
  }
  return 1 - nearest / reach
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
